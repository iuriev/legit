import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { JOB_HANDLERS, type JobHandlers } from '../src/jobs/job-handlers';
import { LLM_OPTIONS, type LlmOptions } from '../src/llm/llm-options';

/**
 * Boots the real application (real modules, real database, migrations applied)
 * with the same HTTP setup as `main.ts`.
 */
export async function createTestApp(
  options: { jobHandlers?: JobHandlers; anthropicUrl?: string; llm?: Partial<LlmOptions> } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    // No test reaches the real API: the SDK talks to the stub, or to nothing.
    .overrideProvider(LLM_OPTIONS)
    .useValue({
      apiKey: 'test-key',
      baseURL: options.anthropicUrl ?? 'http://127.0.0.1:9',
      model: 'claude-sonnet-5-5',
      timeoutMs: 2000,
      inputTokenBudget: 40_000,
      ...options.llm,
    } satisfies LlmOptions);
  if (options.jobHandlers) {
    // Tests of the job runner supply their own stage handlers.
    builder = builder.overrideProvider(JOB_HANDLERS).useValue(options.jobHandlers);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}
