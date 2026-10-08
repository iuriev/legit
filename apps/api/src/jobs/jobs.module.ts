import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ExtractStage } from '../generation/extract.stage';
import { GenerationModule } from '../generation/generation.module';
import { GenerationJob } from './generation-job.entity';
import { JOB_HANDLERS, type JobHandlers } from './job-handlers';
import { JobRunner } from './job-runner';

@Module({
  imports: [TypeOrmModule.forFeature([GenerationJob]), GenerationModule],
  providers: [
    {
      provide: JOB_HANDLERS,
      inject: [ExtractStage],
      useFactory: (extract: ExtractStage): JobHandlers => ({
        extract: (job) => extract.run(job),
      }),
    },
    JobRunner,
  ],
  exports: [JobRunner],
})
export class JobsModule {}
