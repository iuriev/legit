import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import type { Env } from './config/env';

export const API_PREFIX = 'api';
/**
 * The limits of a CV document are in characters; a character takes up to three
 * bytes in a request, so this covers a document at its limits in any script.
 */
export const JSON_BODY_LIMIT = '1500kb';

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
  // A CV at the limits of its schema is larger than the parser's default of
  // 100 kB. The limit is the same for every JSON route: the other routes bound
  // their fields by validation, and parsing a body of this size costs little.
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
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
