import type { AuthResponse } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

/**
 * Removes everything tests create: accounts, and with them their CVs, sources,
 * facts, questions and jobs through the foreign keys. The session signing key
 * stays. All e2e files share one database, so each file calls this after every
 * test.
 *
 * A DELETE rather than a TRUNCATE: the background worker queries these tables
 * all the time, and a TRUNCATE would have to lock every one of them against it.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  await app.get(DataSource).query(`DELETE FROM "users"`);
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

/** The smallest thing the API accepts as a PDF: it checks the marker and never parses the file. */
export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

/** Starts a CV from pasted text and returns its id. */
export async function createCv(
  app: INestApplication<App>,
  cookie: string,
  targetRole = 'Senior Backend Engineer',
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/cvs')
    .set('Cookie', cookie)
    .field('targetRole', targetRole)
    .field('text', 'Five years of Node.js at Acme.')
    .expect(201);
  return (response.body as { id: string }).id;
}

/** Polls until the check returns a value, for effects of the background worker. */
export async function waitFor<T>(
  check: () => Promise<T | undefined | null | false>,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('The expected state was not reached in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
