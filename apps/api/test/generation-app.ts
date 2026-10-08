import type { Cv } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { ComposeStage } from '../src/generation/compose.stage';
import { ExtractStage } from '../src/generation/extract.stage';
import type { JobCommit, JobHandler } from '../src/jobs/job-handlers';
import { type AnthropicStub, atLine, json, reading, statement } from './anthropic-stub';
import { waitFor } from './helpers';
import { createTestApp } from './test-app';

export interface GenerationApp {
  app: INestApplication<App>;
  /** What the application does with a `compose` job. A test may replace it. */
  compose: { handler: JobHandler };
  /**
   * Lets every held `compose` job finish without writing anything. A held job
   * occupies one of the worker's slots, so a test file calls this after each
   * test; otherwise a few tests would use up all slots and the next reading
   * job would never start.
   */
  releaseHeldJobs: () => void;
}

/**
 * The application with the real reading stage talking to the stub, and a
 * `compose` stage that a test controls. By default a `compose` job is held,
 * so a test can look at what the reading stage and the answers produced
 * before anything writes the CV. With `realCompose` the real writing stage
 * runs as well.
 */
export async function createGenerationApp(
  stub: AnthropicStub,
  options: { realCompose?: boolean } = {},
): Promise<GenerationApp> {
  const held: ((commit: JobCommit) => void)[] = [];
  const compose: GenerationApp['compose'] = {
    handler: options.realCompose
      ? (job) => app.get(ComposeStage).run(job)
      : () => new Promise<JobCommit>((resolve) => held.push(resolve)),
  };
  const app: INestApplication<App> = await createTestApp({
    anthropicUrl: stub.url,
    jobHandlers: {
      extract: (job) => app.get(ExtractStage).run(job),
      compose: (job) => compose.handler(job),
    },
  });
  const releaseHeldJobs = () => {
    for (const resolve of held.splice(0)) {
      resolve(() => Promise.resolve());
    }
  };
  return { app, compose, releaseHeldJobs };
}

export async function readCv(app: INestApplication<App>, cookie: string, id: string): Promise<Cv> {
  const response = await request(app.getHttpServer())
    .get(`/api/cvs/${id}`)
    .set('Cookie', cookie)
    .expect(200);
  return response.body as Cv;
}

/** Waits until the CV is no longer in the given state and returns it. */
export function untilNot(
  app: INestApplication<App>,
  cookie: string,
  id: string,
  state: Cv['state'],
): Promise<Cv> {
  return waitFor(async () => {
    const cv = await readCv(app, cookie, id);
    return cv.state === state ? undefined : cv;
  });
}

export const SOURCE_TEXT = ['Olena Šimić', 'Backend engineer at Acme', 'Skills: Node.js'].join(
  '\n',
);

/** Scripts a reading of `SOURCE_TEXT` that cites its three lines, then the given questions. */
export function scriptExtraction(
  stub: AnthropicStub,
  questions: { section: string; text: string }[],
): void {
  stub.reply(
    reading(
      statement('Her name is Olena Šimić.', atLine(0, 'Olena Šimić')),
      statement('She was a backend engineer at Acme.', atLine(1, 'Backend engineer at Acme')),
      statement('She knows Node.js.', atLine(2, 'Skills: Node.js')),
    ),
    json({ questions }),
  );
}

export async function startCv(
  app: INestApplication<App>,
  cookie: string,
  text = SOURCE_TEXT,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/cvs')
    .set('Cookie', cookie)
    .field('targetRole', 'Senior Backend Engineer')
    .field('text', text)
    .expect(201);
  return (response.body as { id: string }).id;
}
