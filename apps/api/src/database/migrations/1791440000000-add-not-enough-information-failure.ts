import type { MigrationInterface, QueryRunner } from 'typeorm';

const CODES = [
  'service_unavailable',
  'generation_failed',
  'ai_not_configured',
  'declined',
  'no_readable_text',
  'source_too_long',
  'request_rejected',
];

const check = (codes: string[]) =>
  `CHECK ("failure_code" IN (${codes.map((code) => `'${code}'`).join(', ')}))`;

/** A failure for a CV that cannot be written because the facts hold nothing to write from. */
export class AddNotEnoughInformationFailure1791440000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cvs" DROP CONSTRAINT "cvs_failure_code_check"`);
    await queryRunner.query(
      `ALTER TABLE "cvs" ADD CONSTRAINT "cvs_failure_code_check" ${check([...CODES, 'not_enough_information'])}`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cvs" SET "failure_code" = 'generation_failed' WHERE "failure_code" = 'not_enough_information'`,
    );
    await queryRunner.query(`ALTER TABLE "cvs" DROP CONSTRAINT "cvs_failure_code_check"`);
    await queryRunner.query(
      `ALTER TABLE "cvs" ADD CONSTRAINT "cvs_failure_code_check" ${check(CODES)}`,
    );
  }
}
