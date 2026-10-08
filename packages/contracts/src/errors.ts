/**
 * Stable identifiers of API errors. The web app branches on `code`, never on
 * the status text or the message.
 */
export type ApiErrorCode =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'bad_request'
  | 'internal_error'
  // Authentication
  | 'email_taken'
  | 'invalid_credentials'
  // CVs
  | 'invalid_source'
  | 'generation_running'
  | 'cv_limit_reached'
  | 'not_retryable'
  | 'invalid_answers'
  | 'invalid_state'
  | 'version_conflict';

/** The body of every error response of the API. */
export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  /** Human-readable. A list when several fields failed validation. */
  message: string | string[];
}
