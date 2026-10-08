import { join } from 'node:path';

import type { CvDocument } from '@cv-builder/contracts';
import PDFDocument from 'pdfkit';

/** Noto Sans covers Latin with diacritics, Cyrillic and Greek. The files are embedded in every PDF. */
const FONTS = {
  regular: join(__dirname, 'fonts', 'NotoSans-Regular.ttf'),
  bold: join(__dirname, 'fonts', 'NotoSans-Bold.ttf'),
};

const MARGIN = 50;
const COLORS = { text: '#1a1a1a', muted: '#555555', rule: '#bbbbbb' };
const SIZES = { name: 20, heading: 10.5, body: 10, small: 9.5 };
/** A heading is not left alone at the foot of a page: it needs this much room after it. */
const KEEP_WITH_HEADING = 60;
/** A position's title, its dates and a first line stay together. */
const KEEP_WITH_ENTRY = 48;
const BULLET_INDENT = 12;
const SEPARATOR = '  ·  ';

const present = (parts: string[]): string[] => parts.filter((part) => part.trim() !== '');

/**
 * A text as it can be drawn. A tab becomes a space, and control characters
 * other than a line break are dropped, as are the characters that override the
 * direction of text: the font has no glyph for any of them and would draw an
 * empty box.
 */
const drawable = (text: string): string =>
  text.replace(/\t/g, ' ').replace(/[^\P{Cc}\n]|[\u202A-\u202E\u2066-\u2069]/gu, '');

/**
 * Renders a CV as an A4 PDF.
 *
 * The text is laid out as text, in an embedded font, so it can be selected,
 * copied and searched. Every value is drawn as a plain string: nothing in a CV
 * is interpreted as markup. Empty fields and sections are left out, and the
 * content flows onto further pages when it does not fit on one.
 */
export function renderCvPdf(cv: CvDocument): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: present([cv.contact.fullName, 'CV']).join(' — '), Creator: 'AI CV Builder' },
  });
  const chunks: Buffer[] = [];
  pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    pdf.on('error', reject);
  });

  pdf.registerFont('regular', FONTS.regular).registerFont('bold', FONTS.bold);
  const width = pdf.page.width - 2 * MARGIN;
  const write = (
    text: string,
    style: {
      font?: 'regular' | 'bold';
      size?: number;
      color?: string;
      indent?: number;
      gap?: number;
    },
  ): void => {
    pdf
      .font(style.font ?? 'regular')
      .fontSize(style.size ?? SIZES.body)
      .fillColor(style.color ?? COLORS.text)
      .text(drawable(text), MARGIN + (style.indent ?? 0), undefined, {
        width: width - (style.indent ?? 0),
        lineGap: 2,
      });
    pdf.moveDown(style.gap ?? 0);
  };
  const lineHeight = (size: number): number =>
    pdf.font('regular').fontSize(size).currentLineHeight(true) + 2;
  /** Starts a new page unless this much room is left on the current one. */
  const ensureRoom = (points: number): void => {
    if (pdf.y + points > pdf.page.height - MARGIN) {
      pdf.addPage();
    }
  };
  const heading = (title: string): void => {
    ensureRoom(KEEP_WITH_HEADING);
    pdf.moveDown(0.9);
    write(title.toUpperCase(), { font: 'bold', size: SIZES.heading, color: COLORS.muted });
    pdf
      .moveTo(MARGIN, pdf.y + 1)
      .lineTo(MARGIN + width, pdf.y + 1)
      .lineWidth(0.5)
      .strokeColor(COLORS.rule)
      .stroke();
    pdf.moveDown(0.5);
  };
  /**
   * Writes short items side by side, breaking the line between items and never
   * inside one, so that an address is not cut in two and no separator is left
   * hanging at the end of a line.
   */
  const writeItems = (items: string[], style: { size?: number; color?: string }): void => {
    pdf.font('regular').fontSize(style.size ?? SIZES.body);
    const lines: string[] = [];
    for (const item of items) {
      const last = lines.at(-1);
      const joined = last === undefined ? item : `${last}${SEPARATOR}${item}`;
      if (last !== undefined && pdf.widthOfString(joined) <= width) {
        lines[lines.length - 1] = joined;
      } else {
        lines.push(item);
      }
    }
    for (const line of lines) {
      write(line, style);
    }
  };
  const period = (start: string, end: string): string => present([start, end]).join(' – ');

  const { contact } = cv;
  if (contact.fullName.trim() !== '') {
    write(contact.fullName, { font: 'bold', size: SIZES.name, gap: 0.2 });
  }
  const contactLine = present([contact.email, contact.phone, contact.location, ...contact.links]);
  if (contactLine.length > 0) {
    writeItems(contactLine, { size: SIZES.small, color: COLORS.muted });
  }

  if (cv.summary.trim() !== '') {
    heading('Summary');
    write(cv.summary, {});
  }

  const experience = cv.experience.filter(
    (entry) =>
      present([
        entry.company,
        entry.title,
        entry.location,
        entry.startDate,
        entry.endDate,
        ...entry.bullets,
      ]).length > 0,
  );
  if (experience.length > 0) {
    heading('Experience');
    experience.forEach((entry, index) => {
      if (index > 0) {
        pdf.moveDown(0.6);
      }
      // A position's title is not left at the foot of a page without what follows it.
      ensureRoom(KEEP_WITH_ENTRY);
      const title = present([entry.title, entry.company]).join(', ');
      if (title !== '') {
        write(title, { font: 'bold' });
      }
      const details = present([period(entry.startDate, entry.endDate), entry.location]).join(
        SEPARATOR,
      );
      if (details !== '') {
        write(details, { size: SIZES.small, color: COLORS.muted });
      }
      for (const bullet of present(entry.bullets)) {
        // The marker and the first line of its text go on the same page: if
        // there is no room for a line here, both start on the next one.
        ensureRoom(lineHeight(SIZES.body));
        const top = pdf.y;
        pdf
          .font('regular')
          .fontSize(SIZES.body)
          .fillColor(COLORS.text)
          .text('•', MARGIN, top, { lineBreak: false });
        pdf.y = top;
        write(bullet, { indent: BULLET_INDENT });
      }
    });
  }

  const education = cv.education.filter(
    (entry) =>
      present([entry.institution, entry.degree, entry.startDate, entry.endDate, entry.details])
        .length > 0,
  );
  if (education.length > 0) {
    heading('Education');
    education.forEach((entry, index) => {
      if (index > 0) {
        pdf.moveDown(0.6);
      }
      ensureRoom(KEEP_WITH_ENTRY);
      const title = present([entry.degree, entry.institution]).join(', ');
      if (title !== '') {
        write(title, { font: 'bold' });
      }
      const dates = period(entry.startDate, entry.endDate);
      if (dates !== '') {
        write(dates, { size: SIZES.small, color: COLORS.muted });
      }
      if (entry.details.trim() !== '') {
        write(entry.details, {});
      }
    });
  }

  const skills = present(cv.skills);
  if (skills.length > 0) {
    heading('Skills');
    writeItems(skills, {});
  }

  pdf.end();
  return finished;
}

/**
 * The name of the downloaded file, after the candidate: `Olena-Simic-CV.pdf`.
 * Limited to plain letters and digits, since the name goes into a response
 * header; the original name is carried separately, encoded.
 */
export function pdfFileName(fullName: string): { ascii: string; encoded: string } {
  // By code points, so that a character of two units is never cut in half.
  const cut = (text: string): string => Array.from(text).slice(0, 60).join('');
  const letters = fullName.normalize('NFKD').replace(/\p{M}/gu, '');
  const ascii = present([
    cut(letters.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')),
    'CV',
  ]).join('-');
  const original = present([
    cut(
      fullName
        .toWellFormed()
        .replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ')
        .trim(),
    ),
    'CV',
  ]).join(' ');
  // encodeURIComponent leaves four characters that the header's grammar does not allow.
  const encoded = encodeURIComponent(original).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return { ascii: `${ascii}.pdf`, encoded: `${encoded}.pdf` };
}
