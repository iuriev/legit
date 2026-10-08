import { toPlainLine } from './text';

describe('toPlainLine', () => {
  it('collapses whitespace and line breaks into single spaces', () => {
    expect(toPlainLine('  Email:   jane@example.com\r\n\tPhone: 555 ')).toBe(
      'Email: jane@example.com Phone: 555',
    );
  });

  it('removes control characters and direction overrides', () => {
    expect(toPlainLine('Node\u0000.js \u0007and ‮backwards⁦')).toBe('Node .js and backwards');
  });

  it('keeps letters of any script, diacritics and emoji', () => {
    expect(toPlainLine('Olena Šimić — Київ 👩‍💻')).toBe('Olena Šimić — Київ 👩‍💻');
  });
});
