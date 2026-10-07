import type { AuthResponse } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

/**
 * Removes everything tests create and keeps what the migrations and the first
 * start created (the session signing key). All
 * e2e files share one database, so each file calls this after every test.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const tables = await dataSource.query<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('migrations', 'app_secrets')`,
  );
  if (tables.length > 0) {
    const names = tables.map((table) => `"${table.tablename}"`).join(', ');
    await dataSource.query(`TRUNCATE ${names} CASCADE`);
  }
}

export const PASSWORD = 'correct horse battery';

export interface Session {
  /** `session=...`, ready for a Cookie header. */
  cookie: string;
  /** The raw Set-Cookie header, for asserting attributes. */
  setCookie: string;
  body: AuthResponse;
}

function readSession(response: request.Response): Session {
  const setCookie = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(
    (header) => header.startsWith('session='),
  );
  if (!setCookie) {
    throw new Error('The response did not set a session cookie');
  }
  return {
    cookie: setCookie.split(';')[0] ?? '',
    setCookie,
    body: response.body as AuthResponse,
  };
}

export async function register(
  app: INestApplication<App>,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password })
    .expect(201);
  return readSession(response);
}

export async function login(
  app: INestApplication<App>,
  email: string,
  password = PASSWORD,
): Promise<Session> {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return readSession(response);
}
