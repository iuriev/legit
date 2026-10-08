import type { CvDocument } from '@cv-builder/contracts';

import { readPdf } from '../../test/pdf-reader';
import { emptyCvDocument } from '../cvs/cv-document.schema';
import { pdfFileName, renderCvPdf } from './cv-pdf';

/** A4 in PDF points: 210 × 297 mm at 72 points per inch. */
const A4 = { width: 595.28, height: 841.89 };

const cv = (): CvDocument => ({
  contact: {
    fullName: 'Olena Šimić',
    email: 'olena@example.com',
    phone: '+380 50 123 45 67',
    location: 'Kyiv, Ukraine',
    links: ['github.com/olena'],
  },
  summary: 'Backend engineer who rewrote the build pipeline at Acme.',
  experience: [
    {
      company: 'Acme',
      title: 'Backend Engineer',
      location: 'Lviv',
      startDate: 'March 2019',
      endDate: 'June 2022',
      bullets: ['Cut build time by 40%', 'Served 1,200 customers'],
    },
  ],
  education: [
    {
      institution: 'KPI',
      degree: 'BSc in Computer Science',
      startDate: '2012',
      endDate: '2016',
      details: 'Graduated with honours',
    },
  ],
  skills: ['Node.js', 'PostgreSQL'],
});

describe('renderCvPdf', () => {
  it('produces a PDF with A4 pages', async () => {
    const file = await renderCvPdf(cv());

    expect(file.subarray(0, 5).toString()).toBe('%PDF-');
    const { pages } = await readPdf(file);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.width).toBeCloseTo(A4.width, 1);
    expect(pages[0]?.height).toBeCloseTo(A4.height, 1);
  });

  it('contains its content as text that a reader can extract', async () => {
    const { text } = await readPdf(await renderCvPdf(cv()));

    for (const expected of [
      'Olena Šimić',
      'olena@example.com',
      '+380 50 123 45 67',
      'Kyiv, Ukraine',
      'github.com/olena',
      'Backend engineer who rewrote the build pipeline at Acme.',
      'Backend Engineer, Acme',
      'March 2019 – June 2022',
      'Lviv',
      'Cut build time by 40%',
      'Served 1,200 customers',
      'BSc in Computer Science, KPI',
      '2012 – 2016',
      'Graduated with honours',
      'Node.js',
      'PostgreSQL',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('embeds its fonts, so the file looks the same everywhere', async () => {
    const file = (await renderCvPdf(cv())).toString('latin1');

    expect(file).toContain('NotoSans');
    expect(file).toContain('/FontFile2');
  });

  it('leaves out the heading of an empty section and empty fields', async () => {
    const sparse: CvDocument = {
      ...emptyCvDocument(),
      summary: 'Only a summary.',
      skills: ['Jira'],
    };
    sparse.contact.fullName = 'Maria Petrenko';

    const { text } = await readPdf(await renderCvPdf(sparse));

    expect(text).toContain('SUMMARY');
    expect(text).toContain('SKILLS');
    expect(text).not.toContain('EXPERIENCE');
    expect(text).not.toContain('EDUCATION');
  });

  it('omits an entry whose fields are all empty and a position line that has no dates', async () => {
    const document = cv();
    document.experience = [
      { company: '', title: '', location: '', startDate: '', endDate: '', bullets: ['', '  '] },
      {
        company: 'Globex',
        title: '',
        location: '',
        startDate: '',
        endDate: 'Present',
        bullets: [],
      },
    ];
    document.education = [{ institution: '', degree: '', startDate: '', endDate: '', details: '' }];

    const { text } = await readPdf(await renderCvPdf(document));

    expect(text).toContain('Globex');
    expect(text).toContain('Present');
    expect(text).not.toContain('–');
    expect(text).not.toContain('EDUCATION');
  });

  it('renders an empty CV as one blank A4 page rather than failing', async () => {
    const { pages, text } = await readPdf(await renderCvPdf(emptyCvDocument()));

    expect(pages).toHaveLength(1);
    expect(text).toBe('');
  });

  it('continues on further A4 pages and loses nothing when the content is long', async () => {
    const long = cv();
    long.experience = Array.from({ length: 12 }, (_unused, index) => ({
      company: `Company ${String(index + 1)}`,
      title: 'Engineer',
      location: 'Remote',
      startDate: '2010',
      endDate: '2011',
      bullets: Array.from(
        { length: 8 },
        (_bullet, bullet) =>
          `Achievement ${String(index + 1)}.${String(bullet + 1)} with enough words to fill a line of the page`,
      ),
    }));

    const { pages, text } = await readPdf(await renderCvPdf(long));

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.width).toBeCloseTo(A4.width, 1);
      expect(page.height).toBeCloseTo(A4.height, 1);
      expect(page.text).not.toBe('');
    }
    expect(text).toContain('Achievement 1.1 ');
    expect(text).toContain('Achievement 12.8 ');
    expect(text).toContain('PostgreSQL');
  });

  it('never leaves a bullet marker on a page of its own, wherever the page break falls', async () => {
    // Summaries of growing length move the break through every position between two bullets.
    for (let shift = 0; shift < 30; shift += 1) {
      const document = cv();
      document.summary = Array.from(
        { length: shift + 1 },
        () => 'One more line of summary text.',
      ).join('\n');
      document.experience = Array.from({ length: 9 }, (_unused, index) => ({
        company: `Company ${String(index + 1)}`,
        title: 'Engineer',
        location: '',
        startDate: '2010',
        endDate: '2011',
        bullets: Array.from(
          { length: 6 },
          (_bullet, bullet) => `Result ${String(index + 1)}-${String(bullet + 1)}`,
        ),
      }));

      const { pages, text } = await readPdf(await renderCvPdf(document));

      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        // Every marker is followed, on its own page, by the text it belongs to.
        expect(page.text).not.toMatch(/•\s*(?:•|$)/);
        expect(page.text.replace(/[•\s]/g, '')).not.toBe('');
      }
      expect(text.match(/•/g)).toHaveLength(54);
      expect(text.match(/Result \d+-\d+/g)).toHaveLength(54);
    }
  });

  it('does not leave the title of a position at the foot of a page without its first line', async () => {
    for (let shift = 0; shift < 30; shift += 1) {
      const document = cv();
      document.summary = Array.from(
        { length: shift + 1 },
        () => 'One more line of summary text.',
      ).join('\n');
      document.experience = Array.from({ length: 12 }, (_unused, index) => ({
        company: `Company ${String(index + 1)}`,
        title: 'Engineer',
        location: '',
        startDate: '2010',
        endDate: '2011',
        bullets: [`Only result ${String(index + 1)}`],
      }));

      const { pages } = await readPdf(await renderCvPdf(document));

      for (const page of pages) {
        expect(page.text).not.toMatch(/Engineer, Company \d+ 2010 – 2011$/);
        expect(page.text).not.toMatch(/Engineer, Company \d+$/);
      }
    }
  });

  it('draws a tab as a space and leaves out characters that have no glyph', async () => {
    const document = cv();
    document.summary = 'tab\tseparated\u0007 and \u202Ereversed';

    const { text } = await readPdf(await renderCvPdf(document));

    expect(text).toContain('tab separated and reversed');
  });

  it('renders diacritics and Cyrillic so that the text comes back unchanged', async () => {
    const document = cv();
    document.contact.fullName = 'Šárka Їжакевич';
    document.summary = 'Živjeli! Досвід роботи з Київстар, ґанок, ёж. Ελληνικά.';

    const { text } = await readPdf(await renderCvPdf(document));

    expect(text).toContain('Šárka Їжакевич');
    expect(text).toContain('Živjeli! Досвід роботи з Київстар, ґанок, ёж. Ελληνικά.');
  });

  it('draws markup as the literal characters', async () => {
    const document = cv();
    document.summary = '<script>alert(1)</script> & <b>bold</b>';

    const { text } = await readPdf(await renderCvPdf(document));

    expect(text).toContain('<script>alert(1)</script> & <b>bold</b>');
  });

  it('keeps a line break that the owner typed', async () => {
    const document = cv();
    document.summary = 'First paragraph.\nSecond paragraph.';

    const { text } = await readPdf(await renderCvPdf(document));

    expect(text).toContain('First paragraph.');
    expect(text).toContain('Second paragraph.');
  });
});

describe('pdfFileName', () => {
  it('names the file after the candidate', () => {
    expect(pdfFileName('Olena Šimić')).toEqual({
      ascii: 'Olena-Simic-CV.pdf',
      encoded: `${encodeURIComponent('Olena Šimić CV')}.pdf`,
    });
  });

  it('falls back to a plain name when there is none, or none in Latin letters', () => {
    expect(pdfFileName('').ascii).toBe('CV.pdf');
    expect(pdfFileName('Олена').ascii).toBe('CV.pdf');
    expect(decodeURIComponent(pdfFileName('Олена').encoded)).toBe('Олена CV.pdf');
  });

  it('does not fail on a character of two units at the cut, and encodes what the header forbids', () => {
    const long = pdfFileName(`${'x'.repeat(59)}😀 and more`);
    const quoted = pdfFileName("O'Brien (Jr.)");

    expect(decodeURIComponent(long.encoded)).toBe(`${'x'.repeat(59)}😀 CV.pdf`);
    expect(pdfFileName('a\ud800b').encoded).toMatch(/^[\w%.-]+$/);
    expect(quoted.encoded).toBe('O%27Brien%20%28Jr.%29%20CV.pdf');
  });

  it('cannot break out of the header it is put into', () => {
    const { ascii, encoded } = pdfFileName('a"; filename="evil.exe\r\nSet-Cookie: x=1/../..\\');

    expect(ascii).toMatch(/^[A-Za-z0-9-]+\.pdf$/);
    expect(encoded).not.toMatch(/["\r\n\\/]/);
  });
});
