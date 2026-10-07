import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { setupApp } from '../src/app.setup';
import { JOB_HANDLERS, type JobHandlers } from '../src/jobs/job-handlers';

/**
 * Boots the real application (real modules, real database, migrations applied)
 * with the same HTTP setup as `main.ts`.
 */
export async function createTestApp(
  options: { jobHandlers?: JobHandlers } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
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
