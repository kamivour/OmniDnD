import { z } from 'zod';
import type { NamedCreature } from './identify.ts';
import type { IndexEntry } from './names.ts';
import type { ValidatedCreature } from './validate.ts';
import { nameKey } from './validate.ts';
import { SIZES } from './segment.ts';

const entry = z.strictObject({
  name: z.string().min(1),
  text: z.string(),
  usage: z.string().optional(),
  attackBonus: z.int().optional(),
  damage: z.array(z.strictObject({ dice: z.string(), type: z.string() })).optional(),
});
const text = z.string();
const list = z.array(text);
const abilityValues = z.partialRecord(z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']), z.int());
const size = z.enum(SIZES);
const movement = z.int().nonnegative();
const nonempty = text.trim().min(1);

const fields = z
  .strictObject({
    name: nonempty,
    size,
    sizes: z.array(size).min(1),
    creatureType: nonempty,
    alignment: nonempty,
    ac: z.int().positive(),
    acNote: text,
    hp: z.int().positive(),
    hpFormula: nonempty,
    speed: z
      .strictObject({
        walk: movement,
        fly: movement,
        swim: movement,
        climb: movement,
        burrow: movement,
        hover: z.boolean(),
      })
      .partial(),
    abilities: abilityValues,
    printedModifiers: abilityValues,
    saves: abilityValues,
    skills: z.record(text, z.int()),
    vulnerabilities: list,
    resistances: list,
    immunities: list,
    conditionImmunities: list,
    senses: z
      .strictObject({
        darkvision: movement,
        blindsight: movement,
        truesight: movement,
        tremorsense: movement,
        passivePerception: movement,
      })
      .partial(),
    languages: text,
    cr: z.number().nonnegative(),
    xp: movement,
    proficiencyBonus: z.int().min(2).max(9),
    traits: z.array(entry),
    actions: z.array(entry),
    bonusActions: z.array(entry),
    reactions: z.array(entry),
    legendaryActions: z.array(entry),
    mythicActions: z.array(entry),
    lairActions: z.array(entry),
    intros: z.partialRecord(
      z.enum([
        'actions',
        'bonusActions',
        'reactions',
        'legendaryActions',
        'mythicActions',
        'lairActions',
      ]),
      text,
    ),
  })
  .partial();

const findingSignature = z.strictObject({ code: nonempty, message: nonempty });
const blockOverride = z.strictObject({
  reason: nonempty,
  fields: fields.optional(),
  confirmed: z.array(findingSignature).optional(),
});
const addedBlock = blockOverride.extend({
  fields: fields.extend({
    name: nonempty,
    size,
    creatureType: nonempty,
    ac: z.int().positive(),
    hp: z.int().positive(),
    hpFormula: nonempty,
    cr: z.number().nonnegative(),
    xp: movement,
    proficiencyBonus: z.int().min(2).max(9),
    speed: fields.shape.speed.unwrap(),
    abilities: z.record(z.enum(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']), z.int().min(1).max(30)),
    languages: text,
    actions: z.array(entry),
  }),
});
const indexOverride = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('alias'),
    name: nonempty,
    page: z.int().positive().optional(),
    reason: nonempty,
  }),
  z.strictObject({ kind: z.literal('heading'), reason: nonempty }),
]);

export const OverridesSchema = z.strictObject({
  blocks: z.record(text, blockOverride).default({}),
  added: z.record(text.regex(/^\d+:.+$/), addedBlock).default({}),
  index: z.record(text, indexOverride).default({}),
});
export type Overrides = z.infer<typeof OverridesSchema>;

/** Match the printed page and original heading before applying any patch to the name. */
export const blockKey = ({ printed, page, heading, name }: NamedCreature) =>
  `${printed ?? page}:${heading ?? name ?? ''}`;

export function applyOverrides(creatures: readonly NamedCreature[], overrides: Overrides) {
  const applied = new Set<string>();
  const patched = creatures.map((creature): NamedCreature => {
    const key = blockKey(creature);
    const patch = Object.hasOwn(overrides.blocks, key) ? overrides.blocks[key] : undefined;
    if (!patch) return creature;
    if (applied.has(key)) throw new Error(`More than one block matches override ${key}.`);
    applied.add(key);
    return { ...creature, ...patch.fields };
  });
  for (const key of Object.keys(overrides.blocks))
    if (!applied.has(key)) throw new Error(`No block matches override ${key}.`);
  return patched;
}

/** A reviewer can transcribe a full card when the text layer omitted it. */
export function additionalBlocks(
  overrides: Overrides,
  offset: number,
  pageCount: number,
): NamedCreature[] {
  return Object.entries(overrides.added).map(([key, { fields }]) => {
    const separator = key.indexOf(':');
    const printed = Number(key.slice(0, separator));
    const page = printed + offset;
    if (!Number.isInteger(page) || page < 1 || page > pageCount)
      throw new Error(`Added block ${key} is outside the PDF.`);
    return {
      page,
      printed,
      heading: key.slice(separator + 1),
      saves: {},
      skills: {},
      senses: {},
      vulnerabilities: [],
      resistances: [],
      immunities: [],
      conditionImmunities: [],
      traits: [],
      bonusActions: [],
      reactions: [],
      legendaryActions: [],
      mythicActions: [],
      lairActions: [],
      intros: {},
      issues: [],
      ...fields,
    };
  });
}

/** Only exact findings can be confirmed. A changed finding needs a fresh review. */
export function confirmFindings(
  record: ValidatedCreature,
  confirmed: NonNullable<z.infer<typeof blockOverride>['confirmed']>,
) {
  const same = (a: { code: string; message: string }, b: { code: string; message: string }) =>
    a.code === b.code && a.message === b.message;
  const matches = (finding: (typeof record.findings)[number]) =>
    // Missing required fields need a patch. A creature printed without actions is the exception.
    (finding.severity === 'review' || finding.code === 'missing:actions') &&
    confirmed.some((item) => same(item, finding));
  return {
    ...record,
    findings: record.findings.filter((finding) => !matches(finding)),
    confirmed: record.findings.filter(matches),
  };
}

export function reviewIndex(expected: readonly IndexEntry[], overrides: Overrides) {
  const matches = new Set<string>();
  const names = new Map(
    Object.entries(overrides.index).map(([name, patch]) => [nameKey(name), patch]),
  );
  const entries = expected.flatMap((entry): IndexEntry[] => {
    const key = nameKey(entry.name);
    const patch = names.get(key);
    if (!patch) return [entry];
    matches.add(key);
    return patch.kind === 'alias'
      ? [{ ...entry, name: patch.name, ...(patch.page !== undefined && { page: patch.page }) }]
      : [];
  });
  for (const key of names.keys())
    if (!matches.has(key)) throw new Error(`No index entry matches override ${key}.`);
  return entries;
}
