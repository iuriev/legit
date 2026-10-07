import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnableExtensions1791400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Case-insensitive text, used for email addresses.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP EXTENSION IF EXISTS "citext"`);
  }
}
