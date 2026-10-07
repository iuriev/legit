import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCvs1791420000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cvs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "target_role" text NOT NULL,
        "state" text NOT NULL
          CHECK ("state" IN ('generating', 'awaiting_answers', 'ready', 'failed')),
        "stage" text CHECK ("stage" IN ('reading', 'questions', 'writing', 'checking')),
        "failure_code" text CHECK ("failure_code" IN (
          'service_unavailable', 'generation_failed', 'ai_not_configured',
          'declined', 'no_readable_text', 'source_too_long')),
        "document" jsonb,
        "omitted_count" integer NOT NULL DEFAULT 0,
        "version" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "cvs_failure_code_only_when_failed"
          CHECK (("state" = 'failed') = ("failure_code" IS NOT NULL)),
        CONSTRAINT "cvs_stage_only_when_generating"
          CHECK ("stage" IS NULL OR "state" = 'generating'),
        CONSTRAINT "cvs_ready_has_document"
          CHECK ("state" <> 'ready' OR "document" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "cvs_user_id_created_at" ON "cvs" ("user_id", "created_at" DESC)`,
    );
    // At most one running generation per user, decided by the database so that
    // two simultaneous requests cannot both start one.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "cvs_one_generating_per_user" ON "cvs" ("user_id")
        WHERE "state" = 'generating'`,
    );

    // The uploaded file or pasted text. Deleted once the facts are extracted.
    await queryRunner.query(`
      CREATE TABLE "cv_sources" (
        "cv_id" uuid PRIMARY KEY REFERENCES "cvs" ("id") ON DELETE CASCADE,
        "kind" text NOT NULL CHECK ("kind" IN ('pdf', 'text')),
        "pdf" bytea,
        "text" text,
        CONSTRAINT "cv_sources_content_matches_kind" CHECK (
          ("kind" = 'pdf' AND "pdf" IS NOT NULL AND "text" IS NULL)
          OR ("kind" = 'text' AND "text" IS NOT NULL AND "pdf" IS NULL)
        )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "questions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cv_id" uuid NOT NULL REFERENCES "cvs" ("id") ON DELETE CASCADE,
        "position" integer NOT NULL,
        "section" text NOT NULL
          CHECK ("section" IN ('contact', 'summary', 'experience', 'education', 'skills')),
        "text" text NOT NULL,
        "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'answered', 'skipped')),
        "answer" text,
        UNIQUE ("cv_id", "position"),
        CONSTRAINT "questions_answer_only_when_answered"
          CHECK (("status" = 'answered') = ("answer" IS NOT NULL))
      )
    `);

    // A fact is a passage quoted from the source, or an answer of the user.
    // "ref" is the small per-CV number by which the model names a fact.
    await queryRunner.query(`
      CREATE TABLE "facts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cv_id" uuid NOT NULL REFERENCES "cvs" ("id") ON DELETE CASCADE,
        "ref" integer NOT NULL,
        "origin" text NOT NULL CHECK ("origin" IN ('source', 'answer')),
        "quote" text NOT NULL,
        "page" integer,
        "question_id" uuid REFERENCES "questions" ("id") ON DELETE CASCADE,
        UNIQUE ("cv_id", "ref"),
        CONSTRAINT "facts_question_only_for_answers"
          CHECK (("origin" = 'answer') = ("question_id" IS NOT NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "generation_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "cv_id" uuid NOT NULL REFERENCES "cvs" ("id") ON DELETE CASCADE,
        "kind" text NOT NULL CHECK ("kind" IN ('extract', 'compose')),
        "status" text NOT NULL DEFAULT 'queued'
          CHECK ("status" IN ('queued', 'running', 'done', 'failed')),
        "attempts" integer NOT NULL DEFAULT 0,
        "run_after" timestamptz NOT NULL DEFAULT now(),
        "locked_until" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz
      )
    `);
    // The jobs of a CV, newest first: for a retry and for the cascade of a delete.
    await queryRunner.query(
      `CREATE INDEX "generation_jobs_cv_id_created_at"
          ON "generation_jobs" ("cv_id", "created_at" DESC)`,
    );
    // What the worker scans for work: only unfinished jobs, oldest first.
    await queryRunner.query(
      `CREATE INDEX "generation_jobs_unfinished" ON "generation_jobs" ("created_at")
        WHERE "status" IN ('queued', 'running')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "generation_jobs"`);
    await queryRunner.query(`DROP TABLE "facts"`);
    await queryRunner.query(`DROP TABLE "questions"`);
    await queryRunner.query(`DROP TABLE "cv_sources"`);
    await queryRunner.query(`DROP TABLE "cvs"`);
  }
}
