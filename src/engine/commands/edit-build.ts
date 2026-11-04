import { z } from 'zod';
import { computeSheet } from '../calc/sheet';
import { AbilityBasesSchema, abilityBaseIssues } from '../calc/ability-methods';
import type { Registry } from '../registry';
import {
  AbilitySchema,
  CharacterBuildSchema,
  CampaignSchema,
  refId,
  type CharacterBuild,
  type RaceDef,
  type RefKind,
} from '../schema';
import type { Check, Command, CommandContext } from './runner';
import { block, warn, withNotes } from './shared';

const EditBuildChangesSchema = z.strictObject({
  name: z.string().trim().min(1).optional(),
  portrait: z.string().nullable().optional(),
  alignment: z.string().trim().nullable().optional(),
  raceId: refId('race').optional(),
  subraceId: refId('race').nullable().optional(),
  backgroundId: refId('background').optional(),
  subclasses: z
    .array(
      z.strictObject({
        classId: refId('class'),
        subclassId: refId('subclass').nullable().optional(),
      }),
    )
    .optional(),
  proficiencies: CharacterBuildSchema.shape.proficiencies.optional(),
  xp: z.int().nonnegative().nullable().optional(),
  abilityBases: AbilityBasesSchema.optional(),
});

const EditBuildPayloadSchema = z.strictObject({
  changes: EditBuildChangesSchema,
  /** A form baseline, never a replacement record. Only affected fields are compared. */
  expected: CharacterBuildSchema,
  racialChoices: z.array(AbilitySchema).optional(),
  expectedAbilityMethod: CampaignSchema.shape.abilityMethod.optional(),
});

export type EditBuildChanges = z.infer<typeof EditBuildChangesSchema>;
export type EditBuildPayload = z.infer<typeof EditBuildPayloadSchema>;

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const info = (reason: string): Check => ({ level: 'info', reason });

function referenceCheck(ctx: CommandContext, kind: RefKind, id: string): Check[] {
  const entry = ctx.registry.entries.get(id);
  if (!entry || entry.kind !== kind) return [block(`Unknown ${kind} reference: ${id}`)];
  return entry.ruleset !== ctx.campaign.ruleset || !ctx.campaign.sources.includes(entry.source)
    ? [block(`${entry.name} is not enabled by this campaign's rules and sources`)]
    : [];
}

/** Only exact identifiable racial grants are replaced; ambiguous legacy bonuses remain. */
function racialGrantIndexes(build: CharacterBuild, registry: Registry): Set<number> {
  const entry = registry.entries.get(build.subraceId ?? build.raceId);
  if (entry?.kind !== 'race') return new Set();
  const sources = new Set([build.raceId, build.subraceId].filter((id) => id !== undefined));
  const candidates = build.abilityScores.bonuses
    .map((bonus, index) => ({ ...bonus, index }))
    .filter(({ source }) => sources.has(source));
  const selected = new Set<number>();
  for (const fixed of entry.abilityBonuses) {
    const matches = candidates.filter(
      (bonus) =>
        !selected.has(bonus.index) &&
        bonus.ability === fixed.ability &&
        bonus.value === fixed.value,
    );
    if (matches.length === 1) selected.add(matches[0]!.index);
  }
  const choices = entry.abilityChoices;
  if (choices) {
    const matches = candidates.filter(
      (bonus) =>
        !selected.has(bonus.index) &&
        bonus.value === choices.value &&
        !choices.exclude?.includes(bonus.ability),
    );
    if (
      matches.length === choices.count &&
      new Set(matches.map(({ ability }) => ability)).size === choices.count
    )
      matches.forEach(({ index }) => selected.add(index));
  }
  return selected;
}

function validRacialChoices(race: RaceDef, choices: EditBuildPayload['racialChoices']): boolean {
  const selected = choices ?? [];
  return (
    selected.length === (race.abilityChoices?.count ?? 0) &&
    new Set(selected).size === selected.length &&
    selected.every((ability) => !race.abilityChoices?.exclude?.includes(ability))
  );
}

/** Numeric calculation results must remain usable by resource commands and controls. */
function safeCalculatedNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.every(safeCalculatedNumbers);
  if (value && typeof value === 'object')
    return Object.entries(value).every(
      ([key, part]) => key === 'def' || safeCalculatedNumbers(part),
    );
  return true;
}

/** Validates a staged edit and derives its proposed build without changing saved state. */
export function previewBuildEdit(ctx: CommandContext, input: EditBuildPayload) {
  const parsed = EditBuildPayloadSchema.safeParse(input);
  if (!parsed.success) return { checks: [block('Character edit details are invalid')] };
  const { changes, expected, racialChoices, expectedAbilityMethod } = parsed.data;
  const { build } = ctx;
  const checks: Check[] = [];
  if (expected.id !== build.id || expected.campaignId !== build.campaignId)
    return { checks: [block('This edit belongs to a different character')] };

  const fields = [
    'name',
    'portrait',
    'alignment',
    'raceId',
    'subraceId',
    'backgroundId',
    'proficiencies',
    'xp',
  ] as const;
  for (const field of fields) {
    if (changes[field] !== undefined && !same(build[field], expected[field]))
      checks.push(block(`Character ${field} changed since editing began. Reopen Edit mode.`));
  }
  if (changes.abilityBases !== undefined) {
    if (expectedAbilityMethod !== ctx.campaign.abilityMethod)
      checks.push(
        block('The campaign ability method changed or was not reviewed. Reopen Edit mode.'),
      );
    if (!same(build.abilityScores.base, expected.abilityScores.base))
      checks.push(block('Base ability scores changed since editing began. Reopen Edit mode.'));
    checks.push(...abilityBaseIssues(ctx.campaign.abilityMethod, changes.abilityBases).map(block));
  }
  const raceChanged =
    (changes.raceId !== undefined && changes.raceId !== build.raceId) ||
    (changes.subraceId !== undefined && (changes.subraceId ?? undefined) !== build.subraceId);
  const changeRacialBonuses = raceChanged || racialChoices !== undefined;
  if (
    changeRacialBonuses &&
    (!same(build.raceId, expected.raceId) ||
      !same(build.subraceId, expected.subraceId) ||
      !same(build.abilityScores.bonuses, expected.abilityScores.bonuses))
  )
    checks.push(block('Racial choices changed since editing began. Reopen Edit mode.'));
  if (changes.subclasses !== undefined && !same(build.classes, expected.classes))
    checks.push(block('Class choices changed since editing began. Reopen Edit mode.'));
  if (checks.length) return { checks };

  const next = CharacterBuildSchema.parse(build);
  if (changes.name !== undefined) next.name = changes.name;
  for (const field of ['portrait', 'alignment', 'subraceId', 'xp'] as const) {
    const value = changes[field];
    if (value === null) delete next[field];
    else if (value !== undefined) Object.assign(next, { [field]: value });
  }
  if (changes.raceId !== undefined) next.raceId = changes.raceId;
  if (changes.backgroundId !== undefined) next.backgroundId = changes.backgroundId;
  if (changes.proficiencies !== undefined) next.proficiencies = changes.proficiencies;
  if (changes.abilityBases !== undefined) next.abilityScores.base = changes.abilityBases;
  if (changes.xp !== undefined && ctx.campaign.leveling !== 'xp')
    checks.push(block('XP can only be edited in a campaign that uses XP leveling'));

  for (const [kind, id, previous] of [
    ['race', next.raceId, build.raceId],
    ['race', next.subraceId, build.subraceId],
    ['background', next.backgroundId, build.backgroundId],
  ] as const) {
    if (id !== undefined && id !== previous) checks.push(...referenceCheck(ctx, kind, id));
  }
  if (raceChanged && next.subraceId) {
    const subrace = ctx.registry.entries.get(next.subraceId);
    if (subrace?.kind !== 'race' || subrace.subraceOf !== next.raceId)
      checks.push(block('Choose a subrace belonging to the selected race, or clear the subrace'));
  }

  const subclassIds = new Set<string>();
  for (const choice of changes.subclasses ?? []) {
    if (subclassIds.has(choice.classId)) {
      checks.push(block(`Choose a subclass only once for ${choice.classId}`));
      continue;
    }
    subclassIds.add(choice.classId);
    const entries = next.classes.filter(({ classId }) => classId === choice.classId);
    if (entries.length !== 1) {
      checks.push(block(`Subclass editing needs one existing entry for ${choice.classId}`));
      continue;
    }
    const entry = entries[0]!;
    if (choice.subclassId === undefined || (choice.subclassId ?? undefined) === entry.subclassId)
      continue;
    if (choice.subclassId === null) {
      delete entry.subclassId;
      continue;
    }
    checks.push(...referenceCheck(ctx, 'subclass', choice.subclassId));
    const subclass = ctx.registry.entries.get(choice.subclassId);
    if (subclass?.kind !== 'subclass' || subclass.classId !== choice.classId)
      checks.push(block('The selected subclass does not belong to this class'));
    const classDef = ctx.registry.entries.get(choice.classId);
    if (classDef?.kind === 'class' && entry.level < classDef.subclassLevel)
      checks.push(
        warn(`${classDef.name} normally chooses a subclass at level ${classDef.subclassLevel}`),
      );
    entry.subclassId = choice.subclassId;
  }

  if (changes.proficiencies !== undefined) {
    for (const [kind, values] of Object.entries(next.proficiencies)) {
      if (
        !same(values, build.proficiencies[kind as keyof CharacterBuild['proficiencies']]) &&
        new Set(values).size !== values.length
      )
        checks.push(block(`Choose each ${kind} proficiency only once`));
    }
    if (
      !same(next.proficiencies.languages, build.proficiencies.languages) &&
      next.proficiencies.languages.some((language) => language.trim().length === 0)
    )
      checks.push(block('Language names cannot be blank'));
    const itemChoices = [
      ...next.proficiencies.tools.map((id) => ({
        id,
        kind: 'tool' as const,
        retained: build.proficiencies.tools.includes(id),
      })),
      ...next.proficiencies.weapons
        .filter((id) => id.startsWith('item.'))
        .map((id) => ({
          id,
          kind: 'weapon' as const,
          retained: build.proficiencies.weapons.includes(id),
        })),
      ...next.proficiencies.expertise
        .filter((id) => id.startsWith('item.'))
        .map((id) => ({
          id,
          kind: 'tool' as const,
          retained: build.proficiencies.expertise.includes(id),
        })),
    ];
    for (const { id, kind, retained } of itemChoices) {
      if (retained) continue;
      checks.push(...referenceCheck(ctx, 'item', id));
      const item = ctx.registry.entries.get(id);
      if (
        item?.kind !== 'item' ||
        (kind === 'weapon' ? !item.weapon : !['tool', 'instrument'].includes(item.category))
      )
        checks.push(block(`Choose a ${kind} reference for this proficiency`));
    }
    for (const id of next.proficiencies.expertise) {
      if (
        id.startsWith('item.') &&
        !next.proficiencies.tools.includes(id) &&
        (!build.proficiencies.expertise.includes(id) || build.proficiencies.tools.includes(id))
      )
        checks.push(block('Tool Expertise requires proficiency with that tool'));
    }
  }

  if (changeRacialBonuses) {
    const race = ctx.registry.entries.get(next.subraceId ?? next.raceId);
    if (race?.kind !== 'race') checks.push(block('The selected race is unavailable'));
    else if (!validRacialChoices(race, racialChoices))
      checks.push(
        block(
          `Choose ${race.abilityChoices?.count ?? 0} different eligible racial bonus abilities`,
        ),
      );
    else {
      const known = racialGrantIndexes(build, ctx.registry);
      const oldSources = new Set([build.raceId, build.subraceId]);
      const retainedLegacy = build.abilityScores.bonuses.some(
        (bonus, index) => oldSources.has(bonus.source) && !known.has(index),
      );
      next.abilityScores.bonuses = [
        ...next.abilityScores.bonuses.filter((_bonus, index) => !known.has(index)),
        ...race.abilityBonuses.map((bonus) => ({ source: race.id, ...bonus })),
        ...(racialChoices ?? []).map((ability) => ({
          source: race.id,
          ability,
          value: race.abilityChoices!.value,
        })),
      ];
      if (retainedLegacy)
        checks.push(info('Unrecognized racial bonus entries were retained. Review their sources.'));
    }
  }
  const validated = CharacterBuildSchema.safeParse(next);
  if (!validated.success)
    checks.push(block(validated.error.issues[0]?.message ?? 'Build choices are invalid'));
  if (checks.some(({ level }) => level === 'block')) return { checks };
  if (same(next, build)) return { checks: [block('No character changes to save')] };
  try {
    const sheet = computeSheet({ ...ctx, build: next }, ctx.registry);
    if (!safeCalculatedNumbers(sheet))
      return { checks: [block('These choices produce an unsafe calculated value')] };
    if (ctx.live.hp > sheet.maxHp.value)
      checks.push(
        info('Current HP exceeds the new maximum. Review HP; no current resources were changed.'),
      );
  } catch {
    return {
      checks: [block('These character choices could not be calculated. Review their references.')],
    };
  }
  if (raceChanged || next.backgroundId !== build.backgroundId)
    checks.push(
      info(
        'Review proficiencies and languages for the new race or background; existing choices were retained.',
      ),
    );
  return { checks, build: next };
}

/** Saves only selected build fields; all play state and unrelated build choices are preserved. */
export const editBuild: Command<EditBuildPayload> = {
  name: 'editBuild',
  check: (ctx, payload) => previewBuildEdit(ctx, payload).checks,
  apply: (draft, payload, ctx) => {
    const prepared = previewBuildEdit(ctx, payload);
    if (!prepared.build) throw new Error('Invalid character edit reached apply');
    const next = prepared.build;
    const changed = Object.keys(next).filter(
      (key) => !same(next[key as keyof CharacterBuild], ctx.build[key as keyof CharacterBuild]),
    );
    for (const key of Object.keys(ctx.build) as (keyof CharacterBuild)[]) {
      if (!Object.hasOwn(next, key)) delete draft.build[key];
    }
    // Assign only changed fields, so Undo patches never replace an entire character build.
    for (const key of changed)
      Object.assign(draft.build, { [key]: next[key as keyof CharacterBuild] });
    const labels = changed.map(
      (key) =>
        ({
          raceId: 'race',
          subraceId: 'subrace',
          backgroundId: 'background',
          classes: 'subclass',
          abilityScores:
            payload.changes.abilityBases === undefined ? 'racial bonuses' : 'ability scores',
        })[key] ?? key,
    );
    if (payload.changes.subraceId === null && ctx.build.subraceId) labels.push('subrace');
    if (payload.changes.alignment === null && ctx.build.alignment) labels.push('alignment');
    if (payload.changes.portrait === null && ctx.build.portrait) labels.push('portrait');
    if (payload.changes.xp === null && ctx.build.xp !== undefined) labels.push('XP');
    return withNotes(
      `Edit character: ${next.name} (${[...new Set(labels)].join(', ')})`,
      prepared.checks.filter(({ level }) => level === 'info').map(({ reason }) => reason),
    );
  },
};
