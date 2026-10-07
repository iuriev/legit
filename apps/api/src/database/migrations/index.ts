import type { MigrationInterface } from 'typeorm';

import { EnableExtensions1791400000000 } from './1791400000000-enable-extensions';
import { CreateUsers1791410000000 } from './1791410000000-create-users';
import { CreateCvs1791420000000 } from './1791420000000-create-cvs';

/**
 * Every migration, oldest first. Listed explicitly instead of through a glob
 * so the same list works from TypeScript sources, compiled output and Jest.
 */
export const migrations: (new () => MigrationInterface)[] = [
  EnableExtensions1791400000000,
  CreateUsers1791410000000,
  CreateCvs1791420000000,
];
