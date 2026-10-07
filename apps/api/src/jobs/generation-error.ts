import type { CvFailureCode } from '@cv-builder/contracts';

/**
 * A failure of a generation stage with a known cause. `retryable` says whether
 * another attempt can help: a rate limit can pass, a scanned PDF cannot.
 */
export class GenerationError extends Error {
  constructor(
    readonly code: CvFailureCode,
    readonly retryable: boolean,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GenerationError';
  }
}

export interface Failure {
  code: CvFailureCode;
  retryable: boolean;
  /** For the log and the job row; never shown to the user. */
  detail: string;
}

const DETAIL_MAX_LENGTH = 500;

/**
 * Decides what a thrown error means for the job. An error nobody classified
 * is treated as transient: it gets the remaining attempts and then fails the
 * CV with a generic reason.
 */
export function classifyFailure(error: unknown): Failure {
  const detail = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(
    0,
    DETAIL_MAX_LENGTH,
  );
  if (error instanceof GenerationError) {
    return { code: error.code, retryable: error.retryable, detail };
  }
  return { code: 'generation_failed', retryable: true, detail };
}
