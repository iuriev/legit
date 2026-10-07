import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type * as AuthModule from '../src/auth/auth.module';
import type * as Helpers from './helpers';
import type * as TestApp from './test-app';

const LIMIT = 3;

describe('Throttling of credential endpoints (e2e)', () => {
  const originalLimit = process.env.AUTH_RATE_LIMIT_PER_MINUTE;
  let app: INestApplication<App>;
  let helpers: typeof Helpers;
  let clientLimit: number;

  const attemptLogin = (ip: string, email = 'nobody@example.com') =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'whatever' });

  beforeAll(async () => {
    // The limit is read when AppModule is first loaded, so it is set before that.
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = String(LIMIT);
    helpers = jest.requireActual<typeof Helpers>('./helpers');
    clientLimit =
      LIMIT * jest.requireActual<typeof AuthModule>('../src/auth/auth.module').CLIENT_LIMIT_FACTOR;
    app = await jest.requireActual<typeof TestApp>('./test-app').createTestApp();
  });

  afterAll(async () => {
    await helpers.resetDatabase(app);
    await app.close();
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = originalLimit;
  });

  it('rejects sign-in requests for one account above the limit', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await attemptLogin('203.0.113.10').expect(401);
    }

    const response = await attemptLogin('203.0.113.10').expect(429);
    expect(response.body).toEqual({
      statusCode: 429,
      code: 'rate_limited',
      message: 'Too many attempts. Try again in a minute.',
    });
  });

  it('treats the same email in another case as the same account', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await attemptLogin('203.0.113.15', 'Victim@Example.com').expect(401);
    }

    await attemptLogin('203.0.113.15', ' victim@example.COM ').expect(429);
  });

  it('counts each client separately', async () => {
    await attemptLogin('203.0.113.20').expect(401);
  });

  it('counts each account separately for one client', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await attemptLogin('203.0.113.25', 'first@example.com').expect(401);
    }

    await attemptLogin('203.0.113.25', 'second@example.com').expect(401);
  });

  it('shares one budget between sign-in and registration', async () => {
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      await attemptLogin('203.0.113.50', 'shared@example.com').expect(401);
    }

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-For', '203.0.113.50')
      .send({ email: 'shared@example.com', password: helpers.PASSWORD })
      .expect(429);
  });

  it('limits registration as well', async () => {
    const register = () =>
      request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', '203.0.113.30')
        .send({ email: 'repeat@example.com', password: helpers.PASSWORD });

    // The first request creates the account, the next ones find the email taken.
    await register().expect(201);
    for (let attempt = 1; attempt < LIMIT; attempt += 1) {
      await register().expect(409);
    }
    await register().expect(429);
  });

  it('caps what one client can send across many accounts', async () => {
    for (let attempt = 0; attempt < clientLimit; attempt += 1) {
      await attemptLogin('203.0.113.60', `user${String(attempt)}@example.com`).expect(401);
    }

    await attemptLogin('203.0.113.60', 'one-more@example.com').expect(429);
  });

  it('does not limit other routes', async () => {
    for (let attempt = 0; attempt < LIMIT + 2; attempt += 1) {
      await request(app.getHttpServer())
        .get('/api/health')
        .set('X-Forwarded-For', '203.0.113.40')
        .expect(200);
    }
  });
});
