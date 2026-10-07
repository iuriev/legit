import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import type { Env } from './config/env';

export const API_PREFIX = 'api';

/**
 * HTTP-level configuration shared by the real server and the e2e tests, so
 * tests exercise the same pipes, prefix and middleware as production.
 */
export function setupApp(app: NestExpressApplication): void {
  // Which peers may name the client and the protocol in forwarding headers.
  // Unset, the headers are ignored: trusting them from anyone would let a
  // caller pick its own rate-limit key.
  const trustProxy = app
    .get<ConfigService<Env, true>>(ConfigService)
    .get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    app.set('trust proxy', trustProxy);
  }

  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
