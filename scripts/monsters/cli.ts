/**
 * Monster pack pipeline (M50, design in docs/MONSTERS_PLAN.md). Turns monster book PDFs the user
 * owns into a private pack. Everything it writes stays in data/private/ (gitignored): the repo
 * and the hosted app are public, so book text must never leave that folder.
 *
 *   npm run monsters -- extract --book MM --pdf <path to the PDF>
 *   npm run monsters -- names --book MM
 *   npm run monsters -- parse --book MM
 *   npm run monsters -- gold --book MM
 *   npm run monsters -- validate --book MM
 *   npm run monsters -- review --book MM --pdf <path to the PDF>
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
import {
  additionalBlocks,
  applyOverrides,
  blockKey,
  confirmFindings,
  OverridesSchema,
  reviewIndex,
} from './overrides.ts';
import { cleanLine, parseBlock } from './parse.ts';
import { compareReprints } from './reprints.ts';
import { renderPages, reviewHtml, reviewPages, type ReviewReport } from './review.ts';
import { segment } from './segment.ts';
import { indexCoverage, validateCreature } from './validate.ts';

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
const workFor = (book: Book) => `${PRIVATE}work/${book}`;
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 1));

function parseBook(book: Book, vocab: Vocab) {
  const work = workFor(book);
  const config = readJson<BookConfig>(`${PRIVATE}config/${book}.json`);
  const groundTruth = readJson<IndexEntry[]>(`${work}/names.json`);
  const patchPath = `${PRIVATE}overrides/${book}.json`;
  const overrides = OverridesSchema.parse(existsSync(patchPath) ? readJson(patchPath) : {});
  const expected = reviewIndex(groundTruth, overrides);
  const { pages } = readJson<ExtractedBook>(`${work}/pages.json`);
  const inBlocks = (printed: number) =>
    config.statBlocks.some(([first, last]) => printed >= first && printed <= last);
  const { blocks, families } = segment(
    pages
      .map((page) => ({ ...page, printed: page.n - config.offset }))
      .filter((page) => inBlocks(page.printed)),
  );
  const parsed = blocks.map((block) => parseBlock(block, vocab));
  const named = nameBlocks(parsed, expected, srdCreatures(), vocab);
  const creatures = applyOverrides(named, overrides);
  const added = additionalBlocks(overrides, config.offset, pages.length);
  const keys = named.map(blockKey);
  const parsedKeys = new Set(keys);
  for (const creature of added) {
    const key = blockKey(creature);
    if (parsedKeys.has(key)) throw new Error(`Added block ${key} already exists in the PDF text.`);
    keys.push(key);
  }
  creatures.push(...added);
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
  return {
    creatures,
    lore,
    expected,
    config,
    pageCount: pages.length,
    overrides,
    keys,
  };
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { book: { type: 'string' }, pdf: { type: 'string' } },
});
const [command] = positionals;
const book = values.book as Book | undefined;

if (!book || !BOOKS.includes(book)) {
  throw new Error(`--book must be one of ${BOOKS.join(', ')}`);
}
const work = workFor(book);

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
  const { creatures, expected, lore } = parseBook(book, buildVocab());
  writeJson(`${work}/creatures.json`, creatures);
  writeJson(`${work}/lore.json`, lore);
  const named = creatures.filter((creature) => creature.name).length;
  const coverage = indexCoverage(creatures, expected);
  const issues = creatures.reduce((sum, creature) => sum + creature.issues.length, 0);
  console.log(
    `${book}: ${creatures.length} blocks, ${named} named, ${coverage.matched}/${coverage.expected} index names ` +
      `found, ${lore.length} lore families, ${issues} issues`,
  );
} else if (command === 'gold') {
  const creatures = readJson<NamedCreature[]>(`${work}/creatures.json`);
  console.log(formatReport(compareGold(creatures, srdCreatures())));
} else if (command === 'validate' || command === 'review') {
  if (command === 'review' && !values.pdf) throw new Error('review needs --pdf <path>');
  const vocab = buildVocab();
  const parsed = parseBook(book, vocab);
  const records = parsed.creatures.map((creature, i) => {
    const key = parsed.keys[i]!;
    const checked = { ...validateCreature(creature), overrideKey: key };
    const patch = Object.hasOwn(parsed.overrides.blocks, key)
      ? parsed.overrides.blocks[key]
      : Object.hasOwn(parsed.overrides.added, key)
        ? parsed.overrides.added[key]
        : undefined;
    return patch?.confirmed ? confirmFindings(checked, patch.confirmed) : checked;
  });
  const creatures = records.map(({ creature }) => creature);
  const report: ReviewReport = {
    book,
    records,
    coverage: indexCoverage(creatures, parsed.expected),
    ...((book === 'VGM' || book === 'MTF') && {
      reprints: compareReprints(creatures, parseBook('MPMM', vocab).creatures),
    }),
  };
  writeJson(`${work}/creatures.json`, creatures);
  writeJson(`${work}/lore.json`, parsed.lore);
  writeJson(`${work}/review.json`, report);
  if (command === 'review') {
    const pages = reviewPages(report, parsed.config.offset, parsed.pageCount);
    const images = await renderPages(work, values.pdf!, pages);
    writeFileSync(`${work}/review.html`, reviewHtml(report, images, parsed.config.offset));
    console.log(`${book}: review.html includes ${images.size} flagged PDF pages`);
  }
  const findings = records.flatMap((record) => record.findings);
  const blocked = findings.filter(({ severity }) => severity === 'blocking').length;
  const { matched, expected, missing, duplicates } = report.coverage;
  console.log(
    `${book}: ${matched}/${expected} index names, ${blocked} blocking findings, ${findings.length - blocked} to review, ${duplicates.length} duplicate names, ${records.filter((record) => record.correction).length} automatic corrections`,
  );
  if (report.reprints)
    console.log(
      `${book}: ${report.reprints.changed.length}/${report.reprints.matched} named reprints differ from MPMM`,
    );
  if (blocked || missing.length || duplicates.length) process.exitCode = 1;
} else {
  throw new Error(
    `Unknown command "${command ?? ''}". Try: extract, names, parse, gold, validate, review`,
  );
}
