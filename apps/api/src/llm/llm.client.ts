import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';

import { GenerationError } from '../jobs/generation-error';
import { toGenerationError } from './llm-errors';
import { LLM_OPTIONS, type LlmOptions } from './llm-options';

type Effort = 'low' | 'medium' | 'high';

export interface ReadDocumentRequest {
  system: string;
  document: Anthropic.DocumentBlockParam;
  instruction: string;
}

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
}

/**
 * Every call to the model goes through here. A call either returns content
 * that has been checked, or throws a `GenerationError` that says what the
 * failure means. Nothing a response contains is used before its stop reason
 * is known and, for structured calls, before it has passed the schema.
 *
 * The SDK's own retries are off: a failed call fails the stage, and the job
 * runner decides whether the stage runs again. That keeps the worst case of
 * one attempt known (calls × timeout) and below the job lease.
 */
@Injectable()
export class LlmClient {
  private readonly client: Anthropic | undefined;

  constructor(@Inject(LLM_OPTIONS) private readonly options: LlmOptions) {
    this.client = options.apiKey
      ? new Anthropic({
          apiKey: options.apiKey,
          baseURL: options.baseURL,
          timeout: options.timeoutMs,
          maxRetries: 0,
        })
      : undefined;
  }

  /**
   * Has the model read a document with citations enabled and returns its
   * answer as it came. The caller takes only the citations from it: their
   * `cited_text` is filled in by the API from the document, not written by
   * the model.
   */
  async readDocument(request: ReadDocumentRequest): Promise<Anthropic.Message> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.options.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: request.system,
      messages: [
        {
          role: 'user',
          content: [request.document, { type: 'text', text: request.instruction }],
        },
      ],
    };
    return this.call(async (client) => {
      // Measured first, so that an oversized document costs nothing.
      const { input_tokens: inputTokens } = await client.messages.countTokens({
        model: params.model,
        system: params.system,
        messages: params.messages,
      });
      if (inputTokens > this.options.inputTokenBudget) {
        throw new GenerationError(
          'source_too_long',
          false,
          `The document takes ${String(inputTokens)} input tokens; the budget is ${String(this.options.inputTokenBudget)}`,
        );
      }
      const message = await client.messages.create(params);
      if (message.stop_reason === 'max_tokens') {
        // The model could not restate the document within its output limit.
        // The same document would be cut off the same way again.
        throw new GenerationError('source_too_long', false, 'The reading was cut off');
      }
      return checkStopReason(message);
    });
  }

  /** Asks for JSON in the shape of `schema` and returns it only if it validates. */
  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    const message = await this.call(async (client) =>
      checkStopReason(
        await client.messages.create({
          model: this.options.model,
          max_tokens: request.maxTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
        }),
      ),
    );

    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new GenerationError('generation_failed', true, 'The model did not return JSON');
    }
    // The API is given the schema, but it enforces less than the schema says:
    // the SDK passes length limits and enumerations on as descriptions only.
    // This validation is the one that counts.
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new GenerationError(
        'generation_failed',
        true,
        `The model's output does not match the schema: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`,
      );
    }
    return parsed.data;
  }

  private async call<T>(run: (client: Anthropic) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new GenerationError('ai_not_configured', false, 'ANTHROPIC_API_KEY is not set');
    }
    try {
      return await run(this.client);
    } catch (error) {
      throw toGenerationError(error);
    }
  }
}

/** A refusal or a cut-off answer is a failure, never content. */
function checkStopReason(message: Anthropic.Message): Anthropic.Message {
  if (message.stop_reason === 'refusal') {
    throw new GenerationError('declined', false, 'The model declined the request');
  }
  if (message.stop_reason !== 'end_turn') {
    throw new GenerationError(
      'generation_failed',
      true,
      `The model stopped early: ${String(message.stop_reason)}`,
    );
  }
  return message;
}
