import type Anthropic from '@anthropic-ai/sdk';

import { atLine, message, onPage, statement } from '../../test/anthropic-stub';
import { MAX_PASSAGE_LENGTH, MAX_PASSAGES, passagesFromMessage } from './passages';

const response = (...blocks: unknown[]) => message(blocks).body as Anthropic.Message;

describe('passagesFromMessage', () => {
  it('takes the quoted passage, word for word, and not what the model wrote about it', () => {
    const passages = passagesFromMessage(
      response(
        statement(
          'The candidate managed six engineers at Acme for three years.',
          onPage(1, 'Led a team of 6 engineers at Acme, 2019–2022'),
        ),
      ),
    );

    expect(passages).toEqual([{ quote: 'Led a team of 6 engineers at Acme, 2019–2022', page: 1 }]);
  });

  it('stores nothing for a statement without a quotation', () => {
    const passages = passagesFromMessage(
      response(
        statement('The candidate holds a PhD from MIT.'),
        statement('They know Node.js.', atLine(2, 'Skills: Node.js')),
      ),
    );

    expect(passages).toEqual([{ quote: 'Skills: Node.js', page: null }]);
  });

  it('returns nothing when the model cited nothing, as for a scan', () => {
    expect(
      passagesFromMessage(response(statement('The document has no readable content.'))),
    ).toEqual([]);
  });

  it('keeps every passage of a statement that cites several', () => {
    const passages = passagesFromMessage(
      response(
        statement('Two jobs.', onPage(1, 'Acme, 2019–2022'), onPage(2, 'Globex, 2016–2019')),
      ),
    );

    expect(passages.map((passage) => passage.quote)).toEqual([
      'Acme, 2019–2022',
      'Globex, 2016–2019',
    ]);
  });

  it('removes repeats and puts passages in the order of the document', () => {
    const passages = passagesFromMessage(
      response(
        statement('Skills.', atLine(7, 'Skills: Node.js')),
        statement('Name.', atLine(0, 'Olena  Šimić')),
        statement('Skills again.', atLine(7, 'Skills:   Node.js ')),
      ),
    );

    expect(passages.map((passage) => passage.quote)).toEqual(['Olena Šimić', 'Skills: Node.js']);
  });

  it('drops blank passages, oversized ones and the NUL character', () => {
    const passages = passagesFromMessage(
      response(
        statement('Blank.', atLine(0, '   ')),
        statement('Huge.', atLine(1, 'x'.repeat(MAX_PASSAGE_LENGTH + 1))),
        statement('Odd.', atLine(2, 'Node\u0000.js')),
      ),
    );

    expect(passages).toEqual([{ quote: 'Node .js', page: null }]);
  });

  it('bounds the number of passages', () => {
    const many = Array.from({ length: MAX_PASSAGES + 20 }, (_unused, index) =>
      statement('Line.', atLine(index, `Line ${String(index)}`)),
    );

    expect(passagesFromMessage(response(...many))).toHaveLength(MAX_PASSAGES);
  });

  it('ignores a citation that does not quote the document', () => {
    const fromElsewhere = {
      type: 'text',
      text: 'From elsewhere.',
      citations: [
        {
          type: 'web_search_result_location',
          cited_text: 'PhD from MIT',
          url: 'https://example.com',
          title: 'x',
          encrypted_index: 'x',
        },
        {
          type: 'content_block_location',
          cited_text: 'From another document',
          document_index: 1,
          document_title: null,
          file_id: null,
          start_block_index: 0,
          end_block_index: 1,
        },
      ],
    };

    expect(passagesFromMessage(response(fromElsewhere))).toEqual([]);
  });

  it('ignores blocks that are not text', () => {
    const passages = passagesFromMessage(
      response({ type: 'thinking', thinking: '', signature: 'x' }, statement('A.', atLine(0, 'A'))),
    );

    expect(passages).toEqual([{ quote: 'A', page: null }]);
  });
});
