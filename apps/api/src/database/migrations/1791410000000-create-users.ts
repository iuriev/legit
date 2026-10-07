import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1791410000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // citext makes the unique constraint on email case-insensitive.
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" citext NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Values the installation generates for itself, such as the key that signs sessions.
    await queryRunner.query(`
      CREATE TABLE "app_secrets" (
        "name" text PRIMARY KEY,
        "value" text NOT NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_secrets"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
