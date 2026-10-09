import type { ApiErrorBody, Cv, CvSummary } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { MAX_CVS_PER_USER } from '../src/cvs/cvs.service';
import { JobRunner } from '../src/jobs/job-runner';
import { createCv, PDF_BYTES, register, resetDatabase, type Session } from './helpers';
import { createTestApp } from './test-app';

const ROLE = 'Senior Backend Engineer';

describe('CVs (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: Session;

  const http = () => request(app.getHttpServer());
  const post = (cookie = owner.cookie) => http().post('/api/cvs').set('Cookie', cookie);
  const count = async (table: string) =>
    Number(
      (await dataSource.query<{ count: string }[]>(`SELECT count(*) FROM ${table}`))[0]?.count,
    );
  const code = (response: request.Response) => (response.body as ApiErrorBody).code;
  /** Puts a CV into a state that only the worker would normally produce. */
  const fail = async (id: string, failureCode: string, jobKind = 'extract') => {
    await dataSource.query(
      `UPDATE cvs SET state = 'failed', stage = NULL, failure_code = $2 WHERE id = $1`,
      [id, failureCode],
    );
    await dataSource.query(
      `UPDATE generation_jobs SET status = 'failed', kind = $2, attempts = 3 WHERE cv_id = $1`,
      [id, jobKind],
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    // These tests are about the HTTP API; the worker has its own.
    await app.get(JobRunner).stop();
  });

  beforeEach(async () => {
    owner = await register(app, 'owner@example.com');
  });

  afterEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('starting a CV', () => {
    it('accepts a PDF and a target role and answers before any generation has run', async () => {
      const response = await post()
        .field('targetRole', ROLE)
        .attach('file', PDF_BYTES, { filename: 'cv.pdf', contentType: 'application/pdf' })
        .expect(201);

      const { id } = response.body as { id: string };
      const cv = (await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(200))
        .body as Cv;
      expect(cv).toMatchObject({
        id,
        targetRole: ROLE,
        state: 'generating',
        stage: 'reading',
        failure: null,
        questions: [],
        document: null,
        omittedCount: 0,
        version: 0,
      });
      const [source] = await dataSource.query<{ kind: string; pdf: Buffer; text: string | null }[]>(
        `SELECT kind, pdf, text FROM cv_sources WHERE cv_id = $1`,
        [id],
      );
      expect(source?.kind).toBe('pdf');
      expect(source?.pdf.equals(PDF_BYTES)).toBe(true);
      const jobs = await dataSource.query<{ kind: string; status: string; attempts: number }[]>(
        `SELECT kind, status, attempts FROM generation_jobs WHERE cv_id = $1`,
        [id],
      );
      expect(jobs).toEqual([{ kind: 'extract', status: 'queued', attempts: 0 }]);
    });

    it('accepts pasted text and a target role', async () => {
      const response = await post()
        .field('targetRole', `  ${ROLE}  `)
        .field('text', '  Five years of Node.js at Acme.  ')
        .expect(201);

      const { id } = response.body as { id: string };
      const [cv] = await dataSource.query<{ target_role: string; state: string }[]>(
        `SELECT target_role, state FROM cvs WHERE id = $1`,
        [id],
      );
      expect(cv).toEqual({ target_role: ROLE, state: 'generating' });
      const [source] = await dataSource.query<{ kind: string; text: string }[]>(
        `SELECT kind, text FROM cv_sources WHERE cv_id = $1`,
        [id],
      );
      expect(source).toEqual({ kind: 'text', text: 'Five years of Node.js at Acme.' });
    });

    it('accepts a file sent with an empty text field', async () => {
      await post()
        .field('targetRole', ROLE)
        .field('text', '')
        .attach('file', PDF_BYTES, 'cv.pdf')
        .expect(201);
    });

    it('rejects both a file and text', async () => {
      const response = await post()
        .field('targetRole', ROLE)
        .field('text', 'Five years of Node.js.')
        .attach('file', PDF_BYTES, 'cv.pdf')
        .expect(400);

      expect(code(response)).toBe('invalid_source');
      expect(await count('cvs')).toBe(0);
    });

    it('rejects a request with neither a file nor text', async () => {
      const response = await post().field('targetRole', ROLE).expect(400);

      expect(code(response)).toBe('invalid_source');
      expect(await count('cvs')).toBe(0);
    });

    it('rejects text that is only whitespace as an empty source', async () => {
      const response = await post().field('targetRole', ROLE).field('text', '   \n ').expect(400);

      expect(code(response)).toBe('invalid_source');
      expect(await count('cvs')).toBe(0);
    });
  });

  describe('input limits', () => {
    it('rejects a file that is not a PDF, whatever its name and declared type', async () => {
      const response = await post()
        .field('targetRole', ROLE)
        .attach('file', Buffer.from('PK\u0003\u0004 this is a zip'), {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(code(response)).toBe('invalid_source');
      expect((response.body as ApiErrorBody).message).toMatch(/PDF/);
      expect(await count('cvs')).toBe(0);
    });

    it('rejects a file that only contains the PDF marker further in', async () => {
      await post()
        .field('targetRole', ROLE)
        .attach('file', Buffer.from('<script>alert(1)</script> %PDF-1.7'), 'cv.pdf')
        .expect(400);

      expect(await count('cvs')).toBe(0);
    });

    it('drops the NUL character, which the database cannot store, instead of failing', async () => {
      const response = await post()
        .field('targetRole', 'Back\u0000end Engineer')
        .field('text', 'Five years\u0000 of Node.js.')
        .expect(201);

      const { id } = response.body as { id: string };
      const [row] = await dataSource.query<{ target_role: string; text: string }[]>(
        `SELECT cvs.target_role, cv_sources.text FROM cvs JOIN cv_sources ON cv_id = id WHERE id = $1`,
        [id],
      );
      expect(row).toEqual({ target_role: 'Backend Engineer', text: 'Five years of Node.js.' });
    });

    it('rejects an empty file', async () => {
      await post().field('targetRole', ROLE).attach('file', Buffer.alloc(0), 'cv.pdf').expect(400);

      expect(await count('cvs')).toBe(0);
    });

    it('rejects a PDF larger than 5 MB and states the limit', async () => {
      const tooLarge = Buffer.concat([PDF_BYTES, Buffer.alloc(5 * 1024 * 1024)]);

      const response = await post()
        .field('targetRole', ROLE)
        .attach('file', tooLarge, 'cv.pdf')
        .expect(413);

      expect(code(response)).toBe('payload_too_large');
      expect((response.body as ApiErrorBody).message).toMatch(/5 MB/);
      expect(await count('cvs')).toBe(0);
    });

    it('accepts a PDF of exactly 5 MB', async () => {
      const atLimit = Buffer.concat([PDF_BYTES, Buffer.alloc(5 * 1024 * 1024 - PDF_BYTES.length)]);

      await post().field('targetRole', ROLE).attach('file', atLimit, 'cv.pdf').expect(201);
    });

    it('rejects text longer than 30,000 characters', async () => {
      const response = await post()
        .field('targetRole', ROLE)
        .field('text', 'a'.repeat(30_001))
        .expect(400);

      expect(code(response)).toBe('validation_failed');
      expect(await count('cvs')).toBe(0);
    });

    it('accepts text of exactly 30,000 characters that take four bytes each', async () => {
      await post().field('targetRole', ROLE).field('text', '😀'.repeat(15_000)).expect(201);
    });

    it('counts a line break sent by a browser as one character', async () => {
      // 15,000 lines of one character: 29,999 characters, and 44,998 as a browser sends them.
      const text = Array.from({ length: 15_000 }, () => 'a').join('\r\n');

      await post().field('targetRole', ROLE).field('text', text).expect(201);
    });

    it('rejects a second file', async () => {
      const response = await post()
        .field('targetRole', ROLE)
        .attach('file', PDF_BYTES, 'cv.pdf')
        .attach('file', PDF_BYTES, 'other.pdf')
        .expect(400);

      expect(code(response)).toBe('invalid_source');
      expect(await count('cvs')).toBe(0);
    });

    it.each([
      ['a missing target role', undefined],
      ['an empty target role', '   '],
      ['a target role longer than 120 characters', 'a'.repeat(121)],
    ])('rejects %s', async (_name, targetRole) => {
      const pending = post().field('text', 'Five years of Node.js.');
      const response = await (
        targetRole === undefined ? pending : pending.field('targetRole', targetRole)
      ).expect(400);

      expect(code(response)).toBe('validation_failed');
      expect(await count('cvs')).toBe(0);
    });
  });

  describe('one generation at a time', () => {
    it('rejects a second start while one is running', async () => {
      await createCv(app, owner.cookie);

      const response = await post().field('targetRole', ROLE).field('text', 'More.').expect(409);

      expect(code(response)).toBe('generation_running');
      expect(await count('cvs')).toBe(1);
    });

    it('lets only one of two simultaneous starts through', async () => {
      const start = () => post().field('targetRole', ROLE).field('text', 'Five years.');

      const statuses = (await Promise.all([start(), start()])).map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409]);
      expect(await count('cvs')).toBe(1);
      expect(await count('generation_jobs')).toBe(1);
    });

    it('allows a new start once the first one waits for answers, and for another user', async () => {
      const first = await createCv(app, owner.cookie);
      const other = await register(app, 'other@example.com');
      await createCv(app, other.cookie);

      await dataSource.query(
        `UPDATE cvs SET state = 'awaiting_answers', stage = NULL WHERE id = $1`,
        [first],
      );

      await createCv(app, owner.cookie);
    });
  });

  describe('storage limit', () => {
    it('rejects a new CV when the user already keeps the maximum', async () => {
      await dataSource.query(
        `INSERT INTO cvs (user_id, target_role, state)
         SELECT $1, 'Role ' || n, 'awaiting_answers' FROM generate_series(1, $2) AS n`,
        [owner.body.user.id, MAX_CVS_PER_USER],
      );

      const response = await post().field('targetRole', ROLE).field('text', 'More.').expect(409);

      expect(code(response)).toBe('cv_limit_reached');
      expect(await count('cvs')).toBe(MAX_CVS_PER_USER);
    });
  });

  describe('listing, reading and deleting', () => {
    it('lists the CVs of the user newest first', async () => {
      const older = await createCv(app, owner.cookie, 'Backend Engineer');
      await dataSource.query(
        `UPDATE cvs SET state = 'awaiting_answers', stage = NULL,
                created_at = now() - interval '1 hour' WHERE id = $1`,
        [older],
      );
      const newer = await createCv(app, owner.cookie, 'Data Engineer');

      const response = await http().get('/api/cvs').set('Cookie', owner.cookie).expect(200);

      const list = response.body as CvSummary[];
      expect(list.map((cv) => cv.id)).toEqual([newer, older]);
      expect(list[0]).toEqual({
        id: newer,
        targetRole: 'Data Engineer',
        state: 'generating',
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
    });

    it('shows each user only their own CVs', async () => {
      const mine = await createCv(app, owner.cookie);
      const other = await register(app, 'other@example.com');
      const theirs = await createCv(app, other.cookie);

      const myList = (await http().get('/api/cvs').set('Cookie', owner.cookie)).body as CvSummary[];
      const theirList = (await http().get('/api/cvs').set('Cookie', other.cookie))
        .body as CvSummary[];

      expect(myList.map((cv) => cv.id)).toEqual([mine]);
      expect(theirList.map((cv) => cv.id)).toEqual([theirs]);
    });

    it('explains a failure in plain language and says whether it can be retried', async () => {
      const id = await createCv(app, owner.cookie);
      await fail(id, 'no_readable_text');

      const cv = (await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(200))
        .body as Cv;

      expect(cv.state).toBe('failed');
      expect(cv.failure).toEqual({
        code: 'no_readable_text',
        message: expect.stringMatching(/paste the text/) as string,
        retryable: false,
      });
    });

    it('shows the open questions while the CV waits for answers', async () => {
      const id = await createCv(app, owner.cookie);
      await dataSource.query(
        `UPDATE cvs SET state = 'awaiting_answers', stage = NULL WHERE id = $1`,
        [id],
      );
      await dataSource.query(
        `INSERT INTO questions (cv_id, position, section, text) VALUES
           ($1, 2, 'contact', 'What is your phone number?'),
           ($1, 1, 'experience', 'When did you work at Acme?')`,
        [id],
      );

      const cv = (await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(200))
        .body as Cv;

      expect(cv.questions).toEqual([
        {
          id: expect.any(String) as string,
          section: 'experience',
          text: 'When did you work at Acme?',
        },
        {
          id: expect.any(String) as string,
          section: 'contact',
          text: 'What is your phone number?',
        },
      ]);
    });

    it('deletes a CV with its source, jobs, questions and facts', async () => {
      const id = await createCv(app, owner.cookie);
      const [question] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO questions (cv_id, position, section, text, status, answer)
         VALUES ($1, 1, 'contact', 'Phone?', 'answered', '555') RETURNING id`,
        [id],
      );
      await dataSource.query(
        `INSERT INTO facts (cv_id, ref, origin, quote, question_id) VALUES
           ($1, 1, 'source', 'Five years of Node.js at Acme.', NULL),
           ($1, 2, 'answer', '555', $2)`,
        [id, question?.id],
      );

      await http().delete(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(204);

      await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(404);
      expect((await http().get('/api/cvs').set('Cookie', owner.cookie)).body).toEqual([]);
      expect(await count('cv_sources')).toBe(0);
      expect(await count('generation_jobs')).toBe(0);
      expect(await count('questions')).toBe(0);
      expect(await count('facts')).toBe(0);
    });

    it('answers an unknown and a malformed identifier as not found', async () => {
      const unknown = await http()
        .get('/api/cvs/0b9f6f0e-3a51-4c0e-9d1b-6a8f0f5f2c11')
        .set('Cookie', owner.cookie)
        .expect(404);
      const malformed = await http()
        .get('/api/cvs/not-a-uuid')
        .set('Cookie', owner.cookie)
        .expect(404);

      expect(unknown.body).toEqual(malformed.body);
      expect(code(unknown)).toBe('not_found');
    });
  });

  describe('manual retry', () => {
    it('restarts a CV that failed while it was being written, from that stage', async () => {
      const id = await createCv(app, owner.cookie);
      await fail(id, 'generation_failed', 'compose');

      await http().post(`/api/cvs/${id}/retry`).set('Cookie', owner.cookie).expect(204);

      const cv = (await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie)).body as Cv;
      expect(cv).toMatchObject({ state: 'generating', stage: 'writing', failure: null });
      const jobs = await dataSource.query<{ kind: string; status: string }[]>(
        `SELECT kind, status FROM generation_jobs WHERE cv_id = $1 ORDER BY created_at`,
        [id],
      );
      expect(jobs).toEqual([
        { kind: 'compose', status: 'failed' },
        { kind: 'compose', status: 'queued' },
      ]);
    });

    it('rejects a retry of a failure that a retry cannot fix', async () => {
      const id = await createCv(app, owner.cookie);
      await fail(id, 'no_readable_text');

      const response = await http()
        .post(`/api/cvs/${id}/retry`)
        .set('Cookie', owner.cookie)
        .expect(409);

      expect(code(response)).toBe('not_retryable');
      expect(await count('generation_jobs')).toBe(1);
    });

    it('rejects a retry of a CV that has not failed', async () => {
      const id = await createCv(app, owner.cookie);

      const response = await http()
        .post(`/api/cvs/${id}/retry`)
        .set('Cookie', owner.cookie)
        .expect(409);

      expect(code(response)).toBe('not_retryable');
    });

    it('queues one job when a retry is sent twice at once', async () => {
      const id = await createCv(app, owner.cookie);
      await fail(id, 'service_unavailable');
      const retry = () => http().post(`/api/cvs/${id}/retry`).set('Cookie', owner.cookie);

      const statuses = (await Promise.all([retry(), retry()])).map((r) => r.status).sort();

      expect(statuses).toEqual([204, 409]);
      expect(await count('generation_jobs')).toBe(2);
    });

    it('rejects a retry while another CV of the user is being generated', async () => {
      const failed = await createCv(app, owner.cookie);
      await fail(failed, 'service_unavailable');
      await createCv(app, owner.cookie);

      const response = await http()
        .post(`/api/cvs/${failed}/retry`)
        .set('Cookie', owner.cookie)
        .expect(409);

      expect(code(response)).toBe('generation_running');
      expect(
        (await http().get(`/api/cvs/${failed}`).set('Cookie', owner.cookie)).body,
      ).toMatchObject({ state: 'failed' });
    });
  });

  describe('access control', () => {
    const routes: [string, 'get' | 'post' | 'delete', (id: string) => string][] = [
      ['list', 'get', () => '/api/cvs'],
      ['create', 'post', () => '/api/cvs'],
      ['read', 'get', (id) => `/api/cvs/${id}`],
      ['delete', 'delete', (id) => `/api/cvs/${id}`],
      ['retry', 'post', (id) => `/api/cvs/${id}/retry`],
    ];

    it.each(routes)('rejects %s without a session', async (_name, method, path) => {
      const id = await createCv(app, owner.cookie);

      const response = await http()[method](path(id)).expect(401);

      expect(code(response)).toBe('unauthenticated');
    });

    it.each(routes.filter(([name]) => name !== 'list' && name !== 'create'))(
      "answers %s of another user's CV as not found and changes nothing",
      async (_name, method, path) => {
        const id = await createCv(app, owner.cookie);
        await fail(id, 'service_unavailable');
        const intruder = await register(app, 'intruder@example.com');
        const unknown = await http()
          [method](path('0b9f6f0e-3a51-4c0e-9d1b-6a8f0f5f2c11'))
          .set('Cookie', intruder.cookie);

        const response = await http()[method](path(id)).set('Cookie', intruder.cookie).expect(404);

        // Indistinguishable from a CV that does not exist.
        expect(response.body).toEqual(unknown.body);
        const cv = (await http().get(`/api/cvs/${id}`).set('Cookie', owner.cookie).expect(200))
          .body as Cv;
        expect(cv.state).toBe('failed');
        expect(await count('generation_jobs')).toBe(1);
      },
    );

    it('ignores a user identifier sent by the client', async () => {
      const intruder = await register(app, 'intruder@example.com');

      const response = await post(intruder.cookie)
        .field('targetRole', ROLE)
        .field('text', 'Five years.')
        .field('userId', owner.body.user.id);

      // An unknown field is refused outright rather than silently dropped.
      expect(response.status).toBe(400);
      expect(await count('cvs')).toBe(0);
    });
  });
});
