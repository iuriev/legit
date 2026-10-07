import type { EntityManager } from 'typeorm';

import type { JobKind } from './generation-job.entity';

export interface ClaimedJob {
  id: string;
  cvId: string;
  kind: JobKind;
  /** Which attempt this is, starting at 1. */
  attempts: number;
}

/**
 * The writes a finished stage wants to make. The runner executes them in one
 * transaction together with marking the job done, so a stage either leaves
 * all of its results or none.
 */
export type JobCommit = (manager: EntityManager) => Promise<void>;

/**
 * Does the slow work of a stage (the model calls) without holding a
 * transaction and returns the writes to make. It must be safe to run again:
 * an interrupted attempt has written nothing.
 */
export type JobHandler = (job: ClaimedJob) => Promise<JobCommit>;

export type JobHandlers = Partial<Record<JobKind, JobHandler>>;

export const JOB_HANDLERS = Symbol('JOB_HANDLERS');
