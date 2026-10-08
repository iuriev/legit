import { z } from 'zod';

import {
  AnthropicStub,
  apiError,
  atLine,
  json,
  message,
  reading,
  statement,
} from '../../test/anthropic-stub';
import { GenerationError } from '../jobs/generation-error';
import { LlmClient } from './llm.client';
import type { LlmOptions } from './llm-options';

const schema = z.object({ answer: z.string().max(10) });

describe('LlmClient', () => {
  const stub = new AnthropicStub();
  let options: LlmOptions;
  let client: LlmClient;

  const read = () =>
    client.readDocument({
      system: 'Read.',
      document: {
        type: 'document',
        source: { type: 'content', content: [{ type: 'text', text: 'A line' }] },
        citations: { enabled: true },
      },
      instruction: 'List.',
    });
  const structured = () =>
    client.generateStructured({ system: 'S', user: 'U', schema, effort: 'low', maxTokens: 100 });
  const failure = async (call: () => Promise<unknown>) => {
    const error: unknown = await call().then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(GenerationError);
    const { code, retryable } = error as GenerationError;
    return { code, retryable };
  };

  beforeAll(() => stub.start());
  afterAll(() => stub.stop());

  beforeEach(() => {
    stub.reset();
    options = {
      apiKey: 'test-key',
      baseURL: stub.url,
      model: 'claude-sonnet-5-5',
      timeoutMs: 300,
      inputTokenBudget: 40_000,
    };
    client = new LlmClient(options);
  });

  describe('reading a document', () => {
    it('measures the request, sends it once and returns the scripted response', async () => {
      stub.reply(reading(statement('A fact.', atLine(0, 'A line'))));

      const response = await read();

      expect(response.content).toHaveLength(1);
      expect(stub.requests.map((request) => request.path)).toEqual([
        '/v1/messages/count_tokens',
        '/v1/messages',
      ]);
      expect(stub.messageRequests[0]?.body).toMatchObject({
        model: 'claude-sonnet-5-5',
        system: 'Read.',
        output_config: { effort: 'low' },
        thinking: { type: 'adaptive' },
      });
    });

    it('refuses a document over the token budget without sending it', async () => {
      stub.inputTokens = 40_001;

      expect(await failure(read)).toEqual({ code: 'source_too_long', retryable: false });
      expect(stub.messageRequests).toHaveLength(0);
    });

    it('accepts a document exactly at the token budget', async () => {
      stub.inputTokens = 40_000;
      stub.reply(reading(statement('A fact.', atLine(0, 'A line'))));

      await expect(read()).resolves.toBeDefined();
    });
  });

  describe('stop reasons', () => {
    it('treats a refusal as a failure that a retry cannot fix', async () => {
      stub.reply(
        message([{ type: 'text', text: 'I cannot help with that.', citations: null }], 'refusal'),
      );

      expect(await failure(read)).toEqual({ code: 'declined', retryable: false });
    });

    it('treats a cut-off structured response as a failed attempt, even when what arrived is valid', async () => {
      stub.reply(
        message([{ type: 'text', text: '{"answer": "yes"}', citations: null }], 'max_tokens'),
      );

      expect(await failure(structured)).toEqual({ code: 'generation_failed', retryable: true });
    });

    it('treats a refused structured response as a refusal, even when it carries valid output', async () => {
      stub.reply(
        message([{ type: 'text', text: '{"answer": "yes"}', citations: null }], 'refusal'),
      );

      expect(await failure(structured)).toEqual({ code: 'declined', retryable: false });
    });

    it('does not take citations from a reading that was cut off: the document is too long', async () => {
      stub.reply(message([statement('A fact.', atLine(0, 'A line'))], 'max_tokens'));

      expect(await failure(read)).toEqual({ code: 'source_too_long', retryable: false });
    });
  });

  describe('structured output', () => {
    it('returns output that matches the schema', async () => {
      stub.reply(json({ answer: 'yes' }));

      await expect(structured()).resolves.toEqual({ answer: 'yes' });
      expect(stub.messageRequests[0]?.body).toMatchObject({
        output_config: { effort: 'low', format: { type: 'json_schema' } },
        max_tokens: 100,
      });
    });

    it.each([
      [
        'text that is not JSON',
        message([{ type: 'text', text: 'Sure! Here you go.', citations: null }]),
      ],
      ['JSON of another shape', json({ reply: 'yes' })],
      ['a value over our length limit', json({ answer: 'far too long for the schema' })],
      ['an empty response', message([])],
    ])('rejects %s as a failed attempt', async (_name, reply) => {
      stub.reply(reply);

      expect(await failure(structured)).toEqual({ code: 'generation_failed', retryable: true });
    });
  });

  describe('failures of the service', () => {
    it.each([
      [401, 'authentication_error', 'ai_not_configured', false],
      [403, 'permission_error', 'ai_not_configured', false],
      [402, 'billing_error', 'ai_not_configured', false],
      [429, 'rate_limit_error', 'service_unavailable', true],
      [500, 'api_error', 'service_unavailable', true],
      [529, 'overloaded_error', 'service_unavailable', true],
      [413, 'request_too_large', 'source_too_long', false],
      [400, 'invalid_request_error', 'request_rejected', false],
      [404, 'not_found_error', 'request_rejected', false],
    ])('maps %i %s to %s', async (status, type, code, retryable) => {
      stub.reply(apiError(status, type));

      expect(await failure(structured)).toEqual({ code, retryable });
      // The job runner owns retries; the SDK makes exactly one request.
      expect(stub.messageRequests).toHaveLength(1);
    });

    it('treats a timeout as the service being unavailable', async () => {
      stub.reply({ ...json({ answer: 'late' }), delayMs: 600 });

      expect(await failure(structured)).toEqual({ code: 'service_unavailable', retryable: true });
    });

    it('treats an unreachable service as unavailable', async () => {
      client = new LlmClient({ ...options, baseURL: 'http://127.0.0.1:9' });

      expect(await failure(structured)).toEqual({ code: 'service_unavailable', retryable: true });
    });

    it('fails as "not configured" without a key, and calls nothing', async () => {
      client = new LlmClient({ ...options, apiKey: undefined });

      expect(await failure(structured)).toEqual({ code: 'ai_not_configured', retryable: false });
      expect(await failure(read)).toEqual({ code: 'ai_not_configured', retryable: false });
      expect(stub.requests).toHaveLength(0);
    });
  });
});
