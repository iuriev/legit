import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Starts one throwaway PostgreSQL for the whole e2e run and points the app at it.
 * Values set here win over a developer's .env file.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  globalThis.__POSTGRES_CONTAINER__ = container;

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = 'test';
}
