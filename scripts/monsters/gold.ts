/**
 * Measures the parser against clean data: the SRD creatures, which come from the same book.
 * Pure functions. A field OCR lost entirely is counted apart from a field read wrong, because
 * the review step fills the first kind and only the second kind is a parser fault.
 */
import { letters } from './segment.ts';
import type { NamedCreature } from './identify.ts';
import { ENTRY_LISTS, type ParsedEntry } from './parse.ts';

/** The SRD creature fields the comparison reads (data/srd/creatures.json). */
export interface GoldCreature {
  name: string;
  size?: string;
  creatureType?: string;
  alignment?: string;
  ac?: number;
  acNote?: string;
  hp?: number;
  hpFormula?: string;
  speed?: Record<string, number | boolean>;
  abilities?: Record<string, number>;
  saves?: Record<string, number>;
  skills?: Record<string, number>;
  vulnerabilities?: string[];
  resistances?: string[];
  immunities?: string[];
  conditionImmunities?: string[];
  senses?: Record<string, number>;
  languages?: string;
  cr?: number;
  xp?: number;
  proficiencyBonus?: number;
  traits?: ParsedEntry[];
  actions?: ParsedEntry[];
  reactions?: ParsedEntry[];
  legendaryActions?: ParsedEntry[];
}

export interface FieldScore {
  right: number;
  wrong: number;
  /** Gold has a value; OCR lost the line. */
  lost: number;
  examples: string[];
}

export interface GoldReport {
  compared: number;
  /** Gold creatures with no parsed block of the same name. */
  notFound: string[];
  /** Gold creatures split into one entry per form ("Werebear, Bear Form"): not compared. */
  skipped: number;
  fields: Record<string, FieldScore>;
  right: number;
  wrong: number;
  lost: number;
}

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'/+-]+/g, ' ')
    .trim();

const sameSet = (a: readonly string[], b: readonly string[]) => {
  const x = a.map(norm).sort();
  const y = b.map(norm).sort();
  return x.length === y.length && x.every((value, k) => value === y[k]);
};

const sameRecord = (a: object, b: object) => {
  const clean = (record: object) =>
    Object.entries(record)
      .filter(
        ([key, value]) =>
          value !== undefined && value !== false && !(key === 'walk' && value === 0),
      )
      .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
};

/** Share of words in the longer text matched in order (longest common subsequence). */
export function similarity(a: string, b: string): number {
  const x = norm(a).split(' ').filter(Boolean);
  const y = norm(b).split(' ').filter(Boolean);
  if (x.length === 0 && y.length === 0) return 1;
  let previous = new Array<number>(y.length + 1).fill(0);
  for (const word of x) {
    const row = [0];
    for (let j = 1; j <= y.length; j++) {
      row[j] = word === y[j - 1] ? previous[j - 1]! + 1 : Math.max(previous[j]!, row[j - 1]!);
    }
    previous = row;
  }
  return previous[y.length]! / Math.max(x.length, y.length);
}

/** Entry names compare by letters, with usage folded in: OCR spacing in names varies. */
const entryKey = (entry: ParsedEntry) => letters(entry.name);

export function compareGold(
  creatures: readonly NamedCreature[],
  gold: readonly GoldCreature[],
  limit = 6,
): GoldReport {
  const byName = new Map<string, NamedCreature>();
  for (const creature of creatures) {
    if (creature.name && !byName.has(letters(creature.name)))
      byName.set(letters(creature.name), creature);
  }
  const report: GoldReport = {
    compared: 0,
    notFound: [],
    skipped: 0,
    fields: {},
    right: 0,
    wrong: 0,
    lost: 0,
  };
  const score = (
    field: string,
    name: string,
    ours: unknown,
    theirs: unknown,
    same: boolean | undefined,
  ) => {
    const entry = (report.fields[field] ??= { right: 0, wrong: 0, lost: 0, examples: [] });
    if (same === undefined) {
      entry.lost++;
      report.lost++;
    } else if (same) {
      entry.right++;
      report.right++;
    } else {
      entry.wrong++;
      report.wrong++;
      if (entry.examples.length < limit) {
        entry.examples.push(`${name}: ${JSON.stringify(ours)} vs ${JSON.stringify(theirs)}`);
      }
    }
  };

  for (const clean of gold) {
    if (/, \w+ Form$/.test(clean.name)) {
      report.skipped++;
      continue;
    }
    const ours = byName.get(letters(clean.name));
    if (!ours) {
      report.notFound.push(clean.name);
      continue;
    }
    report.compared++;
    const name = clean.name;
    const text = (field: string, a: string | undefined, b: string | undefined) => {
      if (b === undefined && a === undefined) return;
      score(
        field,
        name,
        a,
        b,
        a === undefined ? undefined : b !== undefined && norm(a) === norm(b),
      );
    };
    const number = (field: string, a: number | undefined, b: number | undefined) => {
      if (b === undefined && a === undefined) return;
      score(field, name, a, b, a === undefined ? undefined : a === b);
    };
    text('size', ours.size, clean.size);
    text('creatureType', ours.creatureType, clean.creatureType);
    text('alignment', ours.alignment, clean.alignment);
    number('ac', ours.ac, clean.ac);
    // The SRD rewords notes the books print shorter: "plate armor" for "plate", "natural armor;
    // 17 with shield" for "natural armor, shield". Compare the armor named, in any order.
    const armor = (note: string | undefined) =>
      note
        ?.toLowerCase()
        .replace(/\barmor\b|\bwith\b|\d+/g, ' ')
        .split(/[,;]/)
        .map(norm)
        .filter(Boolean)
        .sort()
        .join(', ');
    text('acNote', armor(ours.acNote), armor(clean.acNote));
    number('hp', ours.hp, clean.hp);
    text('hpFormula', ours.hpFormula, clean.hpFormula);
    const speedLost = Object.keys(ours.speed).length === 0;
    score(
      'speed',
      name,
      ours.speed,
      clean.speed,
      speedLost ? undefined : sameRecord(ours.speed, clean.speed ?? {}),
    );
    for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const) {
      number('abilities', ours.abilities[ability], clean.abilities?.[ability]);
    }
    score('saves', name, ours.saves, clean.saves, sameRecord(ours.saves, clean.saves ?? {}));
    score('skills', name, ours.skills, clean.skills, sameRecord(ours.skills, clean.skills ?? {}));
    for (const field of [
      'vulnerabilities',
      'resistances',
      'immunities',
      'conditionImmunities',
    ] as const) {
      score(field, name, ours[field], clean[field], sameSet(ours[field], clean[field] ?? []));
    }
    score('senses', name, ours.senses, clean.senses, sameRecord(ours.senses, clean.senses ?? {}));
    // The SRD drops the last word of "but can't speak them".
    const speech = (value: string | undefined) => value?.replace(/(can'?t speak) them\b/gi, '$1');
    text('languages', speech(ours.languages), speech(clean.languages ?? ''));
    number('cr', ours.cr, clean.cr);
    number('xp', ours.xp, clean.xp);
    number('proficiencyBonus', ours.proficiencyBonus, clean.proficiencyBonus);

    for (const list of ['traits', 'actions', 'reactions', 'legendaryActions'] as const) {
      if (!ENTRY_LISTS.includes(list)) continue;
      const mine = ours[list];
      const theirs = clean[list] ?? [];
      score(
        `${list} names`,
        name,
        mine.map((e) => e.name),
        theirs.map((e) => e.name),
        sameSet(mine.map(entryKey), theirs.map(entryKey)),
      );
      for (const goldEntry of theirs) {
        const entry = mine.find((e) => entryKey(e) === entryKey(goldEntry));
        if (!entry) continue;
        const where = `${name} / ${goldEntry.name}`;
        const close = similarity(entry.text, goldEntry.text);
        const field = (report.fields['entry text'] ??= {
          right: 0,
          wrong: 0,
          lost: 0,
          examples: [],
        });
        if (close >= 0.9) {
          field.right++;
          report.right++;
        } else {
          field.wrong++;
          report.wrong++;
          if (field.examples.length < limit)
            field.examples.push(`${where} (${close.toFixed(2)}): ${entry.text.slice(0, 160)}`);
        }
        if (goldEntry.usage !== undefined || entry.usage !== undefined) {
          score('usage', where, entry.usage, goldEntry.usage, entry.usage === goldEntry.usage);
        }
        if (goldEntry.attackBonus !== undefined || entry.attackBonus !== undefined) {
          score(
            'attackBonus',
            where,
            entry.attackBonus,
            goldEntry.attackBonus,
            entry.attackBonus === undefined
              ? undefined
              : entry.attackBonus === goldEntry.attackBonus,
          );
        }
        if (goldEntry.damage?.length) {
          const found = goldEntry.damage.every((d) =>
            entry.damage?.some((e) => e.dice === d.dice && e.type === d.type),
          );
          score('damage', where, entry.damage, goldEntry.damage, found);
        }
      }
    }
  }
  return report;
}

export function formatReport(report: GoldReport): string {
  const rate = (right: number, wrong: number) =>
    right + wrong === 0 ? '-' : `${((100 * right) / (right + wrong)).toFixed(1)}%`;
  const lines = [
    `compared ${report.compared}, not found ${report.notFound.length}, per-form entries skipped ${report.skipped}`,
    `fields read right ${rate(report.right, report.wrong)} (${report.right} right, ${report.wrong} wrong); ` +
      `${report.lost} lost to OCR`,
  ];
  for (const [field, entry] of Object.entries(report.fields)) {
    lines.push(
      `  ${field.padEnd(22)} ${rate(entry.right, entry.wrong).padStart(6)}  wrong ${entry.wrong}, lost ${entry.lost}`,
    );
    for (const example of entry.examples) lines.push(`      ${example}`);
  }
  if (report.notFound.length > 0) lines.push(`not found: ${report.notFound.join(', ')}`);
  return lines.join('\n');
}
