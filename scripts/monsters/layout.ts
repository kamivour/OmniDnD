/**
 * Page layout for the monster book extractor (M50). Pure functions: words with positions in,
 * reading-order lines out. Book pages use two columns with full-width titles between them.
 */

/** One text run from the PDF text layer. `y` is the top edge, measured down from the page top. */
export interface Word {
  x: number;
  y: number;
  w: number;
  h: number;
  s: string;
}

/** Column: 0 left, 1 right, 2 spanning both (titles, wide tables), or the only column. */
export type Column = 0 | 1 | 2;

export interface Line {
  t: string;
  x: number;
  y: number;
  h: number;
  c: Column;
}

export interface Page {
  n: number;
  /** Page size. Scanned books mix page sizes, so each page keeps its own. */
  w: number;
  h: number;
  /** The page number printed in the margin, when one was found. */
  printed?: number;
  lines: Line[];
}

const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/**
 * The x position of the gap between two columns, or undefined for a one-column page.
 * Takes the middle of the widest strip near the page centre that body text never crosses.
 * Large headings are ignored here: they often sit across the gap.
 */
export function findGutter(words: readonly Word[], width: number): number | undefined {
  const body = median(words.map((word) => word.h));
  const text = words.filter((word) => word.h <= body * 1.3);
  if (text.length < 20) return undefined;
  // The gap must be wider than a space between words, or a page of one column whose word
  // spaces happen to line up would read as two columns.
  const strip = body * 0.9;
  const from = Math.round(width * 0.35);
  const to = Math.round(width * 0.65);
  const crossing: number[] = [];
  for (let x = from; x <= to; x++) {
    crossing.push(text.filter((word) => word.x < x + strip && word.x + word.w > x).length);
  }
  const least = Math.min(...crossing);
  if (least > text.length * 0.04) return undefined;
  let best = { start: 0, length: 0 };
  for (let i = 0; i < crossing.length;) {
    if (crossing[i] !== least) {
      i++;
      continue;
    }
    let j = i;
    while (j < crossing.length && crossing[j] === least) j++;
    if (j - i > best.length) best = { start: i, length: j - i };
    i = j;
  }
  const gutter = from + best.start + (best.length - 1) / 2 + strip / 2;
  const left = text.filter((word) => word.x + word.w <= gutter).length;
  const right = text.filter((word) => word.x >= gutter).length;
  if (left < text.length * 0.15 || right < text.length * 0.15) return undefined;
  return gutter;
}

/**
 * One gutter per page side for the whole book, as a share of page width, from the pages where
 * one was found. Odd and even pages differ because the inner margin is wider.
 */
export function bookGutters(gutters: readonly (number | undefined)[]): [number?, number?] {
  const side = (parity: number) =>
    gutters.filter((g, i): g is number => g !== undefined && (i + 1) % 2 === parity);
  const pick = (found: number[]) => (found.length > 0 ? median(found) : undefined);
  return [pick(side(0)), pick(side(1))];
}

/** Words that share a baseline, each row sorted left to right. */
function groupRows(words: readonly Word[]): Word[][] {
  const rows: Word[][] = [];
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => {
      const first = candidate[0]!;
      return Math.abs(first.y - word.y) < Math.max(first.h, word.h) * 0.5;
    });
    if (row) row.push(word);
    else rows.push([word]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

/** Joins words that share a baseline into lines, left to right. */
export function groupLines(words: readonly Word[], column: Column): Line[] {
  return groupRows(words)
    .map((row) => {
      const h = median(row.map((word) => word.h));
      let t = '';
      let end = -Infinity;
      for (const word of row) {
        const text = word.s.trim();
        if (!text) continue;
        t += t && word.x - end > h * 0.1 ? ` ${text}` : text;
        end = word.x + word.w;
      }
      return {
        t: t.replace(/\s+/g, ' '),
        x: row[0]!.x,
        y: median(row.map((w) => w.y)),
        h,
        c: column,
      };
    })
    .filter((line) => line.t !== '')
    .sort((a, b) => a.y - b.y);
}

/**
 * Reading order: full-width lines split the page into bands. Within a band the left column
 * comes before the right one. A one-column page read with a gutter still comes out in order,
 * because each of its lines crosses the gutter and so becomes a band of its own.
 */
export function readingOrder(words: readonly Word[], gutter: number | undefined): Line[] {
  if (gutter === undefined) return groupLines(words, 2);
  const left: Word[] = [];
  const right: Word[] = [];
  const span: Word[] = [];
  // A run of closely spaced words that reaches across the gutter is one wide line (a title or
  // table), even when the gutter happens to fall in a space between two of its words.
  for (const row of groupRows(words)) {
    let run: Word[] = [];
    const flush = () => {
      const crosses = run.some((w) => w.x < gutter) && run.some((w) => w.x + w.w > gutter);
      if (crosses) span.push(...run);
      else for (const w of run) (w.x + w.w <= gutter ? left : right).push(w);
      run = [];
    };
    for (const word of row) {
      const last = run.at(-1);
      if (last && word.x - (last.x + last.w) > Math.max(last.h, word.h) * 0.9) flush();
      run.push(word);
    }
    flush();
  }
  const spanning = groupLines(span, 2);
  const leftLines = groupLines(left, 0);
  const rightLines = groupLines(right, 1);
  const out: Line[] = [];
  let top = -Infinity;
  for (const cut of [...spanning, undefined]) {
    const bottom = cut ? cut.y : Infinity;
    const inBand = (line: Line) => line.y >= top && line.y < bottom;
    out.push(...leftLines.filter(inBand), ...rightLines.filter(inBand));
    if (cut) out.push(cut);
    top = bottom;
  }
  return out;
}

/**
 * A page number as OCR reads it: digits, with I or l for 1 and O for 0 (`I2`, `6l`, `IOI`).
 * A lone `I` or `l` is not one: running heads use it as a divider.
 */
const PAGE_NUMBER = /^(?:(?=\S*\d)[\dIlO]{1,3}|[IlO]{2,3})$/;
const pageNumber = (token: string) => Number(token.replace(/[Il]/g, '1').replace(/O/g, '0'));

/** Letters only, so OCR noise in digits, spacing and punctuation does not split a running head. */
const marginKey = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

/** Edit distance, for telling OCR variants of one running head apart from other text. */
export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next.push(
        Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)),
      );
    }
    row = next;
  }
  return row[b.length]!;
}

/** The page number at either end of a margin line, as in `12` or `CHAPTER 2 | BESTIARY 61`. */
function printedNumber(text: string): number | undefined {
  const tokens = text.trim().split(/\s+/);
  const end = [tokens.at(-1), tokens[0]].find((token) => token && PAGE_NUMBER.test(token));
  return end === undefined ? undefined : pageNumber(end);
}

/**
 * Drops page numbers and running heads: margin lines that repeat, give or take OCR noise,
 * across many pages. The number on a dropped margin line becomes the page's printed number.
 */
export function stripMargins(pages: Page[]): Page[] {
  const inMargin = (page: Page, line: Line) => line.y < page.h * 0.07 || line.y > page.h * 0.93;
  // OCR spells one running head many ways, so near-identical keys are counted together.
  const near = (key: string, head: string) =>
    editDistance(key, head) <= Math.max(2, head.length * 0.25);
  const repeated = (keep: (line: Line) => boolean, repeats: number) => {
    const seen = new Map<string, number>();
    for (const page of pages) {
      const lines = page.lines.filter((line) => inMargin(page, line) && keep(line));
      for (const key of new Set(lines.map((line) => marginKey(line.t)))) {
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    const clusters: { head: string; count: number }[] = [];
    for (const [key, count] of [...seen].sort((a, b) => b[1] - a[1])) {
      if (key.length < 4) continue;
      const cluster = clusters.find(({ head }) => near(key, head));
      if (cluster) cluster.count += count;
      else clusters.push({ head: key, count });
    }
    return clusters.filter(({ count }) => count >= repeats).map(({ head }) => head);
  };
  // Body text can reach into the margin band, and stat block lines repeat ("Medium beast,
  // unaligned"), so a line must repeat on many pages to count as a head. Running heads are
  // printed smaller than body text, so small lines only need to repeat a few times: a short
  // chapter has few pages.
  const body = bodyHeight(pages);
  const heads = [
    ...repeated(() => true, Math.max(3, pages.length * 0.05)),
    ...repeated((line) => line.h < body * 0.85, 3),
  ];
  // A cut-off head ("CHAPTER 3") is the start of a full one.
  const isHead = (text: string) => {
    const key = marginKey(text);
    if (key.length < 4) return false;
    return heads.some((head) => near(key, head) || (key.length >= 6 && head.startsWith(key)));
  };
  // Some books print the section name in small capitals under the text, one name for only a
  // page or two, beside a page number OCR garbles ("r6g").
  const isFoot = (page: Page, line: Line) => {
    if (line.y <= page.h * 0.93) return false;
    const text = line.t.trim();
    const caps =
      line.h < body * 0.85 &&
      text === text.toUpperCase() &&
      /[A-Z]{3}/.test(text) &&
      text.split(/\s+/).length <= 4;
    const edge = line.x < page.w * 0.1 || line.x > page.w * 0.85;
    return caps || (edge && /^\S{2,4}$/.test(text) && /\d/.test(text));
  };
  return pages.map((page) => {
    let printed: number | undefined;
    const lines = page.lines.filter((line) => {
      if (!inMargin(page, line)) return true;
      if (!PAGE_NUMBER.test(line.t.trim()) && !isHead(line.t)) return !isFoot(page, line);
      printed ??= printedNumber(line.t);
      return false;
    });
    return { ...page, ...(printed !== undefined && { printed }), lines };
  });
}

/** PDF page minus printed page for most pages: add it to a printed page to find the PDF page. */
export function pageOffset(pages: readonly Page[]): number | undefined {
  const counts = new Map<number, number>();
  for (const page of pages) {
    if (page.printed !== undefined) {
      counts.set(page.n - page.printed, (counts.get(page.n - page.printed) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** The usual text height in a book, so headings can be told apart by size. */
export function bodyHeight(pages: readonly Page[]): number {
  return median(pages.flatMap((page) => page.lines.map((line) => line.h)));
}
