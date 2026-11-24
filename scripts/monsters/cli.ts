/**
 * Monster pack pipeline (M50, design in docs/MONSTERS_PLAN.md). Turns monster book PDFs the user
 * owns into a private pack. Everything it writes stays in data/private/ (gitignored): the repo
 * and the hosted app are public, so book text must never leave that folder.
 *
 *   npm run monsters -- extract --book MM --pdf <path to the PDF>
 *   npm run monsters -- names --book MM
 *   npm run monsters -- parse --book MM
 *   npm run monsters -- gold --book MM
 *
 * `names` needs data/private/monsters/config/<book>.json (a BookConfig, see names.ts). `parse`
 * writes creatures.json and lore.json; `gold` compares creatures.json with the SRD creatures.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { joinLines, Vocab } from './clean.ts';
import { extractBook, type ExtractedBook } from './extract.ts';
import { compareGold, formatReport, type GoldCreature } from './gold.ts';
import { assignFamilies, nameBlocks, type NamedCreature } from './identify.ts';
import { expectedNames, type BookConfig, type IndexEntry } from './names.ts';
import { cleanLine, parseBlock } from './parse.ts';
import { letters, segment } from './segment.ts';

export const BOOKS = ['MM', 'VGM', 'MTF', 'MPMM'] as const;
export type Book = (typeof BOOKS)[number];

const PRIVATE = fileURLToPath(new URL('../../data/private/monsters/', import.meta.url));
const DATA = fileURLToPath(new URL('../../data/', import.meta.url));

const readJson = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;

/** Every string in a JSON value. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) strings(item, out);
  return out;
}

/** Trusted words from the clean data in the repo first, then words from every extracted book. */
function buildVocab(): Vocab {
  const vocab = new Vocab();
  for (const folder of ['srd', 'content']) {
    for (const file of readdirSync(DATA + folder).filter((name) => name.endsWith('.json'))) {
      for (const text of strings(readJson(`${DATA}${folder}/${file}`))) vocab.addTrusted(text);
    }
  }
  for (const other of BOOKS) {
    const path = `${PRIVATE}work/${other}/pages.json`;
    if (!existsSync(path)) continue;
    for (const page of readJson<ExtractedBook>(path).pages) {
      for (const line of page.lines) vocab.addBook(line.t);
    }
  }
  return vocab;
}

const srdCreatures = () => readJson<GoldCreature[]>(`${DATA}srd/creatures.json`);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { book: { type: 'string' }, pdf: { type: 'string' } },
});
const [command] = positionals;
const book = values.book as Book | undefined;

if (!book || !BOOKS.includes(book)) {
  throw new Error(`--book must be one of ${BOOKS.join(', ')}`);
}
const work = `${PRIVATE}work/${book}`;

if (command === 'extract') {
  if (!values.pdf) throw new Error('extract needs --pdf <path>');
  const result = await extractBook(book, values.pdf, work);
  const printed = result.pages.filter((page) => page.printed !== undefined).length;
  const lines = result.pages.reduce((sum, page) => sum + page.lines.length, 0);
  console.log(
    `${book}: ${result.pages.length} pages, ${lines} lines, ${printed} printed page numbers, ` +
      `offset ${result.offset ?? 'unknown'}`,
  );
} else if (command === 'names') {
  const pages = readJson<ExtractedBook>(`${work}/pages.json`).pages;
  const config = readJson<BookConfig>(`${PRIVATE}config/${book}.json`);
  const names = expectedNames(pages, config);
  writeFileSync(`${work}/names.json`, JSON.stringify(names, null, 1));
  console.log(`${book}: ${names.length} expected names`);
} else if (command === 'parse') {
  const config = readJson<BookConfig>(`${PRIVATE}config/${book}.json`);
  const expected = readJson<IndexEntry[]>(`${work}/names.json`);
  const inBlocks = (printed: number) =>
    config.statBlocks.some(([first, last]) => printed >= first && printed <= last);
  const pages = readJson<ExtractedBook>(`${work}/pages.json`)
    .pages.map((page) => ({ ...page, printed: page.n - config.offset }))
    .filter((page) => inBlocks(page.printed));
  const vocab = buildVocab();
  const { blocks, families } = segment(pages);
  const parsed = blocks.map((block) => parseBlock(block, vocab));
  const creatures = nameBlocks(parsed, expected, srdCreatures(), vocab);
  assignFamilies(creatures, families);
  const lore = families.map((family) => ({
    ...(family.title !== undefined && { title: family.title }),
    page: family.page,
    sections: family.sections.map((section) => ({
      ...(section.title !== undefined && { title: section.title }),
      text: joinLines(
        section.lines.map((line) => cleanLine(line.t, vocab)),
        vocab,
      ),
    })),
  }));
  writeFileSync(`${work}/creatures.json`, JSON.stringify(creatures, null, 1));
  writeFileSync(`${work}/lore.json`, JSON.stringify(lore, null, 1));
  const named = creatures.filter((creature) => creature.name).length;
  const found = new Set(creatures.map((creature) => letters(creature.name ?? '')));
  const covered = expected.filter((entry) => found.has(letters(entry.name))).length;
  const issues = creatures.reduce((sum, creature) => sum + creature.issues.length, 0);
  console.log(
    `${book}: ${creatures.length} blocks, ${named} named, ${covered}/${expected.length} index names ` +
      `found, ${families.length} lore families, ${issues} issues`,
  );
} else if (command === 'gold') {
  const creatures = readJson<NamedCreature[]>(`${work}/creatures.json`);
  console.log(formatReport(compareGold(creatures, srdCreatures())));
} else {
  throw new Error(`Unknown command "${command ?? ''}". Try: extract, names, parse, gold`);
}
