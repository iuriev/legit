import type { DataSourceOptions } from 'typeorm';

import { migrations } from './migrations';

/**
 * Options shared by the running application and the migration CLI.
 * The schema changes only through migrations: `synchronize` stays off.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    migrations,
    migrationsTableName: 'migrations',
  };
}
