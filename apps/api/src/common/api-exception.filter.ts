import type { ApiErrorBody, ApiErrorCode } from '@cv-builder/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { ApiException } from './api.exception';

const CODE_BY_STATUS: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthenticated',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'unsupported_media_type',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

/** What we say about a request the body parser refused, instead of the parser's own wording. */
const PARSER_MESSAGES: Partial<Record<number, string>> = {
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'The request body is too large',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'The request body has an unsupported type or encoding',
};

const INTERNAL_ERROR: ApiErrorBody = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  code: 'internal_error',
  message: 'Something went wrong on our side',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMessage(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

/**
 * The status of an error raised by the body parser for a request it refused
 * (too large, unknown charset or encoding). These are client errors but not
 * HttpExceptions; the parser marks them with `expose`.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (!isRecord(exception) || exception.expose !== true) {
    return undefined;
  }
  const { status } = exception;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/**
 * Turns anything thrown into the one error shape of the API. The detail of a
 * server error never leaves the server: it is logged and answered with a fixed
 * text. Client errors keep the message of whoever raised them.
 */
export function toErrorBody(exception: unknown): ApiErrorBody {
  if (exception instanceof ApiException) {
    return exception.getResponse() as ApiErrorBody;
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    if (statusCode >= 500) {
      return { ...INTERNAL_ERROR, statusCode };
    }
    const response = exception.getResponse();
    const message =
      isRecord(response) && isMessage(response.message) ? response.message : exception.message;
    // The validation pipe reports its findings as a list.
    const code = Array.isArray(message)
      ? 'validation_failed'
      : (CODE_BY_STATUS[statusCode] ?? 'bad_request');
    return { statusCode, code, message };
  }

  const statusCode = clientErrorStatus(exception);
  if (statusCode !== undefined) {
    return {
      statusCode,
      code: CODE_BY_STATUS[statusCode] ?? 'bad_request',
      message: PARSER_MESSAGES[statusCode] ?? 'The request could not be read',
    };
  }

  return INTERNAL_ERROR;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = toErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }
}
