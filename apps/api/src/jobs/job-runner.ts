import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';

import type { Env } from '../config/env';
import { RETRYABLE_FAILURES } from '../cvs/failure';
import { classifyFailure, GenerationError } from './generation-error';
import { type ClaimedJob, JOB_HANDLERS, type JobHandlers } from './job-handlers';

/** The claim on the job lapsed and another worker took it, or its CV was deleted. */
class StaleJobError extends Error {}

/**
 * Runs generation jobs stored in PostgreSQL.
 *
 * A job is claimed with a lease. A worker that dies leaves its job `running`
 * with a lease that runs out, and the job is claimed again: nothing has to
 * notice the crash. A worker stores the result of a job only while it still
 * holds the claim (the attempt number it claimed with), so a worker that was
 * only slow cannot overwrite the work of the one that replaced it. The stage
 * shown as progress is not guarded in this way: it is a label, not a result.
 *
 * Every transaction that touches both a CV and its job locks the CV row first.
 * Deleting a CV does the same through the foreign key, so the two cannot
 * deadlock.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(JobRunner.name);
  private readonly pollIntervalMs: number;
  private readonly leaseSeconds: number;
  private readonly concurrency: number;
  /** Waits before the second, third, … attempt. One more attempt than entries. */
  private readonly retryDelaysMs: number[];
  private readonly maxAttempts: number;
  private readonly shutdownGraceMs: number;

  private timer: NodeJS.Timeout | undefined;
  private polling: Promise<void> | undefined;
  /** Set once the grace period of a stop is over and running jobs are handed back. */
  private stopped = false;
  private readonly active = new Map<Promise<void>, ClaimedJob>();

  constructor(
    private readonly dataSource: DataSource,
    @Inject(JOB_HANDLERS) private readonly handlers: JobHandlers,
    config: ConfigService<Env, true>,
  ) {
    this.pollIntervalMs = config.get('WORKER_POLL_INTERVAL_MS', { infer: true });
    this.leaseSeconds = config.get('WORKER_LEASE_SECONDS', { infer: true });
    this.concurrency = config.get('WORKER_CONCURRENCY', { infer: true });
    this.retryDelaysMs = config.get('WORKER_RETRY_DELAYS_MS', { infer: true });
    this.maxAttempts = this.retryDelaysMs.length + 1;
    this.shutdownGraceMs = config.get('WORKER_SHUTDOWN_GRACE_MS', { infer: true });
  }

  onApplicationBootstrap(): void {
    this.stopped = false;
    this.timer = setInterval(() => {
      this.polling ??= this.poll().finally(() => (this.polling = undefined));
    }, this.pollIntervalMs);
  }

  /**
   * Runs before any module's shutdown hook, so the database connection is still
   * open: a job that finishes within the grace period can store its result, and
   * the others can be handed back.
   */
  async beforeApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /**
   * Stops claiming jobs and gives the ones in progress a moment to finish.
   * A job that is still running after that is handed back: it is queued again
   * without the attempt being counted, so the next start picks it up at once
   * instead of waiting for the lease to run out.
   */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.polling;

    let graceTimer: NodeJS.Timeout | undefined;
    const grace = new Promise<void>((resolve) => {
      graceTimer = setTimeout(resolve, this.shutdownGraceMs);
    });
    await Promise.race([Promise.allSettled([...this.active.keys()]), grace]);
    clearTimeout(graceTimer);
    this.stopped = true;

    for (const job of this.active.values()) {
      await this.dataSource
        .query(
          `UPDATE "generation_jobs"
              SET "status" = 'queued', "attempts" = "attempts" - 1, "locked_until" = NULL,
                  "run_after" = now()
            WHERE "id" = $1 AND "status" = 'running' AND "attempts" = $2`,
          [job.id, job.attempts],
        )
        .catch((error: unknown) => {
          // The lease will run out and the job will be claimed again.
          this.logger.error(error instanceof Error ? error.stack : error);
        });
    }
  }

  /** Claims waiting jobs until every slot is busy or nothing is waiting. */
  private async poll(): Promise<void> {
    try {
      await this.failJobsWithoutAttemptsLeft();
      while (this.timer !== undefined && this.active.size < this.concurrency) {
        const job = await this.claim();
        if (!job) {
          break;
        }
        const run: Promise<void> = this.process(job).finally(() => this.active.delete(run));
        this.active.set(run, job);
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : error);
    }
  }

  private async claim(): Promise<ClaimedJob | undefined> {
    // SKIP LOCKED lets several workers ask at once without waiting for each
    // other and without two of them getting the same job.
    const [rows] = await this.dataSource.query<
      [{ id: string; cv_id: string; kind: ClaimedJob['kind']; attempts: number }[], number]
    >(
      `UPDATE "generation_jobs"
          SET "status" = 'running', "attempts" = "attempts" + 1,
              "locked_until" = now() + make_interval(secs => $1)
        WHERE "id" = (
          SELECT "id" FROM "generation_jobs"
           WHERE "attempts" < $2
             AND (("status" = 'queued' AND "run_after" <= now())
               OR ("status" = 'running' AND "locked_until" < now()))
           ORDER BY "created_at"
           FOR UPDATE SKIP LOCKED
           LIMIT 1)
        RETURNING "id", "cv_id", "kind", "attempts"`,
      [this.leaseSeconds, this.maxAttempts],
    );
    const row = rows[0];
    return row && { id: row.id, cvId: row.cv_id, kind: row.kind, attempts: row.attempts };
  }

  /**
   * A job with no attempt left that nobody is working on can never run: its
   * last attempt was interrupted, or it was queued for an attempt that the
   * current settings no longer allow. It fails, and so does its CV.
   */
  private async failJobsWithoutAttemptsLeft(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const cvs = await manager.query<{ id: string }[]>(
        `SELECT "cvs"."id" FROM "cvs"
           JOIN "generation_jobs" "job" ON "job"."cv_id" = "cvs"."id"
          WHERE "job"."attempts" >= $1
            AND ("job"."status" = 'queued'
              OR ("job"."status" = 'running' AND "job"."locked_until" < now()))
          ORDER BY "cvs"."id"
          FOR UPDATE OF "cvs" SKIP LOCKED`,
        [this.maxAttempts],
      );
      if (cvs.length === 0) {
        return;
      }
      const cvIds = cvs.map((cv) => cv.id);
      await manager.query(
        `UPDATE "generation_jobs"
            SET "status" = 'failed', "finished_at" = now(), "locked_until" = NULL,
                "last_error" = 'No attempt left'
          WHERE "cv_id" = ANY($1) AND "attempts" >= $2
            AND ("status" = 'queued' OR ("status" = 'running' AND "locked_until" < now()))`,
        [cvIds, this.maxAttempts],
      );
      await manager.query(
        `UPDATE "cvs"
            SET "state" = 'failed', "stage" = NULL, "failure_code" = 'generation_failed',
                "updated_at" = now()
          WHERE "id" = ANY($1)`,
        [cvIds],
      );
    });
  }

  private async process(job: ClaimedJob): Promise<void> {
    try {
      const handler = this.handlers[job.kind];
      if (!handler) {
        throw new GenerationError('generation_failed', false, `No handler for "${job.kind}" jobs`);
      }
      const commit = await handler(job);
      await this.dataSource.transaction(async (manager) => {
        await this.finishIfStillClaimed(manager, job, 'done');
        await commit(manager);
      });
    } catch (error) {
      if (error instanceof StaleJobError) {
        this.logger.warn(`Job ${job.id}: the claim was lost; its result is discarded`);
        return;
      }
      if (this.stopped) {
        // The job was handed back, and the database connection is closing:
        // whatever this attempt ran into is not a failure of the job.
        return;
      }
      await this.handleFailure(job, error).catch((failure: unknown) => {
        // The job stays `running`; its lease will run out and it will be claimed again.
        this.logger.error(failure instanceof Error ? failure.stack : failure);
      });
    }
  }

  private async handleFailure(job: ClaimedJob, error: unknown): Promise<void> {
    const failure = classifyFailure(error);
    const retryDelayMs = failure.retryable ? this.retryDelaysMs[job.attempts - 1] : undefined;
    this.logger.warn(
      `Job ${job.id} (${job.kind}, attempt ${String(job.attempts)}) failed: ${failure.detail}`,
    );

    if (retryDelayMs !== undefined) {
      await this.dataSource.query(
        `UPDATE "generation_jobs"
            SET "status" = 'queued', "locked_until" = NULL, "last_error" = $3,
                "run_after" = now() + make_interval(secs => $4::double precision / 1000)
          WHERE "id" = $1 AND "status" = 'running' AND "attempts" = $2`,
        [job.id, job.attempts, failure.detail, retryDelayMs],
      );
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.finishIfStillClaimed(manager, job, 'failed', failure.detail);
        await manager.query(
          `UPDATE "cvs"
              SET "state" = 'failed', "stage" = NULL, "failure_code" = $2, "updated_at" = now()
            WHERE "id" = $1`,
          [job.cvId, failure.code],
        );
        if (!RETRYABLE_FAILURES.includes(failure.code)) {
          // Nothing will read the source again, so it is not kept.
          await manager.query(`DELETE FROM "cv_sources" WHERE "cv_id" = $1`, [job.cvId]);
        }
      });
    } catch (staleOrOther) {
      if (!(staleOrOther instanceof StaleJobError)) {
        throw staleOrOther;
      }
    }
  }

  /**
   * Marks the job finished, but only if this worker still holds the claim it
   * made. Otherwise the surrounding transaction is rolled back.
   */
  private async finishIfStillClaimed(
    manager: EntityManager,
    job: ClaimedJob,
    status: 'done' | 'failed',
    lastError: string | null = null,
  ): Promise<void> {
    // The CV row first: see the note on lock order at the top of the class.
    const cvs = await manager.query<{ id: string }[]>(
      `SELECT "id" FROM "cvs" WHERE "id" = $1 FOR UPDATE`,
      [job.cvId],
    );
    if (cvs.length === 0) {
      throw new StaleJobError();
    }
    const [rows] = await manager.query<[{ id: string }[], number]>(
      `UPDATE "generation_jobs"
          SET "status" = $3, "finished_at" = now(), "locked_until" = NULL, "last_error" = $4
        WHERE "id" = $1 AND "status" = 'running' AND "attempts" = $2
        RETURNING "id"`,
      [job.id, job.attempts, status, lastError],
    );
    if (rows.length === 0) {
      throw new StaleJobError();
    }
  }
}
