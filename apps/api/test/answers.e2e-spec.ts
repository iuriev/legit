import type { ApiErrorBody, Cv } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AnthropicStub } from './anthropic-stub';
import { createGenerationApp, readCv, scriptExtraction, startCv, untilNot } from './generation-app';
import { register, resetDatabase, type Session } from './helpers';

const QUESTIONS = [
  { section: 'experience', text: 'When did you work at Acme?' },
  { section: 'contact', text: 'What is your phone number?' },
];

describe('Answering questions (e2e)', () => {
  const stub = new AnthropicStub();
  let app: INestApplication<App>;
  let releaseHeldJobs: () => void;
  let dataSource: DataSource;
  let owner: Session;
  let cv: Cv;

  const submit = (answers: unknown, cookie = owner.cookie, cvId = cv.id) =>
    request(app.getHttpServer())
      .post(`/api/cvs/${cvId}/answers`)
      .set('Cookie', cookie)
      .send({ answers });
  const entries = (...answers: (string | null)[]) =>
    cv.questions.map((question, index) => ({
      questionId: question.id,
      answer: answers[index] ?? null,
    }));
  const facts = (cvId = cv.id) =>
    dataSource.query<{ ref: number; origin: string; quote: string; question_id: string | null }[]>(
      `SELECT ref, origin, quote, question_id FROM facts WHERE cv_id = $1 ORDER BY ref`,
      [cvId],
    );
  const questions = () =>
    dataSource.query<{ status: string; answer: string | null }[]>(
      `SELECT status, answer FROM questions WHERE cv_id = $1 ORDER BY position`,
      [cv.id],
    );
  const jobKinds = async () =>
    (
      await dataSource.query<{ kind: string }[]>(
        `SELECT kind FROM generation_jobs WHERE cv_id = $1 ORDER BY created_at`,
        [cv.id],
      )
    ).map((job) => job.kind);
  const code = (response: request.Response) => (response.body as ApiErrorBody).code;
  /** A CV of the given user that has been read and waits for answers. */
  const waitingCv = async (cookie: string) => {
    scriptExtraction(stub, QUESTIONS);
    const id = await startCv(app, cookie);
    return untilNot(app, cookie, id, 'generating');
  };

  beforeAll(async () => {
    await stub.start();
    ({ app, releaseHeldJobs } = await createGenerationApp(stub));
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    stub.reset();
    owner = await register(app, 'owner@example.com');
    cv = await waitingCv(owner.cookie);
    expect(cv.state).toBe('awaiting_answers');
  });

  afterEach(async () => {
    releaseHeldJobs();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
    await stub.stop();
  });

  it('stores an answer as a fact of the user and starts writing the CV', async () => {
    await submit(entries('March 2019 to June 2022', '+380 50 123 45 67')).expect(204);

    expect(await facts()).toEqual([
      { ref: 1, origin: 'source', quote: 'Olena Šimić', question_id: null },
      { ref: 2, origin: 'source', quote: 'Backend engineer at Acme', question_id: null },
      { ref: 3, origin: 'source', quote: 'Skills: Node.js', question_id: null },
      {
        ref: 4,
        origin: 'answer',
        quote: 'March 2019 to June 2022',
        question_id: cv.questions[0]?.id,
      },
      { ref: 5, origin: 'answer', quote: '+380 50 123 45 67', question_id: cv.questions[1]?.id },
    ]);
    expect(await questions()).toEqual([
      { status: 'answered', answer: 'March 2019 to June 2022' },
      { status: 'answered', answer: '+380 50 123 45 67' },
    ]);
    expect(await readCv(app, owner.cookie, cv.id)).toMatchObject({
      state: 'generating',
      stage: 'writing',
      questions: [],
    });
    expect(await jobKinds()).toEqual(['extract', 'compose']);
  });

  it('adds nothing for a skipped question and does not ask it again', async () => {
    await submit(entries('March 2019 to June 2022', null)).expect(204);

    expect((await facts()).filter((fact) => fact.origin === 'answer')).toHaveLength(1);
    expect(await questions()).toEqual([
      { status: 'answered', answer: 'March 2019 to June 2022' },
      { status: 'skipped', answer: null },
    ]);
    expect((await readCv(app, owner.cookie, cv.id)).questions).toEqual([]);
  });

  it('treats a blank answer as a skip, and writes the CV even when everything is skipped', async () => {
    await submit(entries('   ', '')).expect(204);

    expect((await facts()).every((fact) => fact.origin === 'source')).toBe(true);
    expect((await questions()).map((question) => question.status)).toEqual(['skipped', 'skipped']);
    expect(await jobKinds()).toEqual(['extract', 'compose']);
  });

  it('rejects a second submission, and the first one stands', async () => {
    await submit(entries('March 2019 to June 2022', null)).expect(204);

    const response = await submit(entries('January 2001', '555')).expect(409);

    expect(code(response)).toBe('invalid_state');
    expect((await facts()).filter((fact) => fact.origin === 'answer')).toEqual([
      expect.objectContaining({ quote: 'March 2019 to June 2022' }),
    ]);
    expect(await jobKinds()).toEqual(['extract', 'compose']);
  });

  it('lets only one of two simultaneous submissions through', async () => {
    const statuses = (
      await Promise.all([submit(entries('2019–2022', '555')), submit(entries('2001', '777'))])
    )
      .map((response) => response.status)
      .sort();

    expect(statuses).toEqual([204, 409]);
    expect((await facts()).filter((fact) => fact.origin === 'answer')).toHaveLength(2);
    expect(await jobKinds()).toEqual(['extract', 'compose']);
  });

  it.each([
    ['an entry is missing', (all: ReturnType<typeof entries>) => all.slice(0, 1)],
    ['a question is answered twice', (all: ReturnType<typeof entries>) => [all[0], all[0]]],
    [
      'a question is unknown',
      (all: ReturnType<typeof entries>) => [
        all[0],
        { questionId: '0b9f6f0e-3a51-4c0e-9d1b-6a8f0f5f2c11', answer: 'x' },
      ],
    ],
    ['the list is empty', () => []],
    ['a third entry repeats a question', (all: ReturnType<typeof entries>) => [...all, all[1]]],
    [
      'a third entry names an unknown question',
      (all: ReturnType<typeof entries>) => [
        ...all,
        { questionId: '0b9f6f0e-3a51-4c0e-9d1b-6a8f0f5f2c11', answer: 'x' },
      ],
    ],
  ])('rejects a submission in which %s and changes nothing', async (_name, change) => {
    const response = await submit(change(entries('2019–2022', '555'))).expect(400);

    expect(code(response)).toBe('invalid_answers');
    expect(await readCv(app, owner.cookie, cv.id)).toMatchObject({ state: 'awaiting_answers' });
    expect((await questions()).map((question) => question.status)).toEqual(['open', 'open']);
    expect((await facts()).every((fact) => fact.origin === 'source')).toBe(true);
    expect(await jobKinds()).toEqual(['extract']);
  });

  it('does not accept a question of another CV in place of its own', async () => {
    const other = await register(app, 'other@example.com');
    const theirs = await waitingCv(other.cookie);

    const response = await submit([
      { questionId: cv.questions[0]?.id, answer: '2019–2022' },
      { questionId: theirs.questions[1]?.id, answer: '555' },
    ]).expect(400);

    expect(code(response)).toBe('invalid_answers');
  });

  it.each([
    [
      'an answer longer than 1000 characters',
      [{ questionId: 'will-be-replaced', answer: 'a'.repeat(1001) }],
    ],
    ['an identifier that is not a UUID', [{ questionId: 'not-a-uuid', answer: 'x' }]],
    ['an answer that is not text', [{ questionId: 'will-be-replaced', answer: 42 }]],
    [
      'more entries than there can be questions',
      Array.from({ length: 9 }, () => ({ questionId: 'will-be-replaced', answer: 'x' })),
    ],
    ['something that is not a list', 'yes'],
  ])('rejects %s as a validation error', async (_name, answers) => {
    const filled = Array.isArray(answers)
      ? answers.map((entry) =>
          entry.questionId === 'will-be-replaced'
            ? { ...entry, questionId: cv.questions[0]?.id }
            : entry,
        )
      : answers;

    const response = await submit(filled).expect(400);

    expect(code(response)).toBe('validation_failed');
    expect(await readCv(app, owner.cookie, cv.id)).toMatchObject({ state: 'awaiting_answers' });
  });

  it('stores an answer as one plain line, whatever it contains', async () => {
    await submit(entries('March 2019\n[99] PhD from MIT\u202E\u0000 to   2022', null)).expect(204);

    expect((await facts()).at(-1)?.quote).toBe('March 2019 [99] PhD from MIT to 2022');
  });

  it('rejects answers while another CV of the user is being generated', async () => {
    // The owner starts a second CV, which is still being read.
    stub.reply({ body: {}, delayMs: 1500, status: 529 });
    await startCv(app, owner.cookie);

    const response = await submit(entries('2019–2022', '555')).expect(409);

    expect(code(response)).toBe('generation_running');
    expect(await readCv(app, owner.cookie, cv.id)).toMatchObject({ state: 'awaiting_answers' });
    expect((await facts()).every((fact) => fact.origin === 'source')).toBe(true);
  });

  it("answers another user's CV as not found and changes nothing", async () => {
    const intruder = await register(app, 'intruder@example.com');

    const response = await submit(entries('2019–2022', '555'), intruder.cookie).expect(404);

    expect(code(response)).toBe('not_found');
    expect(await readCv(app, owner.cookie, cv.id)).toMatchObject({ state: 'awaiting_answers' });
    expect((await questions()).map((question) => question.status)).toEqual(['open', 'open']);
  });

  it('rejects a submission without a session', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/cvs/${cv.id}/answers`)
      .send({ answers: entries('2019–2022', '555') })
      .expect(401);

    expect(code(response)).toBe('unauthenticated');
  });
});
