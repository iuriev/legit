import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Whether the source was read as a description of a person's background. True
 * for the CVs that exist: they were generated before anything asked.
 */
export class AddSourceDescribesBackground1791450000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cvs" ADD COLUMN "source_describes_background" boolean NOT NULL DEFAULT true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cvs" DROP COLUMN "source_describes_background"`);
  }
}
