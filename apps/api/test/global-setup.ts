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
  // Password hashing dominates test time at the production cost factor.
  process.env.BCRYPT_ROUNDS = '4';
  // One test client makes far more auth requests than a real one; the limit has its own test.
  process.env.AUTH_RATE_LIMIT_PER_MINUTE = '1000';
  // supertest connects over loopback; this lets tests act as different clients.
  process.env.TRUST_PROXY = 'loopback';
  // The worker reacts at once and does not wait between attempts.
  process.env.WORKER_POLL_INTERVAL_MS = '20';
  process.env.WORKER_RETRY_DELAYS_MS = '0,0';
  process.env.WORKER_SHUTDOWN_GRACE_MS = '200';
}
