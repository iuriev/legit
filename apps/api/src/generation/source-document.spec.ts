import { toDocumentBlock } from './source-document';

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
