import { sourceAllows } from './campaign-rules';
import { classSpellAllows } from './class-spell-lists';
import { entryCasting } from './casting';
import { grantedSpells } from './granted-spells';
import type { Registry } from '../registry';
import type { SpellDef } from '../schema';
import type { CharacterState, Sheet } from './sheet';
import { spellSlots } from './slots';
import { overridePath } from './value-overrides';

export type SpellSelectionContext = CharacterState & { sheet: Sheet; registry: Registry };
export type SpellSelectionMode = 'known' | 'prepared' | 'spellbook' | 'unsupported';

export interface SpellSelectionCount {
  ids: string[];
  count: number;
  /** Base class limit only; feature-specific exceptions remain manual. */
  limit?: number;
}

export interface SpellSelectionDetails {
  classId: string;
  name: string;
  mode: SpellSelectionMode;
  classLevel: number;
  maxSpellLevel: number;
  selection: { known: string[]; prepared: string[] };
  /** Subclass spells that are always ready and never counted (domain, oath, ...). */
  granted: { id: string; from: string }[];
  /** Slots from the overall known-spell cap reserved for a class feature. */
  reservedKnown?: number;
  cantrips: SpellSelectionCount;
  known: SpellSelectionCount;
  prepared: SpellSelectionCount;
  candidates: { cantrips: string[]; known: string[]; prepared: string[] };
  warnings: string[];
}

/**
 * Explicit 2014 policy; absent optional known-spell tables do not imply preparation.
 * https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes
 * https://www.dndbeyond.com/classes/3-druid
 * https://www.dndbeyond.com/classes/4-paladin
 */
export function isPreparedCaster2014(classId: string): boolean {
  return [
    'class.artificer',
    'class.cleric',
    'class.druid',
    'class.paladin',
    'class.wizard',
  ].includes(classId);
}

/** Class level part of the prepared-spell count: half for Paladin and Artificer (TCE rounds down), full for the rest. */
export function preparedLevelPart(classId: string, level: number): number {
  return classId === 'class.paladin' || classId === 'class.artificer'
    ? Math.floor(level / 2)
    : level;
}

function spell(ctx: SpellSelectionContext, id: string): SpellDef | undefined {
  const entry = ctx.registry.entries.get(id);
  return entry?.kind === 'spell' ? entry : undefined;
}

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

function onClassSpellList(ctx: SpellSelectionContext, classId: string) {
  const entry = ctx.build.classes.find((row) => row.classId === classId);
  const subclass = entry?.subclassId ? ctx.registry.entries.get(entry.subclassId) : undefined;
  const base = entry ? (entryCasting(ctx.registry, entry)?.spellList ?? classId) : classId;
  return (spell: SpellDef) =>
    classSpellAllows(ctx.campaign, base, spell) ||
    (subclass?.kind === 'subclass' &&
      (subclass.expandedSpellIds?.includes(spell.id) ||
        subclass.additionalSpellLists?.some((id) => classSpellAllows(ctx.campaign, id, spell))));
}

/** Retained selections are reported rather than repaired or silently removed. */
export function spellSelectionRuleWarnings(
  ctx: SpellSelectionContext,
  details: Omit<SpellSelectionDetails, 'warnings'>,
): string[] {
  const warnings: string[] = [];
  const { classId, name, mode, selection } = details;
  const onList = onClassSpellList(ctx, classId);
  const granted = new Set(details.granted.map(({ id }) => id));
  const classDef = ctx.registry.entries.get(classId);
  if (mode === 'unsupported') warnings.push(`${name} spell selection is not supported.`);
  if (classDef?.kind === 'class' && !sourceAllows(ctx.campaign, classDef))
    warnings.push(`${name}'s source is not enabled in this campaign.`);
  for (const list of ['known', 'prepared'] as const) {
    for (const id of selection[list]) {
      const def = spell(ctx, id);
      if (!def) {
        warnings.push(`Unknown spell reference: ${id}`);
        continue;
      }
      if (def.retired) {
        warnings.push(`${def.name} is unavailable under the 2014 rules.`);
        continue;
      }
      if (!sourceAllows(ctx.campaign, def) || def.ruleset !== ctx.campaign.ruleset)
        warnings.push(`${def.name}'s source is not enabled in this campaign.`);
      if (!onList(def) && !granted.has(id))
        warnings.push(`${def.name} is not on the ${name} spell list.`);
      if (mode !== 'unsupported' && def.level > details.maxSpellLevel)
        warnings.push(`${def.name} exceeds ${name}'s level ${details.maxSpellLevel} spell limit.`);
      if (list === 'known' && def.level > 0 && mode === 'prepared')
        warnings.push(`${name} normally prepares ${def.name} rather than learning it.`);
      if (list === 'prepared') {
        if (def.level === 0)
          warnings.push(`${def.name} is a cantrip; it is learned rather than prepared.`);
        else if (mode === 'known')
          warnings.push(`${name} normally learns ${def.name} rather than preparing it.`);
        else if (mode === 'spellbook' && !selection.known.includes(id))
          warnings.push(`${def.name} is prepared but is not in your ${name} spellbook.`);
      }
    }
  }
  return unique(warnings);
}

export function spellSelectionCountWarning(
  details: Pick<SpellSelectionDetails, 'name' | 'cantrips' | 'known' | 'prepared'>,
  list: 'cantrips' | 'known' | 'prepared',
): string | undefined {
  const { count, limit } = details[list];
  if (limit === undefined || count <= limit) return undefined;
  const label = { cantrips: 'cantrips', known: 'known spells', prepared: 'prepared spells' }[list];
  return `${details.name}: ${count}/${limit} ${label} exceeds the base class limit.`;
}

/**
 * Manage choices derive from the selected class alone, never combined multiclass slots.
 * https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options
 */
export function spellSelectionDetails(
  ctx: SpellSelectionContext,
  classId: string,
): SpellSelectionDetails {
  const classEntry = ctx.registry.entries.get(classId);
  const def = classEntry?.kind === 'class' ? classEntry : undefined;
  const classLevel = ctx.build.classes
    .filter((entry) => entry.classId === classId)
    .reduce((sum, entry) => sum + entry.level, 0);
  const casterEntry = ctx.build.classes.find((entry) => entry.classId === classId);
  const casting = casterEntry
    ? entryCasting(ctx.registry, { ...casterEntry, level: classLevel }, def)
    : undefined;
  const effective = ctx.sheet.spellcasting.find((entry) => entry.classId === classId);
  const mode: SpellSelectionMode =
    !casting || classLevel === 0
      ? 'unsupported'
      : classId === 'class.wizard'
        ? 'spellbook'
        : isPreparedCaster2014(classId)
          ? 'prepared'
          : casting.spellsKnown
            ? 'known'
            : 'unsupported';
  const ownSlots =
    casting && classLevel > 0
      ? spellSlots([{ progression: casting.progression, level: classLevel }])
      : undefined;
  const maxSpellLevel = ownSlots?.pact?.level ?? ownSlots?.max.findLastIndex((max) => max > 0) ?? 0;
  const maximum =
    mode === 'unsupported' ? 0 : (effective?.maxSpellLevel ?? Math.max(0, maxSpellLevel));
  const records = ctx.build.spells.filter((entry) => entry.classId === classId);
  const selection = {
    known: unique(records.flatMap((entry) => entry.known)),
    prepared: unique(records.flatMap((entry) => entry.prepared ?? [])),
  };
  const granted = grantedSpells(ctx.registry, ctx.build)
    .filter((entry) => entry.classId === classId)
    .map(({ spellId, from }) => ({ id: spellId, from }));
  const grantedIds = new Set(granted.map((entry) => entry.id));
  // A granted spell never uses up a pick, even if it was also chosen by hand.
  const counted = (id: string) => !grantedIds.has(id) && !spell(ctx, id)?.retired;
  const cantripIds = selection.known.filter((id) => spell(ctx, id)?.level === 0 && counted(id));
  const knownIds = selection.known.filter((id) => (spell(ctx, id)?.level ?? 0) > 0 && counted(id));
  const preparedCount = selection.prepared.filter(
    (id) => (spell(ctx, id)?.level ?? 0) > 0 && counted(id),
  ).length;
  const totalCantripLimit =
    mode === 'unsupported'
      ? undefined
      : (effective?.cantripsKnown ??
        casting?.cantripsKnown?.[classLevel - 1] ??
        (classId === 'class.paladin' || classId === 'class.ranger' ? 0 : undefined));
  // The Arcane Trickster table includes the required Mage Hand in its cantrip total.
  const cantripLimit =
    casterEntry?.subclassId === 'subclass.rogue.arcane-trickster' &&
    totalCantripLimit !== undefined &&
    grantedIds.has('spell.mage-hand')
      ? Math.max(0, totalCantripLimit - 1)
      : totalCantripLimit;
  const knownLimit =
    mode === 'known'
      ? (effective?.spellsKnown ?? casting?.spellsKnown?.[classLevel - 1])
      : undefined;
  const reservedKnown = ctx.sheet.features.reduce((sum, { def: feature }) => {
    const grant = feature.spells;
    if (!grant?.countsTowardKnown || grant.castingClassId !== classId) return sum;
    return sum + (grant.picks ?? []).reduce((picks, row) => picks + row.count, 0);
  }, 0);
  const preparedLimit =
    mode === 'prepared' || mode === 'spellbook'
      ? (ctx.sheet.values[overridePath('spellcasting', classId, 'preparedLimit')]?.stat.override
          ?.value ??
        (maximum === 0
          ? 0
          : Math.max(
              1,
              preparedLevelPart(classId, classLevel) + ctx.sheet.abilities[casting!.ability].mod,
            )))
      : undefined;
  const onList = onClassSpellList(ctx, classId);
  const eligible = [...ctx.registry.entries.values()]
    .filter(
      (entry): entry is SpellDef =>
        entry.kind === 'spell' &&
        entry.ruleset === ctx.campaign.ruleset &&
        sourceAllows(ctx.campaign, entry) &&
        Boolean(onList(entry)) &&
        !grantedIds.has(entry.id),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const leveled = eligible.filter((entry) => entry.level > 0 && entry.level <= maximum);
  const supported = mode !== 'unsupported';
  const details: Omit<SpellSelectionDetails, 'warnings'> = {
    classId,
    name: def?.name ?? classId,
    mode,
    classLevel,
    maxSpellLevel: maximum,
    selection,
    granted,
    ...(reservedKnown > 0 ? { reservedKnown } : {}),
    cantrips: {
      ids: cantripIds,
      count: cantripIds.length,
      ...(cantripLimit === undefined ? {} : { limit: cantripLimit }),
    },
    known: {
      ids: knownIds,
      count: knownIds.length,
      ...(knownLimit === undefined ? {} : { limit: Math.max(0, knownLimit - reservedKnown) }),
    },
    prepared: {
      ids: [...selection.prepared],
      count: preparedCount,
      ...(preparedLimit === undefined ? {} : { limit: preparedLimit }),
    },
    candidates: {
      cantrips:
        supported && cantripLimit !== 0
          ? eligible.filter((entry) => entry.level === 0).map((entry) => entry.id)
          : [],
      known: mode === 'known' || mode === 'spellbook' ? leveled.map((entry) => entry.id) : [],
      prepared:
        mode === 'prepared'
          ? leveled.map((entry) => entry.id)
          : mode === 'spellbook'
            ? leveled.filter((entry) => selection.known.includes(entry.id)).map((entry) => entry.id)
            : [],
    },
  };
  const warnings = spellSelectionRuleWarnings(ctx, details);
  for (const list of ['cantrips', 'known', 'prepared'] as const) {
    const warning = spellSelectionCountWarning(details, list);
    if (warning) warnings.push(warning);
  }
  return { ...details, warnings };
}
