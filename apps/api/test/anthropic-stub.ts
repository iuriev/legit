import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubReply {
  status?: number;
  body: unknown;
  /** Hold the response back, to observe the state in the meantime or to cause a timeout. */
  delayMs?: number;
}

export interface StubRequest {
  path: string;
  body: Record<string, unknown>;
}

/**
 * A stand-in for the Anthropic API that the SDK is pointed at through its base
 * URL. A test scripts the replies to `POST /v1/messages` in order; the
 * application under test is unchanged and unaware.
 */
export class AnthropicStub {
  readonly requests: StubRequest[] = [];
  /** What `POST /v1/messages/count_tokens` answers. */
  inputTokens = 1000;
  private replies: StubReply[] = [];
  private server: Server | undefined;

  get url(): string {
    const { port } = this.server?.address() as AddressInfo;
    return `http://127.0.0.1:${String(port)}`;
  }

  /** The requests that asked for a message, without the token counts. */
  get messageRequests(): StubRequest[] {
    return this.requests.filter((request) => request.path === '/v1/messages');
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request).then(async (reply) => {
        if (reply.delayMs) {
          await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
        }
        response.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  /** Queues replies to the next calls of `POST /v1/messages`. */
  reply(...replies: StubReply[]): void {
    this.replies.push(...replies);
  }

  /** Queues replies ahead of the ones already scripted. */
  replyFirst(...replies: StubReply[]): void {
    this.replies.unshift(...replies);
  }

  reset(): void {
    this.requests.length = 0;
    this.replies = [];
    this.inputTokens = 1000;
  }

  private async handle(request: IncomingMessage): Promise<StubReply> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    const path = request.url ?? '';
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}') as Record<string, unknown>;
    this.requests.push({ path, body });

    if (path === '/v1/messages/count_tokens') {
      return { body: { input_tokens: this.inputTokens } };
    }
    // A call nobody scripted is a bug in the test or an unexpected call of the application.
    return this.replies.shift() ?? apiError(400, 'invalid_request_error', 'No scripted reply');
  }
}

type Citation =
  | { type: 'page_location'; cited_text: string; start_page_number: number }
  | { type: 'content_block_location'; cited_text: string; start_block_index: number };

/** A passage on a page of a PDF, as the API cites it. */
export const onPage = (page: number, citedText: string): Citation => ({
  type: 'page_location',
  cited_text: citedText,
  start_page_number: page,
});

/** A line of pasted text, as the API cites it. */
export const atLine = (index: number, citedText: string): Citation => ({
  type: 'content_block_location',
  cited_text: citedText,
  start_block_index: index,
});

function fillCitation(citation: Citation): Record<string, unknown> {
  const common = { document_index: 0, document_title: null, file_id: null };
  return citation.type === 'page_location'
    ? { ...common, ...citation, end_page_number: citation.start_page_number + 1 }
    : { ...common, ...citation, end_block_index: citation.start_block_index + 1 };
}

/** A text block: something the model wrote, with the passages it cites for it. */
export const statement = (text: string, ...citations: Citation[]) => ({
  type: 'text',
  text,
  citations: citations.length > 0 ? citations.map(fillCitation) : null,
});

/** A complete, successful message with the given content blocks. */
export function message(
  content: unknown[],
  stopReason: 'end_turn' | 'max_tokens' | 'refusal' = 'end_turn',
): StubReply {
  return {
    body: {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    },
  };
}

/** The reply of the reading call: statements with their citations. */
export const reading = (...statements: ReturnType<typeof statement>[]): StubReply =>
  message(statements);

/** The reply of a structured call: the JSON as the text of the message. */
export const json = (value: unknown): StubReply =>
  message([{ type: 'text', text: JSON.stringify(value), citations: null }]);

export const apiError = (status: number, type: string, text = type): StubReply => ({
  status,
  body: { type: 'error', error: { type, message: text } },
});
