import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type * as Helpers from './helpers';
import type * as TestApp from './test-app';

const LIMIT = 3;

/**
 * The default: TRUST_PROXY is not set, so nothing a caller writes in a
 * forwarding header is believed.
 */
describe('Forwarding headers without a trusted proxy (e2e)', () => {
  const original = {
    trustProxy: process.env.TRUST_PROXY,
    limit: process.env.AUTH_RATE_LIMIT_PER_MINUTE,
  };
  let app: INestApplication<App>;
  let helpers: typeof Helpers;

  beforeAll(async () => {
    // Both are read when the application starts, so they are set before that.
    delete process.env.TRUST_PROXY;
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = String(LIMIT);
    helpers = jest.requireActual<typeof Helpers>('./helpers');
    app = await jest.requireActual<typeof TestApp>('./test-app').createTestApp();
  });

  afterAll(async () => {
    await helpers.resetDatabase(app);
    await app.close();
    process.env.TRUST_PROXY = original.trustProxy;
    process.env.AUTH_RATE_LIMIT_PER_MINUTE = original.limit;
  });

  it('does not let a caller escape the rate limit by naming another client address', async () => {
    const attempt = (forwardedFor: string) =>
      request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', forwardedFor)
        .send({ email: 'victim@example.com', password: 'whatever' });

    for (let index = 0; index < LIMIT; index += 1) {
      await attempt(`203.0.113.${String(index)}`).expect(401);
    }

    await attempt('203.0.113.200').expect(429);
  });

  it('does not mark the cookie Secure because a caller claims HTTPS', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('X-Forwarded-Proto', 'https')
      .send({ email: 'someone@example.com', password: helpers.PASSWORD })
      .expect(201);

    const setCookie = (response.headers['set-cookie'] as unknown as string[]).join();
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).not.toMatch(/Secure/i);
  });
});
