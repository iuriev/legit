import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { GenerationError } from '../src/jobs/generation-error';
import type { ClaimedJob, JobCommit, JobHandler } from '../src/jobs/job-handlers';
import { createCv, register, resetDatabase, waitFor } from './helpers';
import { createTestApp } from './test-app';

interface JobRow {
  status: string;
  attempts: number;
  last_error: string | null;
  locked_until: Date | null;
}
interface CvRow {
  state: string;
  stage: string | null;
  failure_code: string | null;
}

/** What a real stage does at the end: writes its results and the next state. */
const moveToAwaitingAnswers =
  (cvId: string): JobCommit =>
  async (manager) => {
    await manager.query(`UPDATE cvs SET state = 'awaiting_answers', stage = NULL WHERE id = $1`, [
      cvId,
    ]);
  };

/** A handler result that the test settles when it chooses. */
function deferred() {
  let resolve!: (commit: JobCommit) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<JobCommit>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Job runner (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let cookie: string;
  /** Replaced by each test; the application calls whatever is here. */
  let handler: JobHandler;
  let calls: ClaimedJob[];

  const job = async (cvId: string) =>
    (
      await dataSource.query<JobRow[]>(
        `SELECT status, attempts, last_error, locked_until FROM generation_jobs WHERE cv_id = $1`,
        [cvId],
      )
    )[0];
  const cv = async (cvId: string) =>
    (
      await dataSource.query<CvRow[]>(`SELECT state, stage, failure_code FROM cvs WHERE id = $1`, [
        cvId,
      ])
    )[0];
  const sourceCount = async (cvId: string) =>
    Number(
      (
        await dataSource.query<{ count: string }[]>(
          `SELECT count(*) FROM cv_sources WHERE cv_id = $1`,
          [cvId],
        )
      )[0]?.count,
    );
  const expireLease = (cvId: string) =>
    dataSource.query(
      `UPDATE generation_jobs SET locked_until = now() - interval '1 second' WHERE cv_id = $1`,
      [cvId],
    );
  const pause = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const finished = (cvId: string) =>
    waitFor(async () => {
      const row = await job(cvId);
      return row && (row.status === 'done' || row.status === 'failed') ? row : undefined;
    });

  beforeAll(async () => {
    app = await createTestApp({
      jobHandlers: {
        extract: (claimed) => {
          calls.push(claimed);
          return handler(claimed);
        },
      },
    });
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    calls = [];
    handler = (claimed) => Promise.resolve(moveToAwaitingAnswers(claimed.cvId));
    cookie = (await register(app, 'owner@example.com')).cookie;
  });

  afterEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs a queued job once and applies its result together with finishing it', async () => {
    const cvId = await createCv(app, cookie);

    const done = await finished(cvId);

    expect(done).toMatchObject({ status: 'done', attempts: 1, locked_until: null });
    expect(await cv(cvId)).toMatchObject({ state: 'awaiting_answers' });
    // Give the poller time to show that it does not pick the job up again.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls).toEqual([
      { id: expect.any(String) as string, cvId, kind: 'extract', attempts: 1 },
    ]);
  });

  it('leaves nothing behind when the result cannot be written', async () => {
    handler = (claimed) =>
      Promise.resolve(async (manager) => {
        await moveToAwaitingAnswers(claimed.cvId)(manager);
        throw new Error('the last write failed');
      });
    const cvId = await createCv(app, cookie);

    const failed = await finished(cvId);

    // Three attempts, each rolled back as a whole; the CV never left "generating" on the way.
    expect(failed).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await cv(cvId)).toEqual({
      state: 'failed',
      stage: null,
      failure_code: 'generation_failed',
    });
  });

  it('claims a job again when its lease has run out, as after a crash', async () => {
    let release: (() => void) | undefined;
    // The first worker "dies": the job stays running and its lease expires.
    handler = (claimed) =>
      claimed.attempts === 1
        ? new Promise<JobCommit>((resolve) => {
            release = () => {
              resolve(moveToAwaitingAnswers(claimed.cvId));
            };
          })
        : Promise.resolve(moveToAwaitingAnswers(claimed.cvId));
    const cvId = await createCv(app, cookie);
    await waitFor(async () => (await job(cvId))?.status === 'running');

    await dataSource.query(
      `UPDATE generation_jobs SET locked_until = now() - interval '1 second' WHERE cv_id = $1`,
      [cvId],
    );

    const done = await finished(cvId);
    expect(done).toMatchObject({ status: 'done', attempts: 2 });
    expect(await cv(cvId)).toMatchObject({ state: 'awaiting_answers' });

    // The first worker turns out to be alive and finishes late: its result is discarded.
    await dataSource.query(`UPDATE cvs SET state = 'generating', stage = 'reading' WHERE id = $1`, [
      cvId,
    ]);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await cv(cvId)).toMatchObject({ state: 'generating' });
    expect(await job(cvId)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('ignores a failure reported by a worker that has lost its claim', async () => {
    const first = deferred();
    const second = deferred();
    handler = (claimed) => (claimed.attempts === 1 ? first.promise : second.promise);
    const cvId = await createCv(app, cookie);
    await waitFor(async () => (await job(cvId))?.status === 'running');
    await expireLease(cvId);
    await waitFor(async () => (await job(cvId))?.attempts === 2);

    // The first worker fails late. Re-queueing now would start a third run
    // next to the second one.
    first.reject(new GenerationError('service_unavailable', true, 'late failure'));
    await pause();

    expect(await job(cvId)).toMatchObject({ status: 'running', attempts: 2, last_error: null });
    expect(calls).toHaveLength(2);
    second.resolve(moveToAwaitingAnswers(cvId));
    expect(await finished(cvId)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('discards a result delivered by a worker that has lost its claim', async () => {
    const first = deferred();
    const second = deferred();
    handler = (claimed) => (claimed.attempts === 1 ? first.promise : second.promise);
    const cvId = await createCv(app, cookie);
    await waitFor(async () => (await job(cvId))?.status === 'running');
    await expireLease(cvId);
    await waitFor(async () => (await job(cvId))?.attempts === 2);

    // The first worker succeeds late, while its replacement is still working.
    first.resolve(moveToAwaitingAnswers(cvId));
    await pause();

    expect(await job(cvId)).toMatchObject({ status: 'running', attempts: 2 });
    expect(await cv(cvId)).toMatchObject({ state: 'generating' });
    second.resolve(moveToAwaitingAnswers(cvId));
    expect(await finished(cvId)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('lets a CV be deleted while its result is being written', async () => {
    handler = (claimed) =>
      Promise.resolve(async (manager) => {
        await manager.query(`SELECT pg_sleep(0.4)`);
        await moveToAwaitingAnswers(claimed.cvId)(manager);
      });
    const cvId = await createCv(app, cookie);
    await waitFor(() => Promise.resolve(calls.length === 1));
    await pause(100);

    // The delete waits for the write instead of deadlocking with it.
    await request(app.getHttpServer()).delete(`/api/cvs/${cvId}`).set('Cookie', cookie).expect(204);

    expect(await cv(cvId)).toBeUndefined();
    expect(await job(cvId)).toBeUndefined();
  });

  it('fails a queued job that has no attempt left, so its CV does not wait forever', async () => {
    const blocked = deferred();
    handler = () => blocked.promise;
    const cvId = await createCv(app, cookie);
    await waitFor(async () => (await job(cvId))?.status === 'running');
    calls = [];

    // As after a restart with fewer attempts configured than the job has used.
    await dataSource.query(
      `UPDATE generation_jobs SET status = 'queued', attempts = 3, locked_until = NULL
        WHERE cv_id = $1`,
      [cvId],
    );

    expect(await finished(cvId)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await cv(cvId)).toMatchObject({ state: 'failed', failure_code: 'generation_failed' });
    expect(calls).toHaveLength(0);
    blocked.resolve(moveToAwaitingAnswers(cvId));
  });

  it('keeps the source for a failure that can be retried and drops it for one that cannot', async () => {
    handler = () => Promise.reject(new GenerationError('service_unavailable', true, 'overloaded'));
    const retryable = await createCv(app, cookie);
    await finished(retryable);
    expect(await sourceCount(retryable)).toBe(1);

    handler = () => Promise.reject(new GenerationError('no_readable_text', false, 'no citations'));
    const permanent = await createCv(app, cookie);
    await finished(permanent);
    expect(await sourceCount(permanent)).toBe(0);
  });

  it('retries a transient failure and completes without showing a failure', async () => {
    handler = (claimed) =>
      claimed.attempts === 1
        ? Promise.reject(new GenerationError('service_unavailable', true, 'overloaded'))
        : Promise.resolve(moveToAwaitingAnswers(claimed.cvId));
    const cvId = await createCv(app, cookie);

    const done = await finished(cvId);

    expect(done).toMatchObject({ status: 'done', attempts: 2 });
    expect(await cv(cvId)).toMatchObject({ state: 'awaiting_answers', failure_code: null });
    expect(calls.map((claimed) => claimed.attempts)).toEqual([1, 2]);
  });

  it('keeps the CV generating between attempts', async () => {
    let seenBetweenAttempts: CvRow | undefined;
    handler = async (claimed) => {
      if (claimed.attempts === 1) {
        throw new GenerationError('service_unavailable', true, 'overloaded');
      }
      seenBetweenAttempts = await cv(claimed.cvId);
      return moveToAwaitingAnswers(claimed.cvId);
    };
    const cvId = await createCv(app, cookie);

    await finished(cvId);

    expect(seenBetweenAttempts).toEqual({
      state: 'generating',
      stage: 'reading',
      failure_code: null,
    });
  });

  it('fails the CV with the reason of the failure after three attempts', async () => {
    handler = () => Promise.reject(new GenerationError('service_unavailable', true, 'overloaded'));
    const cvId = await createCv(app, cookie);

    const failed = await finished(cvId);

    expect(failed).toMatchObject({ status: 'failed', attempts: 3, locked_until: null });
    expect(failed.last_error).toContain('overloaded');
    expect(await cv(cvId)).toEqual({
      state: 'failed',
      stage: null,
      failure_code: 'service_unavailable',
    });
    expect(calls).toHaveLength(3);
  });

  it('fails at once, without further attempts, when a retry cannot help', async () => {
    handler = () => Promise.reject(new GenerationError('no_readable_text', false, 'no citations'));
    const cvId = await createCv(app, cookie);

    const failed = await finished(cvId);

    expect(failed).toMatchObject({ status: 'failed', attempts: 1 });
    expect(await cv(cvId)).toMatchObject({ state: 'failed', failure_code: 'no_readable_text' });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls).toHaveLength(1);
  });

  it('retries an error nobody classified and then fails with a generic reason', async () => {
    handler = () => Promise.reject(new TypeError('x is not a function'));
    const cvId = await createCv(app, cookie);

    const failed = await finished(cvId);

    expect(failed).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await cv(cvId)).toMatchObject({ state: 'failed', failure_code: 'generation_failed' });
  });

  it('fails a job whose last attempt was interrupted instead of running it a fourth time', async () => {
    let release: (() => void) | undefined;
    handler = (claimed) =>
      new Promise<JobCommit>((resolve) => {
        release = () => {
          resolve(moveToAwaitingAnswers(claimed.cvId));
        };
      });
    const cvId = await createCv(app, cookie);
    await waitFor(async () => (await job(cvId))?.status === 'running');
    calls = [];

    await dataSource.query(
      `UPDATE generation_jobs SET attempts = 3, locked_until = now() - interval '1 second'
        WHERE cv_id = $1`,
      [cvId],
    );

    const failed = await finished(cvId);
    expect(failed).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await cv(cvId)).toMatchObject({ state: 'failed', failure_code: 'generation_failed' });
    expect(calls).toHaveLength(0);
    release?.();
  });

  it('survives the deletion of a CV whose job is running', async () => {
    let release: (() => void) | undefined;
    handler = (claimed) =>
      new Promise<JobCommit>((resolve) => {
        release = () => {
          resolve(moveToAwaitingAnswers(claimed.cvId));
        };
      });
    const first = await createCv(app, cookie);
    await waitFor(async () => (await job(first))?.status === 'running');

    await dataSource.query(`DELETE FROM cvs WHERE id = $1`, [first]);
    release?.();

    // The runner is still working: the next CV goes through.
    handler = (claimed) => Promise.resolve(moveToAwaitingAnswers(claimed.cvId));
    const second = await createCv(app, cookie);
    expect(await finished(second)).toMatchObject({ status: 'done' });
  });

  it('does not run a job before its retry time', async () => {
    const cvId = await createCv(app, cookie);
    await finished(cvId);
    calls = [];

    await dataSource.query(
      `INSERT INTO generation_jobs (cv_id, kind, run_after) VALUES ($1, 'extract', now() + interval '1 hour')`,
      [cvId],
    );
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(calls).toHaveLength(0);
  });

  it('gives a job to only one of two workers', async () => {
    const secondCalls: ClaimedJob[] = [];
    const second = await createTestApp({
      jobHandlers: {
        extract: (claimed) => {
          secondCalls.push(claimed);
          return Promise.resolve(moveToAwaitingAnswers(claimed.cvId));
        },
      },
    });

    try {
      const users = await Promise.all(
        Array.from({ length: 6 }, (_unused, index) =>
          register(app, `worker-${String(index)}@example.com`),
        ),
      );
      const cvIds = await Promise.all(users.map((user) => createCv(app, user.cookie)));
      await Promise.all(cvIds.map((cvId) => finished(cvId)));

      const claimedIds = [...calls, ...secondCalls].map((claimed) => claimed.cvId).sort();
      expect(claimedIds).toEqual([...cvIds].sort());
    } finally {
      await second.close();
    }
  });
});
