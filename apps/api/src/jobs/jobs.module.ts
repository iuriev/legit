import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GenerationJob } from './generation-job.entity';
import { JOB_HANDLERS, type JobHandlers } from './job-handlers';
import { JobRunner } from './job-runner';

const noHandlersYet: JobHandlers = {};

@Module({
  imports: [TypeOrmModule.forFeature([GenerationJob])],
  providers: [{ provide: JOB_HANDLERS, useValue: noHandlersYet }, JobRunner],
  exports: [JobRunner],
})
export class JobsModule {}
