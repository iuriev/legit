import type { ApiErrorBody, AuthResponse } from '@cv-builder/contracts';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { login, PASSWORD, register, resetDatabase } from './helpers';
import { createTestApp } from './test-app';

const EMAIL = 'user@example.com';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const http = () => request(app.getHttpServer());
  const count = async (table: string) =>
    Number(
      (await dataSource.query<{ count: string }[]>(`SELECT count(*) FROM ${table}`))[0]?.count,
    );
  const setCookies = (response: request.Response) =>
    (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  afterEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('registration', () => {
    it('creates an account and starts a session', async () => {
      const session = await register(app, EMAIL);

      expect(session.body.user.email).toBe(EMAIL);
      expect(await count('users')).toBe(1);
      const me = await http().get('/api/auth/me').set('Cookie', session.cookie).expect(200);
      expect((me.body as AuthResponse).user).toEqual(session.body.user);
    });

    it('stores a hash, never the password', async () => {
      await register(app, EMAIL);

      const [row] = await dataSource.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM users`,
      );
      expect(row?.password_hash).toMatch(/^\$2[aby]\$/);
      expect(row?.password_hash).not.toContain(PASSWORD);
    });

    it('rejects an email that already has an account and starts no session', async () => {
      await register(app, EMAIL);

      const response = await http()
        .post('/api/auth/register')
        .send({ email: EMAIL, password: 'another password' })
        .expect(409);

      expect((response.body as ApiErrorBody).code).toBe('email_taken');
      expect(setCookies(response)).toEqual([]);
      expect(await count('users')).toBe(1);
    });

    it('treats the same email in a different case as already registered', async () => {
      await register(app, EMAIL);

      const response = await http()
        .post('/api/auth/register')
        .send({ email: ' User@Example.COM ', password: PASSWORD })
        .expect(409);

      expect((response.body as ApiErrorBody).code).toBe('email_taken');
    });

    it('refuses the same email in a different case in the database itself', async () => {
      await register(app, EMAIL);

      // The API lower-cases emails before storing them; this bypasses it.
      await expect(
        dataSource.query(`INSERT INTO users (email, password_hash) VALUES ($1, 'x')`, [
          'User@Example.com',
        ]),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });

    it('lets only one of two simultaneous registrations of an email succeed', async () => {
      const attempt = () =>
        http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD });

      const statuses = (await Promise.all([attempt(), attempt()])).map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409]);
      expect(await count('users')).toBe(1);
    });

    it.each([
      ['a password shorter than 8 characters', { email: EMAIL, password: 'short12' }],
      ['a password longer than 72 characters', { email: EMAIL, password: 'a'.repeat(73) }],
      ['a password longer than 72 bytes', { email: EMAIL, password: 'я'.repeat(40) }],
      ['a malformed email', { email: 'not-an-email', password: PASSWORD }],
      ['a missing password', { email: EMAIL }],
      ['a field the API does not know', { email: EMAIL, password: PASSWORD, role: 'admin' }],
    ])('rejects %s with a validation error and creates no account', async (_name, body) => {
      const response = await http().post('/api/auth/register').send(body).expect(400);

      expect((response.body as ApiErrorBody).code).toBe('validation_failed');
      expect(await count('users')).toBe(0);
    });
  });

  describe('sign-in', () => {
    it('starts a session for correct credentials', async () => {
      const registered = await register(app, EMAIL);

      const session = await login(app, EMAIL);

      expect(session.body.user).toEqual(registered.body.user);
    });

    it('treats the email case-insensitively and ignores surrounding whitespace', async () => {
      const registered = await register(app, EMAIL);

      const session = await login(app, '  User@Example.com ');

      expect(session.body.user.id).toBe(registered.body.user.id);
    });

    it('answers a wrong password and an unknown email with the same error and no session', async () => {
      await register(app, EMAIL);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email: EMAIL, password: 'wrong password' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect((wrongPassword.body as ApiErrorBody).code).toBe('invalid_credentials');
      expect(setCookies(wrongPassword)).toEqual([]);
      expect(setCookies(unknownEmail)).toEqual([]);
    });

    it('does not accept a longer password whose first 72 bytes match', async () => {
      const password = 'a'.repeat(72);
      await register(app, EMAIL, password);

      await http()
        .post('/api/auth/login')
        .send({ email: EMAIL, password: `${password}b` })
        .expect(401);
    });

    it('shows the same account on a second device', async () => {
      const first = await register(app, EMAIL);

      const second = await login(app, EMAIL);

      expect(second.cookie).not.toBe('');
      const me = await http().get('/api/auth/me').set('Cookie', second.cookie).expect(200);
      expect((me.body as AuthResponse).user.id).toBe(first.body.user.id);
    });
  });

  describe('session', () => {
    it('keeps the cookie from page scripts and from cross-site requests that change data', async () => {
      const session = await register(app, EMAIL);

      expect(session.setCookie).toMatch(/HttpOnly/i);
      expect(session.setCookie).toMatch(/SameSite=Lax/i);
      expect(session.setCookie).toMatch(/Path=\//i);
    });

    it('marks the cookie Secure only when the request arrived over HTTPS', async () => {
      const overHttp = await register(app, EMAIL);
      const overHttps = await http()
        .post('/api/auth/login')
        .set('X-Forwarded-Proto', 'https')
        .send({ email: EMAIL, password: PASSWORD })
        .expect(200);

      expect(overHttp.setCookie).not.toMatch(/Secure/i);
      expect(setCookies(overHttps).join()).toMatch(/Secure/i);
    });

    it('rejects a protected route without a cookie', async () => {
      const response = await http().get('/api/auth/me').expect(401);

      expect((response.body as ApiErrorBody).code).toBe('unauthenticated');
    });

    it('rejects a cookie that was modified', async () => {
      const session = await register(app, EMAIL);
      const tampered = session.cookie.slice(0, -3) + 'abc';

      await http().get('/api/auth/me').set('Cookie', tampered).expect(401);
    });

    it('rejects a token that the system did not issue', async () => {
      const session = await register(app, EMAIL);
      const forged = await new JwtService({
        secret: 'some-other-key-some-other-key-012345',
      }).signAsync({ sub: session.body.user.id });

      await http().get('/api/auth/me').set('Cookie', `session=${forged}`).expect(401);
    });

    it('rejects an unsigned token', async () => {
      const session = await register(app, EMAIL);
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: session.body.user.id })}.`;

      await http().get('/api/auth/me').set('Cookie', `session=${unsigned}`).expect(401);
    });

    it('rejects a valid session of an account that no longer exists', async () => {
      const session = await register(app, EMAIL);
      await dataSource.query(`DELETE FROM users`);

      await http().get('/api/auth/me').set('Cookie', session.cookie).expect(401);
    });

    it('clears the cookie on sign-out', async () => {
      const session = await register(app, EMAIL);

      const response = await http()
        .post('/api/auth/logout')
        .set('Cookie', session.cookie)
        .expect(204);

      const cleared = setCookies(response).find((header) => header.startsWith('session='));
      expect(cleared).toMatch(/^session=;/);
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  describe('signing key', () => {
    it('is generated once and reused by a second start', async () => {
      const session = await register(app, EMAIL);
      const secondStart = await createTestApp();

      try {
        await request(secondStart.getHttpServer())
          .get('/api/auth/me')
          .set('Cookie', session.cookie)
          .expect(200);
        expect(await count('app_secrets')).toBe(1);
      } finally {
        await secondStart.close();
      }
    });

    it('survives the reset between tests, which removes the accounts', async () => {
      await register(app, EMAIL);

      await resetDatabase(app);

      expect(await count('users')).toBe(0);
      expect(await count('app_secrets')).toBe(1);
    });
  });
});
