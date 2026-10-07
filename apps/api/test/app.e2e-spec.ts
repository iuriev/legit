import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { resetDatabase } from './helpers';
import { createTestApp } from './test-app';

describe('Application (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports healthy when the database is reachable', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('applies the migrations on start', async () => {
    const applied = await app
      .get(DataSource)
      .query<{ name: string }[]>(`SELECT name FROM migrations ORDER BY id`);

    expect(applied.map((row) => row.name)).toContain('EnableExtensions1791400000000');
  });

  it('answers unknown routes with a JSON 404 in the error shape of the API', async () => {
    const response = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);

    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ statusCode: 404, code: 'not_found' });
  });

  // Outside /api the web server answers, so only the status matters here.
  it('serves routes only under the /api prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('answers a malformed JSON body with a 400 in the error shape of the API', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400, code: 'bad_request' });
  });

  it('answers a JSON body over the size limit with 413, not a server error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/health')
      .send({ filler: 'a'.repeat(200_000) })
      .expect(413);

    expect(response.body).toEqual({
      statusCode: 413,
      code: 'payload_too_large',
      message: 'The request body is too large',
    });
  });

  it('answers a body in an unknown charset with 415', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/health')
      .set('Content-Type', 'application/json; charset=bogus')
      .send('{}')
      .expect(415);

    expect(response.body).toMatchObject({ code: 'unsupported_media_type' });
  });

  it('sets security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
