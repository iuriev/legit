import type { ApiErrorBody, ApiErrorCode } from '@cv-builder/contracts';
import { HttpException, type HttpStatus } from '@nestjs/common';

/** An error the client can branch on: an HTTP status with a stable `code`. */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ApiErrorCode, message: string | string[]) {
    const body: ApiErrorBody = { statusCode: status, code, message };
    super(body, status);
  }
}
