import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { GenerationError } from '../jobs/generation-error';
import type { ClaimedJob, JobCommit } from '../jobs/job-handlers';
import { LlmClient } from '../llm/llm.client';
import { passagesFromMessage } from './passages';
import { QUESTIONS_SYSTEM, questionsUserMessage, READ_INSTRUCTION, READ_SYSTEM } from './prompts';
import { cleanQuestions, questionsSchema } from './questions';
import { type StoredSource, toDocumentBlock } from './source-document';

/**
 * The first job of a generation: read the source into facts, then decide what
 * to ask the user. Nothing is written until both calls have succeeded.
 */
@Injectable()
export class ExtractStage {
  constructor(
    private readonly dataSource: DataSource,
    private readonly llm: LlmClient,
  ) {}

  async run(job: ClaimedJob): Promise<JobCommit> {
    const { targetRole, source } = await this.load(job.cvId);

    // A second attempt starts by reading again, and says so.
    await this.showStage(job.cvId, 'reading');

    const reading = await this.llm.readDocument({
      system: READ_SYSTEM,
      document: toDocumentBlock(source),
      instruction: READ_INSTRUCTION,
    });
    const passages = passagesFromMessage(reading);
    if (passages.length === 0) {
      // A scan, or a document with nothing in it: there is no text to quote.
      throw new GenerationError('no_readable_text', false, 'The model cited nothing');
    }
    const facts = passages.map((passage, index) => ({ ...passage, ref: index + 1 }));

    await this.showStage(job.cvId, 'questions');
    const answer = await this.llm.generateStructured({
      system: QUESTIONS_SYSTEM,
      user: questionsUserMessage(
        targetRole,
        facts.map(({ ref, quote }) => ({ ref, quote })),
      ),
      schema: questionsSchema,
      effort: 'low',
      maxTokens: 8000,
    });
    const questions = cleanQuestions(answer.questions);

    return async (manager) => {
      for (const fact of facts) {
        await manager.query(
          `INSERT INTO "facts" ("cv_id", "ref", "origin", "quote", "page")
           VALUES ($1, $2, 'source', $3, $4)`,
          [job.cvId, fact.ref, fact.quote, fact.page],
        );
      }
      for (const [index, question] of questions.entries()) {
        await manager.query(
          `INSERT INTO "questions" ("cv_id", "position", "section", "text") VALUES ($1, $2, $3, $4)`,
          [job.cvId, index + 1, question.section, question.text],
        );
      }
      // The facts are all that is needed from here on.
      await manager.query(`DELETE FROM "cv_sources" WHERE "cv_id" = $1`, [job.cvId]);

      if (questions.length > 0) {
        await manager.query(
          `UPDATE "cvs" SET "state" = 'awaiting_answers', "stage" = NULL, "updated_at" = now()
            WHERE "id" = $1`,
          [job.cvId],
        );
      } else {
        // Nothing to ask: the CV is written straight away.
        await manager.query(
          `UPDATE "cvs" SET "stage" = 'writing', "updated_at" = now() WHERE "id" = $1`,
          [job.cvId],
        );
        await manager.query(
          `INSERT INTO "generation_jobs" ("cv_id", "kind") VALUES ($1, 'compose')`,
          [job.cvId],
        );
      }
    };
  }

  private async load(cvId: string): Promise<{ targetRole: string; source: StoredSource }> {
    const [row] = await this.dataSource.query<
      { target_role: string; kind: 'pdf' | 'text'; pdf: Buffer | null; text: string | null }[]
    >(
      `SELECT "cvs"."target_role", "source"."kind", "source"."pdf", "source"."text"
         FROM "cvs" JOIN "cv_sources" "source" ON "source"."cv_id" = "cvs"."id"
        WHERE "cvs"."id" = $1`,
      [cvId],
    );
    if (row?.kind === 'pdf' && row.pdf) {
      return { targetRole: row.target_role, source: { kind: 'pdf', pdf: row.pdf } };
    }
    if (row?.kind === 'text' && row.text !== null) {
      return { targetRole: row.target_role, source: { kind: 'text', text: row.text } };
    }
    throw new GenerationError('generation_failed', false, 'The CV has no source to read');
  }

  /** Progress for the owner. Not part of the stage's result, so not in its transaction. */
  private async showStage(cvId: string, stage: 'reading' | 'questions'): Promise<void> {
    await this.dataSource.query(
      `UPDATE "cvs" SET "stage" = $2, "updated_at" = now()
        WHERE "id" = $1 AND "state" = 'generating'`,
      [cvId, stage],
    );
  }
}
