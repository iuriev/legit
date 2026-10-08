import Anthropic from '@anthropic-ai/sdk';

import { GenerationError } from '../jobs/generation-error';

/**
 * Says what a failed call to the model service means for the generation:
 * which reason the user is given and whether another attempt can help.
 * Most specific class first; `APIConnectionError` is a subclass of `APIError`.
 */
export function toGenerationError(error: unknown): GenerationError {
  if (error instanceof GenerationError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const options = { cause: error };

  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new GenerationError('ai_not_configured', false, message, options);
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    // Rate limit, overload, a server fault, a dropped connection or a timeout.
    return new GenerationError('service_unavailable', true, message, options);
  }
  if (error instanceof Anthropic.APIError) {
    if (error.status === 402) {
      return new GenerationError('ai_not_configured', false, message, options);
    }
    if (error.status === 413) {
      return new GenerationError('source_too_long', false, message, options);
    }
    // Any other rejection of the request (a PDF it cannot open, a wrong model
    // name): sending the same request again cannot help.
    return new GenerationError('request_rejected', false, message, options);
  }
  // Not an answer of the service at all; the caller's default applies.
  return new GenerationError('generation_failed', true, message, options);
}
