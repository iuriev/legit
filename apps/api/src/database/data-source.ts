import 'reflect-metadata';

import { existsSync } from 'node:fs';

import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from './typeorm-options';

// Data source for the TypeORM CLI (`pnpm --filter @cv-builder/api migration:run`).
// The CLI does not go through ConfigModule, so the local .env is loaded here.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource(buildDataSourceOptions(databaseUrl));
