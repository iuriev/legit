import type { CvFailure, CvFailureCode } from '@cv-builder/contracts';

/** Failures the owner can retry by hand: another attempt may succeed. */
export const RETRYABLE_FAILURES: readonly CvFailureCode[] = [
  'service_unavailable',
  'generation_failed',
];

/** What the owner is told. Plain language, no internal detail. */
const MESSAGES: Record<CvFailureCode, string> = {
  service_unavailable: 'The AI service is not responding right now. Try again in a few minutes.',
  generation_failed: 'We could not finish your CV. Try again.',
  ai_not_configured: 'The AI service is not configured on this server.',
  declined: 'The AI service declined to process this document.',
  no_readable_text:
    'We could not read any text in this file. If it is a scan, paste the text of your CV instead.',
  source_too_long: 'This document is too long to process. Shorten it and start again.',
  request_rejected:
    'The AI service could not process this request. If you uploaded a PDF, check that it opens without a password, or paste the text instead.',
};

export function describeFailure(code: CvFailureCode): CvFailure {
  return { code, message: MESSAGES[code], retryable: RETRYABLE_FAILURES.includes(code) };
}
