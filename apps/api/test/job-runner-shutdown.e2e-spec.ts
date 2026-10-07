import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import type { JobCommit } from '../src/jobs/job-handlers';
import { createCv, register, resetDatabase, waitFor } from './helpers';
import { createTestApp } from './test-app';

describe('Job runner shutdown (e2e)', () => {
  let observer: INestApplication<App> | undefined;

  afterEach(async () => {
    if (observer) {
      await resetDatabase(observer);
      await observer.close();
    }
  });

  it('hands a job that is still running back to the queue without counting the attempt', async () => {
    // A model call that outlasts the shutdown.
    const app: INestApplication<App> = await createTestApp({
      jobHandlers: { extract: () => new Promise<JobCommit>(() => undefined) },
    });
    const dataSource = app.get(DataSource);
    const cookie = (await register(app, 'owner@example.com')).cookie;
    const cvId = await createCv(app, cookie);
    const job = async () =>
      (
        await dataSource.query<{ status: string; attempts: number; locked_until: Date | null }[]>(
          `SELECT status, attempts, locked_until FROM generation_jobs WHERE cv_id = $1`,
          [cvId],
        )
      )[0];
    await waitFor(async () => (await job())?.status === 'running');

    const startedAt = Date.now();
    await app.close();

    // It does not wait for the call, and the next start can pick the job up at once.
    expect(Date.now() - startedAt).toBeLessThan(3000);
    let claimedAgain = false;
    observer = await createTestApp({
      jobHandlers: {
        extract: (claimed) => {
          claimedAgain = claimed.attempts === 1;
          return Promise.resolve(async (manager) => {
            await manager.query(
              `UPDATE cvs SET state = 'awaiting_answers', stage = NULL WHERE id = $1`,
              [claimed.cvId],
            );
          });
        },
      },
    });
    const observerData = observer.get(DataSource);
    await waitFor(async () => {
      const [row] = await observerData.query<{ status: string }[]>(
        `SELECT status FROM generation_jobs WHERE cv_id = $1`,
        [cvId],
      );
      return row?.status === 'done';
    });
    expect(claimedAgain).toBe(true);
  });
});
