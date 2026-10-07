import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Removes everything tests create and keeps what the migrations created. All
 * e2e files share one database, so each file calls this after every test.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = await dataSource.query<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  );
  if (tables.length > 0) {
    const names = tables.map((table) => `"${table.tablename}"`).join(', ');
    await dataSource.query(`TRUNCATE ${names} CASCADE`);
  }
}
