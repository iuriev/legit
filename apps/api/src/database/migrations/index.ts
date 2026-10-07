import type { MigrationInterface } from 'typeorm';

import { EnableExtensions1791400000000 } from './1791400000000-enable-extensions';

/**
 * Every migration, oldest first. Listed explicitly instead of through a glob
 * so the same list works from TypeScript sources, compiled output and Jest.
 */
export const migrations: (new () => MigrationInterface)[] = [EnableExtensions1791400000000];
