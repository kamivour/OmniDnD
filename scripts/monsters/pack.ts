/**
 * Last stage of the monster pipeline: every book's validated creatures and lore, merged into one
 * private pack the app imports (M50). Pure functions; the CLI reads and writes the files.
 *
 * One entry per creature (D269). Copies match by name, after optional renames from aliases.json.
 * Stats come from the newest printing that passes the schema; the entry lists every book and
 * printed page. Creatures the SRD already bundles get only their book tags and lore.
 */
import { createHash } from 'node:crypto';
import { abilityModifier } from '../../src/engine/calc/abilities.ts';
import { DAMAGE_TYPES } from '../../src/engine/rules2014.ts';
import {
  CreatureDefSchema,
  MONSTER_PACK_FORMAT,
  MonsterPackSchema,
  type CreatureDef,
  type CreatureSupplement,
  type MonsterLore,
  type MonsterPack,
} from '../../src/engine/schema/index.ts';
import { titleCase, type NamedCreature } from './identify.ts';
import { ENTRY_LISTS, proficiencyForCr, XP_BY_CR, type ParsedEntry } from './parse.ts';
import { nameKey, type ValidatedCreature } from './validate.ts';

/** Printing order, oldest first. */
export const PACK_BOOKS = ['MM', 'VGM', 'MTF', 'MPMM'] as const;
export type PackBook = (typeof PACK_BOOKS)[number];

/** Whose stats win when a creature is printed in several books (D269: newest printing). */
const STAT_PRIORITY: readonly PackBook[] = ['MPMM', 'MM', 'MTF', 'VGM'];

/**
 * Marker stored in every pack. The production build test fails if it shows up in dist/.
 * Keep it out of src/: only this builder and that test may contain it.
 */
export const PACK_CANARY = 'omnidnd-private-monster-pack-canary-4d1c';

export interface PackLoreFamily {
  title?: string;
  /** PDF page; the book's offset turns it into the printed page. */
  page: number;
  sections: { title?: string; text: string }[];
}

export interface PackBookInput {
  book: PackBook;
  /** Printed page = PDF page - offset. */
  offset: number;
  records: readonly ValidatedCreature[];
  lore: readonly PackLoreFamily[];
}

export interface PackInput {
  books: readonly PackBookInput[];
  /** Bundled SRD creatures: these get book tags and lore, never new stats. */
  srd: readonly { id: string; name: string }[];
  /** Old name to current name, for creatures a later book renamed. */
  aliases?: Readonly<Record<string, string>>;
  extractedAt: string;
}

export interface PackManifest {
  version: string;
  extractedAt: string;
  books: Record<
    string,
    { blocks: number; unnamed: number; duplicates: number; used: number; lore: number }
  >;
  creatures: number;
  supplements: number;
  lore: number;
  /** Creatures with notes to check against the printed page. */
  flagged: number;
  /** Newest copy failed the schema; an older printing supplied the stats. */
  fallbacks: string[];
  /** No copy passed the schema; left out until the review queue fixes them. */
  excluded: { name: string; books: string[]; problems: string[] }[];
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const DICE = /^\d+(?:d\d+)?(?:[+-]\d+)?$/;
const isDamageType = (type: string): type is (typeof DAMAGE_TYPES)[number] =>
  (DAMAGE_TYPES as readonly string[]).includes(type);

function entry(raw: ParsedEntry) {
  const name = raw.name.trim();
  const text = raw.text.trim();
  if (!name || !text) return undefined;
  const damage = (raw.damage ?? [])
    .map((part) => ({ dice: part.dice.replace(/\s+/g, ''), type: part.type.toLowerCase() }))
    .filter((part) => DICE.test(part.dice) && isDamageType(part.type));
  return {
    name,
    text,
    ...(raw.usage?.trim() && { usage: raw.usage.trim() }),
    ...(raw.attackBonus !== undefined &&
      Number.isInteger(raw.attackBonus) && { attackBonus: raw.attackBonus }),
    ...(damage.length && { damage }),
  };
}

const entries = (list: readonly ParsedEntry[] | undefined) =>
  (list ?? []).map(entry).filter((item) => item !== undefined);

const nonEmpty = <T extends object>(record: T) => (Object.keys(record).length ? record : undefined);

interface Copy {
  book: PackBook;
  printed: number;
  record: ValidatedCreature;
  creature: NamedCreature & { name: string };
}

/** The record as a CreatureDef draft; the schema decides whether it is usable. */
function toDef(id: string, name: string, copy: Copy): Record<string, unknown> {
  const c = copy.creature;
  const wis = c.abilities.WIS;
  const perception = c.skills.perception ?? (wis === undefined ? 0 : abilityModifier(wis));
  const lists = Object.fromEntries(ENTRY_LISTS.map((list) => [list, entries(c[list])]));
  const intros = Object.fromEntries(
    Object.entries(c.intros).filter(([, text]) => typeof text === 'string' && text.trim()),
  );
  return {
    kind: 'creature',
    id,
    name,
    ruleset: '5e-2014',
    source: copy.book,
    srd: false,
    size: c.size,
    ...(c.sizes && c.sizes.length > 1 && { sizes: c.sizes }),
    creatureType: c.creatureType,
    alignment: c.alignment,
    ac: c.ac,
    ...(c.acNote?.trim() && { acNote: c.acNote.trim() }),
    hp: c.hp,
    hpFormula: c.hpFormula?.replace(/\s+/g, ''),
    speed: c.speed,
    abilities: c.abilities,
    ...(nonEmpty(c.saves) && { saves: c.saves }),
    ...(nonEmpty(c.skills) && { skills: c.skills }),
    vulnerabilities: c.vulnerabilities,
    resistances: c.resistances,
    immunities: c.immunities,
    conditionImmunities: c.conditionImmunities,
    senses: { ...c.senses, passivePerception: c.senses.passivePerception ?? 10 + perception },
    languages: c.languages?.trim() || '—',
    cr: c.cr,
    xp: c.cr === undefined ? undefined : XP_BY_CR.get(c.cr),
    proficiencyBonus: c.cr === undefined ? undefined : proficiencyForCr(c.cr),
    traits: lists.traits,
    actions: lists.actions,
    reactions: lists.reactions,
    legendaryActions: lists.legendaryActions,
    ...(lists.bonusActions!.length && { bonusActions: lists.bonusActions }),
    ...(lists.mythicActions!.length && { mythicActions: lists.mythicActions }),
    ...(lists.lairActions!.length && { lairActions: lists.lairActions }),
    ...(Object.keys(intros).length && { intros }),
  };
}

const problemsOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((issue) => `${issue.path.map(String).join('.') || 'entry'}: ${issue.message}`);

const blockingNotes = (record: ValidatedCreature) =>
  record.findings.filter((f) => f.severity === 'blocking').map((f) => f.message);

/** Lore headings are printed in capitals: "KRUTHIKS" reads better as "Kruthiks". */
const loreTitle = (title: string) => (title === title.toUpperCase() ? titleCase(title) : title);

const textKey = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function buildPack(input: PackInput): { pack: MonsterPack; manifest: PackManifest } {
  const rename = new Map(
    Object.entries(input.aliases ?? {}).map(([from, to]) => [nameKey(from), to]),
  );
  const srdIds = new Set(input.srd.map((creature) => creature.id));
  const srdByKey = new Map<string, string>();
  for (const creature of input.srd) {
    srdByKey.set(nameKey(creature.name), creature.id);
    srdByKey.set(nameKey(creature.id.replace(/^creature\./, '')), creature.id);
  }
  const order = [...input.books].sort(
    (a, b) => PACK_BOOKS.indexOf(a.book) - PACK_BOOKS.indexOf(b.book),
  );

  // Lore, oldest book first: a paragraph a later book repeats word for word is kept once.
  const seenText = new Set<string>();
  const loreById = new Map<string, MonsterLore>();
  const familyId = new Map<string, string | undefined>();
  for (const { book, offset, lore } of order) {
    lore.forEach((family, index) => {
      const sections = family.sections
        .map((section) => ({ ...section, text: section.text.trim() }))
        .filter((section) => section.text && !seenText.has(textKey(section.text)));
      for (const section of sections) seenText.add(textKey(section.text));
      const page = family.page - offset;
      const id = `lore.${book.toLowerCase()}.${index}`;
      if (!sections.length || page < 1) return familyId.set(`${book}:${index}`, undefined);
      familyId.set(`${book}:${index}`, id);
      loreById.set(id, {
        id,
        source: book,
        page,
        ...(family.title?.trim() && { title: loreTitle(family.title.trim()) }),
        sections: sections.map((section) => ({
          ...(section.title?.trim() && { title: section.title.trim() }),
          text: section.text,
        })),
      });
    });
  }

  // Group copies by name. A second block with the same name in one book is left out.
  const groups = new Map<string, Copy[]>();
  const manifestBooks: PackManifest['books'] = {};
  for (const { book, records, lore } of order) {
    const stats = { blocks: records.length, unnamed: 0, duplicates: 0, used: 0, lore: lore.length };
    manifestBooks[book] = stats;
    for (const record of records) {
      const { creature } = record;
      if (!creature.name) {
        stats.unnamed++;
        continue;
      }
      const name = rename.get(nameKey(creature.name)) ?? creature.name;
      const key = nameKey(name);
      const copies = groups.get(key) ?? [];
      if (copies.some((copy) => copy.book === book)) {
        stats.duplicates++;
        continue;
      }
      copies.push({
        book,
        printed: creature.printed ?? creature.page,
        record,
        creature: { ...creature, name },
      });
      groups.set(key, copies);
    }
  }

  const creatures: CreatureDef[] = [];
  const supplements: CreatureSupplement[] = [];
  const manifest: PackManifest = {
    version: '',
    extractedAt: input.extractedAt,
    books: manifestBooks,
    creatures: 0,
    supplements: 0,
    lore: 0,
    flagged: 0,
    fallbacks: [],
    excluded: [],
  };
  const usedIds = new Set<string>();
  const usedLore = new Set<string>();
  const loreFor = (copies: readonly Copy[]) => {
    const ids = copies
      .map((copy) =>
        copy.creature.family === undefined
          ? undefined
          : familyId.get(`${copy.book}:${copy.creature.family}`),
      )
      .filter((id) => id !== undefined);
    for (const id of ids) usedLore.add(id);
    return [...new Set(ids)];
  };

  for (const [key, copies] of groups) {
    copies.sort((a, b) => PACK_BOOKS.indexOf(a.book) - PACK_BOOKS.indexOf(b.book));
    const books = copies.map((copy) => ({ source: copy.book, page: copy.printed }));
    const name = copies.at(-1)!.creature.name;
    const srdId = srdByKey.get(key) ?? srdByKey.get(nameKey(slug(name)));
    if (srdId) {
      const loreIds = loreFor(copies);
      supplements.push({ id: srdId, books, ...(loreIds.length && { loreIds }) });
      for (const copy of copies) manifestBooks[copy.book]!.used++;
      continue;
    }
    let id = `creature.${slug(name)}`;
    if (usedIds.has(id) || srdIds.has(id)) id = `${id}-${slug(copies[0]!.book)}`;
    const ranked = [...copies].sort(
      (a, b) => STAT_PRIORITY.indexOf(a.book) - STAT_PRIORITY.indexOf(b.book),
    );
    const problems: string[] = [];
    let chosen: { def: CreatureDef; copy: Copy } | undefined;
    for (const copy of ranked) {
      const result = CreatureDefSchema.safeParse(toDef(id, name, copy));
      if (result.success) {
        chosen = { def: result.data, copy };
        break;
      }
      problems.push(...problemsOf(result.error).map((problem) => `${copy.book}: ${problem}`));
    }
    if (!chosen) {
      manifest.excluded.push({ name, books: copies.map((copy) => copy.book), problems });
      continue;
    }
    usedIds.add(id);
    for (const copy of copies) manifestBooks[copy.book]!.used++;
    const review = blockingNotes(chosen.copy.record);
    if (chosen.copy !== ranked[0]) {
      manifest.fallbacks.push(name);
      review.unshift(
        `Stats come from ${chosen.copy.book}; the ${ranked[0]!.book} copy could not be read.`,
      );
    }
    const loreIds = loreFor(copies);
    const npc = copies.some((copy) => /\bany race\b/i.test(copy.creature.creatureType ?? ''));
    if (review.length) manifest.flagged++;
    creatures.push({
      ...chosen.def,
      books,
      ...(loreIds.length && { loreIds }),
      ...(npc && { npc }),
      ...(review.length && { review }),
    });
  }

  creatures.sort((a, b) => a.name.localeCompare(b.name));
  supplements.sort((a, b) => a.id.localeCompare(b.id));
  const lore = [...loreById.values()].filter((item) => usedLore.has(item.id));
  const version = createHash('sha256')
    .update(JSON.stringify({ creatures, supplements, lore }))
    .digest('hex')
    .slice(0, 12);
  const pack = MonsterPackSchema.parse({
    format: MONSTER_PACK_FORMAT,
    version,
    extractedAt: input.extractedAt,
    canary: PACK_CANARY,
    creatures,
    lore,
    supplements,
  });
  Object.assign(manifest, {
    version,
    creatures: creatures.length,
    supplements: supplements.length,
    lore: lore.length,
  });
  return { pack, manifest };
}
