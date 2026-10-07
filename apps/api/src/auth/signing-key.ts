import { randomBytes } from 'node:crypto';

import type { DataSource } from 'typeorm';

const SECRET_NAME = 'session_signing_key';

/**
 * The key that signs session tokens. It is generated on the first start and
 * kept in the database, so each installation has its own key, sessions survive
 * a restart, and nobody has to supply a secret.
 *
 * The insert does nothing when a key exists, so two instances starting at the
 * same moment end up with the same one.
 */
export async function loadOrCreateSigningKey(dataSource: DataSource): Promise<string> {
  await dataSource.query(
    `INSERT INTO "app_secrets" ("name", "value") VALUES ($1, $2) ON CONFLICT ("name") DO NOTHING`,
    [SECRET_NAME, randomBytes(48).toString('base64url')],
  );
  const [row] = await dataSource.query<{ value: string }[]>(
    `SELECT "value" FROM "app_secrets" WHERE "name" = $1`,
    [SECRET_NAME],
  );
  if (!row) {
    throw new Error('The session signing key could not be read');
  }
  return row.value;
}
