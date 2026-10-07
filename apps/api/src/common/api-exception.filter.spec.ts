import {
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { ApiException } from './api.exception';
import { toErrorBody } from './api-exception.filter';

describe('toErrorBody', () => {
  it('keeps the code and message of an error raised by the application', () => {
    const body = toErrorBody(new ApiException(HttpStatus.CONFLICT, 'conflict', 'Already running'));

    expect(body).toEqual({ statusCode: 409, code: 'conflict', message: 'Already running' });
  });

  it('gives a framework error the code of its status', () => {
    expect(toErrorBody(new NotFoundException('Cannot GET /api/nope'))).toEqual({
      statusCode: 404,
      code: 'not_found',
      message: 'Cannot GET /api/nope',
    });
  });

  it('reports a list of validation messages as a validation failure', () => {
    const body = toErrorBody(new BadRequestException(['email must be an email']));

    expect(body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: ['email must be an email'],
    });
  });

  it('answers a request the body parser refused with its status and a fixed message', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      expose: true,
    });

    expect(toErrorBody(tooLarge)).toEqual({
      statusCode: 413,
      code: 'payload_too_large',
      message: 'The request body is too large',
    });
  });

  it('does not trust a status on an error that is not marked for exposure', () => {
    const internal = Object.assign(new Error('upstream said 404'), { status: 404 });

    expect(toErrorBody(internal).code).toBe('internal_error');
  });

  it('ignores a code carried by an exception the application did not raise', () => {
    const foreign = new BadRequestException({ message: 'nope', code: 'E_FOREIGN' });

    expect(toErrorBody(foreign)).toEqual({ statusCode: 400, code: 'bad_request', message: 'nope' });
  });

  it('hides the detail of an unexpected error', () => {
    const body = toErrorBody(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    expect(body).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Something went wrong on our side',
    });
  });

  it('hides the detail of a server error raised as an HTTP exception', () => {
    const body = toErrorBody(new InternalServerErrorException('secret detail'));

    expect(body.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('secret detail');
  });
});
