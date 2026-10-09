import type Anthropic from '@anthropic-ai/sdk';

import { MAX_PASSAGE_LENGTH } from './passages';

/** Sentences are kept together up to this length, so a fact stays about one thing. */
const SENTENCE_GROUP_LENGTH = 300;

export type StoredSource = { kind: 'pdf'; pdf: Buffer } | { kind: 'text'; text: string };

/**
 * The source as a document the model can cite.
 *
 * A PDF is sent whole and the API decides what a citable passage is. Pasted
 * text is sent as one block per non-empty line, so a quotation is a line of
 * the CV rather than whatever a sentence splitter would make of it. Only a
 * line too long to be one fact — a paragraph written without a line break —
 * is cut into its sentences.
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
    .filter((line) => line !== '')
    .flatMap(splitLongLine);
  return {
    type: 'document',
    source: { type: 'content', content: lines.map((line) => ({ type: 'text', text: line })) },
    citations: { enabled: true },
  };
}

/**
 * A line as pieces no longer than a passage may be, each the source's own
 * text: cut after a sentence where there is one, otherwise after a word.
 */
export function splitLongLine(line: string): string[] {
  if (line.length <= MAX_PASSAGE_LENGTH) {
    return [line];
  }
  const pieces: string[] = [];
  let piece = '';
  for (const sentence of line.split(/(?<=[.!?…;])\s+/u)) {
    for (const part of sentence.length > MAX_PASSAGE_LENGTH ? splitAtWords(sentence) : [sentence]) {
      if (piece !== '' && piece.length + 1 + part.length > SENTENCE_GROUP_LENGTH) {
        pieces.push(piece);
        piece = '';
      }
      piece = piece === '' ? part : `${piece} ${part}`;
    }
  }
  if (piece !== '') {
    pieces.push(piece);
  }
  return pieces;
}

/** A sentence longer than a passage may be, cut after words. A single word that long is cut as it is. */
function splitAtWords(sentence: string): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const word of sentence.split(/\s+/u)) {
    if (piece !== '' && piece.length + 1 + word.length > MAX_PASSAGE_LENGTH) {
      pieces.push(piece);
      piece = '';
    }
    piece = piece === '' ? word : `${piece} ${word}`;
    while (piece.length > MAX_PASSAGE_LENGTH) {
      pieces.push(piece.slice(0, MAX_PASSAGE_LENGTH));
      piece = piece.slice(MAX_PASSAGE_LENGTH);
    }
  }
  if (piece !== '') {
    pieces.push(piece);
  }
  return pieces;
}
