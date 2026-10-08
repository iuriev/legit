import type { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

export interface LlmOptions {
  /** Undefined when no key is configured: every call then fails as "not configured". */
  apiKey: string | undefined;
  /** Set only to point the SDK at something other than the Anthropic API. */
  baseURL: string | undefined;
  model: string;
  timeoutMs: number;
  /** The largest request the reading stage will send, in input tokens. */
  inputTokenBudget: number;
}

export const LLM_OPTIONS = Symbol('LLM_OPTIONS');

export function llmOptionsFromConfig(config: ConfigService<Env, true>): LlmOptions {
  return {
    apiKey: config.get('ANTHROPIC_API_KEY', { infer: true }),
    baseURL: config.get('ANTHROPIC_BASE_URL', { infer: true }),
    model: config.get('ANTHROPIC_MODEL', { infer: true }),
    timeoutMs: config.get('LLM_TIMEOUT_MS', { infer: true }),
    inputTokenBudget: config.get('LLM_INPUT_TOKEN_BUDGET', { infer: true }),
  };
}
