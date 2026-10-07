import type { Cv as CvResponse, CvFailureCode, CvStage, CvSummary } from '@cv-builder/contracts';
import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ApiException } from '../common/api.exception';
import { isUniqueViolation } from '../database/pg-errors';
import type { JobKind } from '../jobs/generation-job.entity';
import { Cv } from './cv.entity';
import { describeFailure, RETRYABLE_FAILURES } from './failure';
import { Question } from './question.entity';

export type CvSourceInput = { kind: 'pdf'; pdf: Buffer } | { kind: 'text'; text: string };

/** The stage shown while a job of each kind waits for the worker. */
const FIRST_STAGE: Record<JobKind, CvStage> = { extract: 'reading', compose: 'writing' };

/** Bounds what one account can store. */
export const MAX_CVS_PER_USER = 5;

const generationRunning = () =>
  new ApiException(
    HttpStatus.CONFLICT,
    'generation_running',
    'A CV is already being generated. Wait until it finishes.',
  );

/**
 * CVs of one user. Every method takes the user from the session and puts it
 * into the query, so a CV of another user is simply not found.
 */
@Injectable()
export class CvsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Stores the CV, its source and the first job together, so none exists without the others. */
  async create(userId: string, targetRole: string, source: CvSourceInput): Promise<string> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.getRepository(Cv).countBy({ userId });
        if (existing >= MAX_CVS_PER_USER) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            'cv_limit_reached',
            `You can keep at most ${String(MAX_CVS_PER_USER)} CVs. Delete one to start another.`,
          );
        }
        const [cv] = await manager.query<{ id: string }[]>(
          `INSERT INTO "cvs" ("user_id", "target_role", "state", "stage")
           VALUES ($1, $2, 'generating', $3) RETURNING "id"`,
          [userId, targetRole, FIRST_STAGE.extract],
        );
        if (!cv) {
          throw new Error('The CV was not inserted');
        }
        await manager.query(
          `INSERT INTO "cv_sources" ("cv_id", "kind", "pdf", "text") VALUES ($1, $2, $3, $4)`,
          [
            cv.id,
            source.kind,
            source.kind === 'pdf' ? source.pdf : null,
            source.kind === 'text' ? source.text : null,
          ],
        );
        await manager.query(
          `INSERT INTO "generation_jobs" ("cv_id", "kind") VALUES ($1, 'extract')`,
          [cv.id],
        );
        return cv.id;
      });
    } catch (error) {
      // The partial unique index on generating CVs of one user.
      if (isUniqueViolation(error)) {
        throw generationRunning();
      }
      throw error;
    }
  }

  async list(userId: string): Promise<CvSummary[]> {
    // Only what the list shows: the documents themselves stay in the database.
    const cvs = await this.dataSource.getRepository(Cv).find({
      select: { id: true, targetRole: true, state: true, createdAt: true, updatedAt: true },
      where: { userId },
      order: { createdAt: 'DESC' },
      take: MAX_CVS_PER_USER,
    });
    return cvs.map(toSummary);
  }

  async get(userId: string, id: string): Promise<CvResponse> {
    const cv = await this.dataSource.getRepository(Cv).findOneBy({ id, userId });
    if (!cv) {
      throw notFound();
    }
    const questions =
      cv.state === 'awaiting_answers'
        ? await this.dataSource
            .getRepository(Question)
            .find({ where: { cvId: cv.id, status: 'open' }, order: { position: 'ASC' } })
        : [];
    return {
      ...toSummary(cv),
      stage: cv.stage,
      failure: cv.failureCode ? describeFailure(cv.failureCode) : null,
      questions: questions.map(({ id: questionId, section, text }) => ({
        id: questionId,
        section,
        text,
      })),
      document: cv.state === 'ready' ? cv.document : null,
      omittedCount: cv.omittedCount,
      version: cv.version,
    };
  }

  /** Facts, questions, the source and jobs go with the CV through the foreign keys. */
  async delete(userId: string, id: string): Promise<void> {
    const result = await this.dataSource.getRepository(Cv).delete({ id, userId });
    if (!result.affected) {
      throw notFound();
    }
  }

  /**
   * Restarts a failed generation from the stage that failed. The state change
   * is one conditional statement, so two retries cannot both queue a job.
   */
  async retry(userId: string, id: string): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const [lastJob] = await manager.query<{ kind: JobKind }[]>(
          `SELECT "job"."kind" FROM "generation_jobs" "job"
             JOIN "cvs" ON "cvs"."id" = "job"."cv_id"
            WHERE "job"."cv_id" = $1 AND "cvs"."user_id" = $2
            ORDER BY "job"."created_at" DESC LIMIT 1`,
          [id, userId],
        );
        const kind = lastJob?.kind ?? 'extract';
        const [updated] = await manager.query<[{ id: string }[], number]>(
          `UPDATE "cvs"
              SET "state" = 'generating', "stage" = $3, "failure_code" = NULL, "updated_at" = now()
            WHERE "id" = $1 AND "user_id" = $2 AND "state" = 'failed'
              AND "failure_code" = ANY($4)
            RETURNING "id"`,
          [id, userId, FIRST_STAGE[kind], RETRYABLE_FAILURES satisfies readonly CvFailureCode[]],
        );
        if (updated.length === 0) {
          const cv = await manager.getRepository(Cv).findOneBy({ id, userId });
          if (!cv) {
            throw notFound();
          }
          throw new ApiException(
            HttpStatus.CONFLICT,
            'not_retryable',
            cv.state === 'failed'
              ? 'This CV cannot be retried. Start a new one.'
              : 'This CV has not failed, so there is nothing to retry.',
          );
        }
        await manager.query(`INSERT INTO "generation_jobs" ("cv_id", "kind") VALUES ($1, $2)`, [
          id,
          kind,
        ]);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw generationRunning();
      }
      throw error;
    }
  }
}

const notFound = () => new NotFoundException('CV not found');

function toSummary(cv: Cv): CvSummary {
  return {
    id: cv.id,
    targetRole: cv.targetRole,
    state: cv.state,
    createdAt: cv.createdAt.toISOString(),
    updatedAt: cv.updatedAt.toISOString(),
  };
}
