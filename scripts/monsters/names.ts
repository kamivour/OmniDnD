/**
 * Stage 3 of the monster pipeline: the expected creature names for a book, read from its index
 * of stat blocks. The list measures coverage later and helps fix OCR'd titles. Pure functions.
 */
import type { Page } from './layout.ts';

/** What a book's private config says about its layout. Pages are printed page numbers. */
export interface BookConfig {
  /** PDF page = printed page + offset. */
  offset: number;
  /** PDF pages of the index (or contents) that lists every stat block with its page. */
  index: number[];
  /** The index heading, when the index shares a page with the contents above it. */
  indexHeading?: string;
  /** Printed page ranges that hold stat blocks, first and last page inclusive. */
  statBlocks: [number, number][];
  /** Printed page ranges of lore chapters that hold no stat blocks. */
  lore?: [number, number][];
}

export interface IndexEntry {
  name: string;
  /** Missing when OCR lost the page number. */
  page?: number;
}

/**
 * One entry is a name, a leader, and a page: `Giant Frog, 325` or `Gauth ........ 125`. OCR
 * puts any junk in a leader, splits page numbers (`32 1`), reads 1 as I or l and 0 as O, and
 * sometimes loses the number. A line can hold entries from several columns.
 */
const NAME = String.raw`(\p{Lu}[\p{L}'’()\- ]*?[\p{L})])`;
const PAGE = String.raw`\s*[^\p{L}\p{N}\s()][^\p{L}\p{N}()]*?((?:[\dIlO] ?){0,2}[\dIlO])(?![\p{L}\p{N}])`;
/** Without a number, only a long leader marks an entry (not `Courtier. See Noble.`). */
const LOST = String.raw`\s*(?:[^\p{L}\p{N}\s()]\s*){8,}(?=\p{Lu}|$)`;
const ENTRY = new RegExp(`${NAME}(?:${PAGE}|${LOST})`, 'gu');

const pageNumber = (digits: string) =>
  Number(digits.replace(/ /g, '').replace(/[Il]/g, '1').replace(/O/g, '0'));

export function parseIndexLine(line: string): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const match of line.matchAll(ENTRY)) {
    const before = line.slice(0, match.index).trimEnd();
    // `Chapter 2: Bestiary .... 37` and `App. C: Monster Lists` are contents, not creatures.
    if (before.endsWith(':')) continue;
    const name = match[1]!.replace(/\s+/g, ' ').trim();
    if (name.replace(/[^\p{L}]/gu, '').length < 3) continue;
    const digits = match[2];
    out.push(digits === undefined ? { name } : { name, page: pageNumber(digits) });
  }
  return out;
}

const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

/**
 * The index entries that point into a stat block chapter, one per name, in index order. An
 * entry whose page OCR lost is kept: the index lists only stat blocks.
 */
export function expectedNames(pages: readonly Page[], config: BookConfig): IndexEntry[] {
  const inRange = (page: number | undefined) =>
    page === undefined || config.statBlocks.some(([first, last]) => page >= first && page <= last);
  const heading = config.indexHeading && nameKey(config.indexHeading);
  const seen = new Set<string>();
  const out: IndexEntry[] = [];
  for (const page of pages) {
    if (!config.index.includes(page.n)) continue;
    const top = heading ? page.lines.find((line) => nameKey(line.t) === heading)?.y : undefined;
    for (const line of page.lines) {
      if (top !== undefined && line.y <= top) continue;
      for (const entry of parseIndexLine(line.t)) {
        const key = nameKey(entry.name);
        if (!inRange(entry.page) || seen.has(key)) continue;
        seen.add(key);
        out.push(entry);
      }
    }
  }
  return out;
}
