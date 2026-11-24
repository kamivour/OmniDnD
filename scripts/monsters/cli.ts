/**
 * Monster pack pipeline (M50, design in docs/MONSTERS_PLAN.md). Turns monster book PDFs the user
 * owns into a private pack. Everything it writes stays in data/private/ (gitignored): the repo
 * and the hosted app are public, so book text must never leave that folder.
 *
 *   npm run monsters -- extract --book MM --pdf <path to the PDF>
 *   npm run monsters -- names --book MM
 *
 * `names` needs data/private/monsters/config/<book>.json (a BookConfig, see names.ts).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { extractBook, type ExtractedBook } from './extract.ts';
import { expectedNames, type BookConfig } from './names.ts';

export const BOOKS = ['MM', 'VGM', 'MTF', 'MPMM'] as const;
export type Book = (typeof BOOKS)[number];

const PRIVATE = fileURLToPath(new URL('../../data/private/monsters/', import.meta.url));

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { book: { type: 'string' }, pdf: { type: 'string' } },
});
const [command] = positionals;
const book = values.book as Book | undefined;

if (!book || !BOOKS.includes(book)) {
  throw new Error(`--book must be one of ${BOOKS.join(', ')}`);
}

if (command === 'extract') {
  if (!values.pdf) throw new Error('extract needs --pdf <path>');
  const result = await extractBook(book, values.pdf, `${PRIVATE}work/${book}`);
  const printed = result.pages.filter((page) => page.printed !== undefined).length;
  const lines = result.pages.reduce((sum, page) => sum + page.lines.length, 0);
  console.log(
    `${book}: ${result.pages.length} pages, ${lines} lines, ${printed} printed page numbers, ` +
      `offset ${result.offset ?? 'unknown'}`,
  );
} else if (command === 'names') {
  const work = `${PRIVATE}work/${book}`;
  const pages = (JSON.parse(readFileSync(`${work}/pages.json`, 'utf8')) as ExtractedBook).pages;
  const config = JSON.parse(readFileSync(`${PRIVATE}config/${book}.json`, 'utf8')) as BookConfig;
  const names = expectedNames(pages, config);
  writeFileSync(`${work}/names.json`, JSON.stringify(names, null, 1));
  console.log(`${book}: ${names.length} expected names`);
} else {
  throw new Error(`Unknown command "${command ?? ''}". Try: extract, names`);
}
