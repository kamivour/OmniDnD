/**
 * Stage 1 of the monster pipeline: reads the PDF text layer with pdfjs and writes reading-order
 * lines for every page. Output goes to data/private/ only (book text, gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Util, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  bodyHeight,
  bookGutters,
  findGutter,
  pageOffset,
  readingOrder,
  stripMargins,
  type Page,
  type Word,
} from './layout.ts';

export interface ExtractedBook {
  book: string;
  /** The usual body text height. */
  body: number;
  /** PDF page minus printed page, when the printed numbers could be read. */
  offset?: number;
  pages: Page[];
}

interface TextRun {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface RawPage {
  w: number;
  h: number;
  words: Word[];
}

async function readPages(pdf: string): Promise<RawPage[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 }).promise;
  const out: RawPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const view = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const words: Word[] = [];
    for (const item of content.items as TextRun[]) {
      if (typeof item.str !== 'string' || !item.str.trim()) continue;
      // Into page coordinates (y down from the top). Some scans are stored rotated or offset.
      const [a = 1, , c = 0, d = 0, x = 0, baseline = 0] = Util.transform(
        view.transform,
        item.transform,
      ) as number[];
      const h = Math.hypot(c, d);
      const left = a < 0 ? x - item.width : x;
      words.push({ x: left, y: baseline - h, w: item.width, h, s: item.str });
    }
    out.push({ w: view.width, h: view.height, words });
    page.cleanup();
  }
  await doc.destroy();
  return out;
}

export async function extractBook(book: string, pdf: string, out: string): Promise<ExtractedBook> {
  const raw = await readPages(pdf);
  // Pages where no gutter shows (a table across the gap, little text) use the book's usual one.
  const found = raw.map(({ words, w }) => findGutter(words, w));
  const usual = bookGutters(found.map((gutter, i) => gutter && gutter / raw[i]!.w));
  const pages = stripMargins(
    raw.map(({ w, h, words }, i) => {
      const share = usual[(i + 1) % 2];
      const gutter = found[i] ?? (share === undefined ? undefined : share * w);
      return { n: i + 1, w, h, lines: readingOrder(words, gutter) };
    }),
  );
  const offset = pageOffset(pages);
  const result: ExtractedBook = {
    book,
    body: bodyHeight(pages),
    ...(offset !== undefined && { offset }),
    pages,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'pages.json'), JSON.stringify(result));
  writeFileSync(join(out, 'pages.txt'), pagesText(result));
  return result;
}

/** A plain text view for reading and grepping: page markers, and `#` before large lines. */
export function pagesText({ body, pages }: ExtractedBook): string {
  return pages
    .map((page) => {
      const head = `=== p${page.n}${page.printed !== undefined ? ` (printed ${page.printed})` : ''}`;
      const lines = page.lines.map((line) => (line.h > body * 1.4 ? `# ${line.t}` : line.t));
      return [head, ...lines].join('\n');
    })
    .join('\n');
}
