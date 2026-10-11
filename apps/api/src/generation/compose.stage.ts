import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { cvDocumentSchema } from '../cvs/cv-document.schema';
import { GenerationError } from '../jobs/generation-error';
import type { ClaimedJob, JobCommit } from '../jobs/job-handlers';
import { LlmClient } from '../llm/llm.client';
import { type CheckableFact, checkDraft, cleanItemText, countItems, saysWhoOrWhat } from './checks';
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
    const { targetRole, facts, describesBackground } = await this.load(job.cvId);
    if (!describesBackground && !facts.some((fact) => fact.origin === 'answer')) {
      // The source was read as something other than a person's background, and
      // the owner added nothing of their own. Whatever the writer made of such
      // facts would not be a CV of anyone. The reading is the model's; that no
      // answer was given is ours to see, and one answer is enough to go on.
      throw new GenerationError(
        'not_enough_information',
        false,
        'The source does not describe a background and no question was answered',
      );
    }
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
    // What the writer first meant to say: the items that passed and the ones that did not.
    const intended = countItems(checked.document) + checked.rejected.length;
    const rewrote = checked.rejected.length > 0;
    if (rewrote) {
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
    if (!saysWhoOrWhat(document.data)) {
      // Better a failure than a "ready" CV of nobody. A writer whose first
      // draft named nobody and no position found none in the facts, and would
      // find none again. One that did write a name or a position and lost them
      // to the checks may have erred, so the attempt is repeated; the reason
      // the owner is given in the end is the same.
      const lostToChecks =
        cleanItemText(draft.contact.fullName.value) !== '' || draft.experience.length > 0;
      throw new GenerationError(
        'not_enough_information',
        lostToChecks,
        lostToChecks
          ? 'No name and no position passed the checks'
          : 'The writer found no name and no position',
      );
    }
    // After a rewrite, an item is missing whether the check refused it again
    // or the writer took it out: either way the owner should hear of it.
    const omitted = rewrote
      ? Math.max(checked.rejected.length, intended - countItems(document.data))
      : 0;

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

  private async load(
    cvId: string,
  ): Promise<{ targetRole: string; facts: StoredFact[]; describesBackground: boolean }> {
    const [cv] = await this.dataSource.query<
      { target_role: string; source_describes_background: boolean }[]
    >(`SELECT "target_role", "source_describes_background" FROM "cvs" WHERE "id" = $1`, [cvId]);
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
    return {
      targetRole: cv.target_role,
      facts,
      describesBackground: cv.source_describes_background,
    };
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
