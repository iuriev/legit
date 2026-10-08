import type Anthropic from '@anthropic-ai/sdk';

import { toPlainLine } from '../common/text';

/** A passage of the source that the API quoted. This is what becomes a fact. */
export interface Passage {
  quote: string;
  /** The page it is on, for a PDF. */
  page: number | null;
}

/** Bounds on what one source can turn into, whatever the model returns. */
export const MAX_PASSAGES = 600;
export const MAX_PASSAGE_LENGTH = 2000;

type DocumentCitation =
  | Anthropic.CitationPageLocation
  | Anthropic.CitationContentBlockLocation
  | Anthropic.CitationCharLocation;

/**
 * Whether a citation quotes the one document we sent. The other kinds quote
 * search results, which are not the source; none can occur today, because no
 * tool is offered to the model, and none would be accepted if that changed.
 */
function quotesTheSource(citation: Anthropic.TextCitation): citation is DocumentCitation {
  return (
    (citation.type === 'page_location' ||
      citation.type === 'content_block_location' ||
      citation.type === 'char_location') &&
    citation.document_index === 0
  );
}

/** Where in the document a citation points, for putting passages in reading order. */
function position(citation: DocumentCitation): number {
  switch (citation.type) {
    case 'page_location':
      return citation.start_page_number;
    case 'content_block_location':
      return citation.start_block_index;
    case 'char_location':
      return citation.start_char_index;
  }
}

/**
 * The quoted passages of a citations response, in document order and without
 * duplicates.
 *
 * Only `cited_text` is taken: the API copies it from the document, so it is
 * the one part of the response the model did not write. The model's own
 * sentences are dropped, and a sentence without a citation contributes
 * nothing.
 *
 * A quotation is split into its lines, and each line is a passage. For a PDF
 * the API may quote a whole page as one piece of text; a fact that large would
 * let any number on the page support any claim. A line is still the
 * document's own text, word for word, and it is small enough for "the facts
 * an item names" to mean something.
 */
export function passagesFromMessage(message: Anthropic.Message): Passage[] {
  const found: (Passage & { position: number; order: number })[] = [];
  const seen = new Set<string>();

  for (const block of message.content) {
    if (block.type !== 'text') {
      continue;
    }
    for (const citation of block.citations ?? []) {
      if (!quotesTheSource(citation)) {
        continue;
      }
      for (const line of citation.cited_text.split(/\r?\n/)) {
        const quote = toPlainLine(line);
        if (quote === '' || quote.length > MAX_PASSAGE_LENGTH || seen.has(quote)) {
          continue;
        }
        seen.add(quote);
        found.push({
          quote,
          page: citation.type === 'page_location' ? citation.start_page_number : null,
          position: position(citation),
          order: found.length,
        });
      }
    }
  }

  return found
    .sort((a, b) => a.position - b.position || a.order - b.order)
    .slice(0, MAX_PASSAGES)
    .map(({ quote, page }) => ({ quote, page }));
}
