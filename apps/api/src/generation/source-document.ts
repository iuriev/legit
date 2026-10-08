import type Anthropic from '@anthropic-ai/sdk';

export type StoredSource = { kind: 'pdf'; pdf: Buffer } | { kind: 'text'; text: string };

/**
 * The source as a document the model can cite.
 *
 * A PDF is sent whole and the API decides what a citable passage is. Pasted
 * text is sent as one block per non-empty line, so a quotation is a line of
 * the CV rather than whatever a sentence splitter would make of it.
 */
export function toDocumentBlock(source: StoredSource): Anthropic.DocumentBlockParam {
  if (source.kind === 'pdf') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: source.pdf.toString('base64'),
      },
      citations: { enabled: true },
    };
  }
  const lines = source.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return {
    type: 'document',
    source: { type: 'content', content: lines.map((line) => ({ type: 'text', text: line })) },
    citations: { enabled: true },
  };
}
