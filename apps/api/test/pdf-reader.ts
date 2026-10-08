/** What a PDF reader sees in a file: the size of each page in points and the text on it. */
export interface ReadPdf {
  pages: { width: number; height: number; text: string }[];
  /** The text of all pages, with single spaces. */
  text: string;
}

/** Reads a PDF back with pdf.js, the way a viewer would, to check what was really produced. */
export async function readPdf(file: Buffer): Promise<ReadPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({ data: new Uint8Array(file), verbosity: 0 });
  const document = await loading.promise;
  const pages: ReadPdf['pages'] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ width: right - left, height: top - bottom, text });
  }
  await loading.destroy();
  return { pages, text: pages.map((page) => page.text).join(' ') };
}
