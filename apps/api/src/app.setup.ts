import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export const API_PREFIX = 'api';

/**
 * HTTP-level configuration shared by the real server and the e2e tests, so
 * tests exercise the same pipes, prefix and middleware as production.
 */
export function setupApp(app: NestExpressApplication): void {
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
