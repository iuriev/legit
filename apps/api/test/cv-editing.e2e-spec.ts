import type { ApiErrorBody, Cv, CvDocument, SaveCvResponse } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { CV_LIMITS } from '../src/cvs/cv-document.schema';
import { JobRunner } from '../src/jobs/job-runner';
import { createCv, register, resetDatabase, type Session } from './helpers';
import { readPdf } from './pdf-reader';
import { createTestApp } from './test-app';

const DOCUMENT: CvDocument = {
  contact: {
    fullName: 'Olena Šimić',
    email: 'olena@example.com',
    phone: '',
    location: 'Kyiv',
    links: ['github.com/olena'],
  },
  summary: 'Backend engineer.',
  experience: [
    {
      company: 'Acme',
      title: 'Backend Engineer',
      location: '',
      startDate: 'March 2019',
      endDate: 'June 2022',
      bullets: ['Rewrote the build pipeline'],
    },
  ],
  education: [],
  skills: ['Node.js'],
};

/** The bullet points of the one position of `DOCUMENT`. */
const bulletsOf = (document: CvDocument): string[] => document.experience[0]?.bullets ?? [];

/** A deep copy with one change, for building the document a save sends. */
const edited = (change: (document: CvDocument) => void): CvDocument => {
  const copy = structuredClone(DOCUMENT);
  change(copy);
  return copy;
};

describe('Editing a CV and downloading it (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let owner: Session;
  let cvId: string;

  const http = () => request(app.getHttpServer());
  const read = async (cookie = owner.cookie, id = cvId) =>
    (await http().get(`/api/cvs/${id}`).set('Cookie', cookie).expect(200)).body as Cv;
  const save = (version: number, document: unknown, cookie = owner.cookie, id = cvId) =>
    http().put(`/api/cvs/${id}`).set('Cookie', cookie).send({ version, document });
  const download = (cookie = owner.cookie, id = cvId) =>
    http()
      .get(`/api/cvs/${id}/pdf`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      });
  const code = (response: request.Response) => (response.body as ApiErrorBody).code;
  /** A CV in the state that generation would have left it in. */
  const makeReady = async (cookie: string, document = DOCUMENT) => {
    const id = await createCv(app, cookie);
    await dataSource.query(
      `UPDATE cvs SET state = 'ready', stage = NULL, document = $2 WHERE id = $1`,
      [id, JSON.stringify(document)],
    );
    return id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    // These tests are about the HTTP API; nothing here needs the worker.
    await app.get(JobRunner).stop();
  });

  beforeEach(async () => {
    owner = await register(app, 'owner@example.com');
    cvId = await makeReady(owner.cookie);
  });

  afterEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('manual editing', () => {
    it('stores a rewritten bullet point, and a later read from any session returns it', async () => {
      const document = edited((d) => (bulletsOf(d)[0] = 'Rewrote the build pipeline in Bazel'));

      const response = await save(0, document).expect(200);

      expect(response.body as SaveCvResponse).toEqual({
        version: 1,
        updatedAt: expect.any(String) as string,
      });
      const anotherDevice = await register(app, 'someone@example.com').then(() =>
        http()
          .post('/api/auth/login')
          .send({ email: 'owner@example.com', password: 'correct horse battery' })
          .expect(200),
      );
      const cookie = (anotherDevice.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0];
      expect((await read(cookie)).document).toEqual(document);
    });

    it('stores what the AI left out, without comparing it with any fact', async () => {
      const document = edited((d) => {
        d.contact.phone = '+380 50 123 45 67';
        d.skills.push('Kubernetes');
        d.education.push({
          institution: 'KPI',
          degree: 'BSc',
          startDate: '2012',
          endDate: '2016',
          details: '',
        });
        bulletsOf(d).push('Led a team of 40');
      });

      await save(0, document).expect(200);

      expect((await read()).document).toEqual(document);
    });

    it('lets entries, bullet points, links and skills be removed', async () => {
      const document = edited((d) => {
        d.experience = [];
        d.contact.links = [];
        d.skills = [];
      });

      await save(0, document).expect(200);

      expect((await read()).document).toEqual(document);
    });

    it.each(['generating', 'awaiting_answers', 'failed'])(
      'rejects a save for a CV that is %s',
      async (state) => {
        await dataSource.query(
          `UPDATE cvs SET state = $2, stage = NULL, document = NULL,
                  failure_code = CASE WHEN $2 = 'failed' THEN 'generation_failed' END
            WHERE id = $1`,
          [cvId, state],
        );

        const response = await save(0, DOCUMENT).expect(409);

        expect(code(response)).toBe('invalid_state');
      },
    );
  });

  describe('validation of saved documents', () => {
    it('rejects an oversized field, names it and stores nothing', async () => {
      const response = await save(
        0,
        edited((d) => (d.summary = 'a'.repeat(CV_LIMITS.summary + 1))),
      ).expect(400);

      expect(code(response)).toBe('validation_failed');
      expect((response.body as ApiErrorBody).message).toEqual([
        expect.stringMatching(/^summary: /),
      ]);
      expect(await read()).toMatchObject({ version: 0, document: DOCUMENT });
    });

    it.each<[string, unknown]>([
      [
        'more skills than allowed',
        edited((d) => (d.skills = Array<string>(CV_LIMITS.skills + 1).fill('x'))),
      ],
      ['a missing section', { ...DOCUMENT, skills: undefined }],
      ['an unknown field', { ...DOCUMENT, hobbies: ['chess'] }],
      ['a field of the wrong type', { ...DOCUMENT, summary: 42 }],
      ['the NUL character', edited((d) => (d.summary = 'a\u0000b'))],
      ['half of a surrogate pair', edited((d) => (d.summary = 'a\ud800b'))],
      ['something that is not a document', 'just text'],
      ['no document at all', undefined],
    ])('rejects %s', async (_name, document) => {
      const response = await save(0, document).expect(400);

      expect(code(response)).toBe('validation_failed');
      expect((await read()).version).toBe(0);
    });

    it.each<[string, unknown]>([
      ['an empty string', ''],
      ['text', ' 0 '],
      ['a boolean', true],
      ['a fraction', 0.5],
      ['a negative number', -1],
    ])('rejects %s as the version', async (_name, version) => {
      const response = await http()
        .put(`/api/cvs/${cvId}`)
        .set('Cookie', owner.cookie)
        .send({ version, document: DOCUMENT })
        .expect(400);

      expect(code(response)).toBe('validation_failed');
      expect((await read()).version).toBe(0);
    });

    it.each([2_147_483_647, 2_147_483_648, 1e30])(
      'answers a version of %d as a conflict or a validation error, never a server error',
      async (version) => {
        const response = await save(version, DOCUMENT);

        expect([400, 409]).toContain(response.status);
      },
    );

    it('reports a few problems of a hostile document, not all of them', async () => {
      const response = await save(0, { ...DOCUMENT, skills: Array<number>(50_000).fill(1) }).expect(
        400,
      );

      expect((response.body as ApiErrorBody).message).toHaveLength(20);
    });

    it('rejects a save without a version', async () => {
      const response = await http()
        .put(`/api/cvs/${cvId}`)
        .set('Cookie', owner.cookie)
        .send({ document: DOCUMENT })
        .expect(400);

      expect(code(response)).toBe('validation_failed');
    });

    it('stores markup as the literal characters', async () => {
      const markup = '<script>alert(1)</script> & <b>bold</b>';

      await save(
        0,
        edited((d) => (d.summary = markup)),
      ).expect(200);

      expect((await read()).document?.summary).toBe(markup);
    });

    it('accepts a document at the limits of the schema, which is larger than 100 kB', async () => {
      const large = edited((d) => {
        d.experience = Array.from({ length: CV_LIMITS.experience }, () => ({
          company: 'c'.repeat(CV_LIMITS.shortText),
          title: 't'.repeat(CV_LIMITS.shortText),
          location: '',
          startDate: '',
          endDate: '',
          bullets: Array<string>(CV_LIMITS.bullets).fill('b'.repeat(CV_LIMITS.bullet)),
        }));
      });
      expect(JSON.stringify(large).length).toBeGreaterThan(100_000);

      await save(0, large).expect(200);
    });

    it('accepts the same document in Cyrillic, which takes twice the bytes', async () => {
      const cyrillic = edited((d) => {
        d.experience = Array.from({ length: CV_LIMITS.experience }, () => ({
          company: 'ж'.repeat(CV_LIMITS.shortText),
          title: 'ж'.repeat(CV_LIMITS.shortText),
          location: '',
          startDate: '',
          endDate: '',
          bullets: Array<string>(CV_LIMITS.bullets).fill('ж'.repeat(CV_LIMITS.bullet)),
        }));
      });
      expect(Buffer.byteLength(JSON.stringify(cyrillic))).toBeGreaterThan(600_000);

      await save(0, cyrillic).expect(200);
    });

    it('rejects a body above the limit before reading it as a document', async () => {
      const response = await save(0, { ...DOCUMENT, summary: 'a'.repeat(2_000_000) }).expect(413);

      expect(code(response)).toBe('payload_too_large');
      expect((await read()).version).toBe(0);
    });
  });

  describe('version-checked saving', () => {
    it('stores a save based on the current version and increases the version', async () => {
      await dataSource.query(`UPDATE cvs SET version = 3 WHERE id = $1`, [cvId]);

      const response = await save(
        3,
        edited((d) => (d.summary = 'Changed.')),
      ).expect(200);

      expect((response.body as SaveCvResponse).version).toBe(4);
      expect(await read()).toMatchObject({ version: 4, document: { summary: 'Changed.' } });
    });

    it('rejects a save based on an outdated version and leaves the stored CV unchanged', async () => {
      // The phone saves first; the laptop still holds version 0.
      await save(
        0,
        edited((d) => (d.summary = 'Saved on the phone.')),
      ).expect(200);

      const response = await save(
        0,
        edited((d) => (d.summary = 'Typed on the laptop.')),
      ).expect(409);

      expect(code(response)).toBe('version_conflict');
      expect((response.body as ApiErrorBody).message).toMatch(/Load the current version/);
      // The laptop is offered the current version by reading the CV again.
      expect(await read()).toMatchObject({
        version: 1,
        document: { summary: 'Saved on the phone.' },
      });
    });

    it('rejects a version from the future as well', async () => {
      await save(5, DOCUMENT).expect(409);
    });

    it('lets only one of two simultaneous saves of one version through', async () => {
      const [first, second] = await Promise.all([
        save(
          0,
          edited((d) => (d.summary = 'First.')),
        ),
        save(
          0,
          edited((d) => (d.summary = 'Second.')),
        ),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const winner = first.status === 200 ? 'First.' : 'Second.';
      expect(await read()).toMatchObject({ version: 1, document: { summary: winner } });
    });

    it('changes the time of the last change, which the list shows', async () => {
      await dataSource.query(
        `UPDATE cvs SET updated_at = now() - interval '1 hour' WHERE id = $1`,
        [cvId],
      );
      const before = (await read()).updatedAt;

      const response = await save(
        0,
        edited((d) => (d.summary = 'Changed.')),
      ).expect(200);

      const after = (response.body as SaveCvResponse).updatedAt;
      expect(Date.parse(after) - Date.parse(before)).toBeGreaterThan(3_000_000);
      expect((await read()).updatedAt).toBe(after);
    });
  });

  describe('PDF download', () => {
    it('offers a ready CV as a file named after the candidate, with A4 pages', async () => {
      const response = await download().expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="Olena-Simic-CV.pdf"; filename*=UTF-8''${encodeURIComponent('Olena Šimić CV')}.pdf`,
      );
      const { pages } = await readPdf(response.body as Buffer);
      expect(pages).toHaveLength(1);
      expect(pages[0]?.width).toBeCloseTo(595.28, 1);
      expect(pages[0]?.height).toBeCloseTo(841.89, 1);
    });

    it('contains the name, the summary and every bullet point as text', async () => {
      const { text } = await readPdf((await download().expect(200)).body as Buffer);

      expect(text).toContain('Olena Šimić');
      expect(text).toContain('Backend engineer.');
      expect(text).toContain('Rewrote the build pipeline');
      // The education section is empty, so it has no heading.
      expect(text).not.toContain('EDUCATION');
    });

    it('shows the saved CV: a manual edit is in the next download', async () => {
      await save(
        0,
        edited((d) => (bulletsOf(d)[0] = 'Rewrote the pipeline in Bazel')),
      ).expect(200);

      const { text } = await readPdf((await download().expect(200)).body as Buffer);

      expect(text).toContain('Rewrote the pipeline in Bazel');
      expect(text).not.toContain('Rewrote the build pipeline');
    });

    it.each(['generating', 'awaiting_answers', 'failed'])(
      'rejects a download of a CV that is %s',
      async (state) => {
        await dataSource.query(
          // The document stays: it is the state that forbids the download.
          `UPDATE cvs SET state = $2, stage = NULL,
                  failure_code = CASE WHEN $2 = 'failed' THEN 'generation_failed' END
            WHERE id = $1`,
          [cvId, state],
        );

        const response = await http()
          .get(`/api/cvs/${cvId}/pdf`)
          .set('Cookie', owner.cookie)
          .expect(409);

        expect(code(response)).toBe('invalid_state');
      },
    );
  });

  describe('access control', () => {
    it('rejects a save and a download without a session', async () => {
      expect(
        code(
          await http().put(`/api/cvs/${cvId}`).send({ version: 0, document: DOCUMENT }).expect(401),
        ),
      ).toBe('unauthenticated');
      expect(code(await http().get(`/api/cvs/${cvId}/pdf`).expect(401))).toBe('unauthenticated');
    });

    it("answers a save and a download of another user's CV as not found and changes nothing", async () => {
      const intruder = await register(app, 'intruder@example.com');

      const saved = await save(
        0,
        edited((d) => (d.summary = 'Defaced.')),
        intruder.cookie,
      ).expect(404);
      const downloaded = await http()
        .get(`/api/cvs/${cvId}/pdf`)
        .set('Cookie', intruder.cookie)
        .expect(404);

      expect(code(saved)).toBe('not_found');
      expect(code(downloaded)).toBe('not_found');
      expect(await read()).toMatchObject({ version: 0, document: DOCUMENT });
    });

    it('does not let a user save into their own CV by naming another in the body', async () => {
      const intruder = await register(app, 'intruder@example.com');
      const theirs = await makeReady(intruder.cookie);

      await http()
        .put(`/api/cvs/${theirs}`)
        .set('Cookie', intruder.cookie)
        .send({ version: 0, document: DOCUMENT, id: cvId, userId: owner.body.user.id })
        .expect(400);

      expect(await read()).toMatchObject({ version: 0 });
    });
  });
});
