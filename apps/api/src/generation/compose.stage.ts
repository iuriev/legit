import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { cvDocumentSchema } from '../cvs/cv-document.schema';
import { GenerationError } from '../jobs/generation-error';
import type { ClaimedJob, JobCommit } from '../jobs/job-handlers';
import { LlmClient } from '../llm/llm.client';
import { type CheckableFact, checkDraft, isEmptyDocument } from './checks';
import { type CvDraft, draftSchema } from './draft';
import { REWRITE_INSTRUCTION, WRITE_SYSTEM, type WriterFact, writeUserMessage } from './prompts';

interface StoredFact {
  ref: number;
  origin: 'source' | 'answer';
  quote: string;
  question: string | null;
}

/**
 * The second job of a generation: write the CV from the facts and let code
 * decide what of it is kept.
 *
 * The writer is given the facts and the target role, never the source. Its
 * draft goes through `checkDraft`. If items are rejected the writer gets one
 * more go, told what was rejected and why; whatever is rejected in that second
 * draft is left out, and the CV records how many items that was.
 */
@Injectable()
export class ComposeStage {
  constructor(
    private readonly dataSource: DataSource,
    private readonly llm: LlmClient,
  ) {}

  async run(job: ClaimedJob): Promise<JobCommit> {
    const { targetRole, facts } = await this.load(job.cvId);
    const writerFacts: WriterFact[] = facts.map((fact) => ({
      ref: fact.ref,
      source: fact.origin === 'answer' ? 'answer' : 'document',
      text: fact.quote,
      ...(fact.question === null ? {} : { inReplyTo: fact.question }),
    }));
    // The checks see the quoted passage or the answer, and nothing else:
    // not the question, which the model wrote.
    const checkable: CheckableFact[] = facts.map(({ ref, quote }) => ({ ref, quote }));

    await this.showStage(job.cvId, 'writing');
    const draft = await this.write(WRITE_SYSTEM, writeUserMessage(targetRole, writerFacts));

    await this.showStage(job.cvId, 'checking');
    let checked = checkDraft(draft, checkable);
    if (checked.rejected.length > 0) {
      const rewritten = await this.write(
        `${WRITE_SYSTEM}\n\n${REWRITE_INSTRUCTION}`,
        writeUserMessage(targetRole, writerFacts, {
          previousDraft: draft,
          rejected: checked.rejected,
        }),
      );
      checked = checkDraft(rewritten, checkable);
    }

    // What is stored is a CV document like any a user could save.
    const document = cvDocumentSchema.safeParse(checked.document);
    if (!document.success) {
      throw new GenerationError('generation_failed', true, 'The checked draft is not a valid CV');
    }
    if (isEmptyDocument(document.data)) {
      // Better a failure the user can retry than a "ready" CV with nothing in it.
      throw new GenerationError(
        'generation_failed',
        true,
        'Nothing in the draft passed the checks',
      );
    }
    const omitted = checked.rejected.length;

    return async (manager) => {
      await manager.query(
        `UPDATE "cvs"
            SET "state" = 'ready', "stage" = NULL, "document" = $2, "omitted_count" = $3,
                "updated_at" = now()
          WHERE "id" = $1`,
        [job.cvId, JSON.stringify(document.data), omitted],
      );
    };
  }

  private write(system: string, user: string): Promise<CvDraft> {
    return this.llm.generateStructured({
      system,
      user,
      schema: draftSchema,
      effort: 'medium',
      maxTokens: 16000,
    });
  }

  private async load(cvId: string): Promise<{ targetRole: string; facts: StoredFact[] }> {
    const [cv] = await this.dataSource.query<{ target_role: string }[]>(
      `SELECT "target_role" FROM "cvs" WHERE "id" = $1`,
      [cvId],
    );
    const facts = await this.dataSource.query<StoredFact[]>(
      `SELECT "fact"."ref", "fact"."origin", "fact"."quote", "question"."text" AS "question"
         FROM "facts" "fact"
         LEFT JOIN "questions" "question" ON "question"."id" = "fact"."question_id"
        WHERE "fact"."cv_id" = $1
        ORDER BY "fact"."ref"`,
      [cvId],
    );
    if (!cv || facts.length === 0) {
      throw new GenerationError('generation_failed', false, 'The CV has no facts to write from');
    }
    return { targetRole: cv.target_role, facts };
  }

  /** Progress for the owner. Not part of the stage's result, so not in its transaction. */
  private async showStage(cvId: string, stage: 'writing' | 'checking'): Promise<void> {
    await this.dataSource.query(
      `UPDATE "cvs" SET "stage" = $2, "updated_at" = now()
        WHERE "id" = $1 AND "state" = 'generating'`,
      [cvId, stage],
    );
  }
}
