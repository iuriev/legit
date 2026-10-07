import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import type { Observable } from 'rxjs';

import { ApiException } from '../common/api.exception';
import { SOURCE_PDF_MAX_BYTES, SOURCE_TEXT_MAX_LENGTH } from './dto/create-cv.dto';

/** A character takes at most four bytes in UTF-8. */
const TEXT_FIELD_MAX_BYTES = SOURCE_TEXT_MAX_LENGTH * 4;

function toApiException(error: unknown): unknown {
  if (!(error instanceof MulterError)) {
    return error;
  }
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        'The PDF may be at most 5 MB.',
      );
    case 'LIMIT_FIELD_VALUE':
      return new ApiException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        error.field === 'text'
          ? `The text may be at most ${String(SOURCE_TEXT_MAX_LENGTH)} characters.`
          : 'A field of the request is too long.',
      );
    default:
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        'invalid_source',
        'Send a target role and either one PDF file or text.',
      );
  }
}

/**
 * Reads the multipart request of `POST /api/cvs`: at most one file, named
 * `file`, held in memory and cut off at the size limit while it is received.
 * The limits are enforced here, before anything else looks at the upload.
 */
@Injectable()
export class SourceUploadInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: SOURCE_PDF_MAX_BYTES,
      files: 1,
      fields: 2,
      fieldSize: TEXT_FIELD_MAX_BYTES,
      parts: 3,
    },
  }).single('file');

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    await new Promise<void>((resolve, reject) => {
      this.upload(http.getRequest<Request>(), http.getResponse<Response>(), (error: unknown) => {
        if (error) {
          // The error is already an Error or becomes one in the exception filter.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(toApiException(error));
        } else {
          resolve();
        }
      });
    });
    return next.handle();
  }
}
