import { MAX_PASSAGE_LENGTH } from './passages';
import { splitLongLine, toDocumentBlock } from './source-document';

describe('toDocumentBlock', () => {
  it('sends a PDF whole, with citations enabled', () => {
    const pdf = Buffer.from('%PDF-1.7 content');

    expect(toDocumentBlock({ kind: 'pdf', pdf })).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') },
      citations: { enabled: true },
    });
  });

  it('sends pasted text as one citable block per non-empty line', () => {
    const block = toDocumentBlock({
      kind: 'text',
      text: 'Olena Šimić\r\n\n  Backend engineer at Acme, 2019–2022  \n\nSkills: Node.js',
    });

    expect(block).toEqual({
      type: 'document',
      source: {
        type: 'content',
        content: [
          { type: 'text', text: 'Olena Šimić' },
          { type: 'text', text: 'Backend engineer at Acme, 2019–2022' },
          { type: 'text', text: 'Skills: Node.js' },
        ],
      },
      citations: { enabled: true },
    });
  });
});

describe('splitLongLine', () => {
  it('leaves a line that fits a passage as it is', () => {
    const line = 'Backend engineer at Acme. Led a team of 6.';

    expect(splitLongLine(line)).toEqual([line]);
  });

  it('cuts a paragraph written without a line break into its sentences', () => {
    const sentences = Array.from(
      { length: 40 },
      (_, index) =>
        `In year ${String(2000 + index)} I led project number ${String(index)} for a client in retail banking.`,
    );
    const pieces = splitLongLine(sentences.join(' '));

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= MAX_PASSAGE_LENGTH)).toBe(true);
    // Nothing of the source is lost or changed.
    expect(pieces.join(' ')).toBe(sentences.join(' '));
    // A cut never falls inside a sentence.
    expect(pieces.every((piece) => piece.endsWith('.'))).toBe(true);
  });

  it('cuts text without sentences after words, and a single endless word as it is', () => {
    const words = Array.from({ length: 600 }, (_, index) => `word${String(index)}`).join(' ');
    const endless = 'x'.repeat(MAX_PASSAGE_LENGTH * 2 + 10);

    expect(splitLongLine(words).join(' ')).toBe(words);
    expect(splitLongLine(words).every((piece) => piece.length <= MAX_PASSAGE_LENGTH)).toBe(true);
    expect(splitLongLine(endless).map((piece) => piece.length)).toEqual([
      MAX_PASSAGE_LENGTH,
      MAX_PASSAGE_LENGTH,
      10,
    ]);
  });

  it('is applied to the lines of pasted text', () => {
    const paragraph = Array.from({ length: 60 }, () => 'I tested payment flows for a bank.').join(
      ' ',
    );
    const block = toDocumentBlock({ kind: 'text', text: `Olena\n${paragraph}` });
    const content = block.source.type === 'content' ? block.source.content : [];

    expect(Array.isArray(content) && content.length).toBeGreaterThan(2);
  });
});
