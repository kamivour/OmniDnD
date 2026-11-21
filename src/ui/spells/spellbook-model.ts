import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import { featSpellSources } from '../../engine/calc/feat-spells';
import { grantedSpells, spellListsWithGrants } from '../../engine/calc/granted-spells';
import { featFreeLeft } from '../../engine/commands/spell-options';
import { spellSelectionDetails, type SpellSelectionMode } from '../../engine/calc/spell-selections';
import type { Registry } from '../../engine/registry';
import type { FreeCast, SpellDef } from '../../engine/schema';
import type { Cost, SpellView } from '../fixtures/the-fool';

export interface SpellbookEntry {
  spell: SpellView;
  classId: string;
  /** Subclass that keeps this spell always ready (domain, oath, ...). */
  alwaysFrom?: string;
  dc?: number;
  attack?: number;
  /** Learned from a feat or racial trait; `classId` then holds that feature's id. */
  feat?: SpellbookFeat;
}

export interface SpellbookFeat {
  name: string;
  /** Class list the feat drew from (Magic Initiate), for focus rules. */
  classId?: string;
  free?: FreeCast;
  /** Free castings left before the next rest; Infinity at will. */
  freeLeft: number;
  /** Spell level of the free casting, when it is higher than the spell's own. */
  castLevel?: number;
  /** The feat or trait also allows casting the spell with your spell slots. */
  slots: boolean;
}

export interface SpellbookClass {
  classId: string;
  name: string;
  dc: number;
  attack: number;
  cantrips: number;
  cantripLimit?: number;
  known: number;
  knownLimit?: number;
  mode: SpellSelectionMode;
  prepared: number;
  preparedLimit?: number;
}

export interface SpellbookModel {
  entries: SpellbookEntry[];
  slots: { level: number; max: number; used: number }[];
  levels: number[];
  classes: SpellbookClass[];
  /** Imported spell associations without engine-derived casting stats. */
  unsupportedClassIds: string[];
}

const BASIC_RULES_2014 = 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014';

/** Display adapter only. The engine supplies casting stats, limits and slot maximums. */
export function spellbookModel(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): SpellbookModel {
  const classes: SpellbookClass[] = sheet.spellcasting.map((casting) => {
    const selection = spellSelectionDetails({ ...state, sheet, registry }, casting.classId);
    return {
      classId: casting.classId,
      name: registry.get('class', casting.classId).name,
      dc: casting.saveDc.value,
      attack: casting.attack.value,
      cantrips: selection.cantrips.count,
      ...(selection.cantrips.limit === undefined ? {} : { cantripLimit: selection.cantrips.limit }),
      known: selection.known.count,
      ...(selection.known.limit === undefined ? {} : { knownLimit: selection.known.limit }),
      mode: selection.mode,
      prepared: selection.prepared.count,
      ...(selection.prepared.limit === undefined
        ? {}
        : { preparedLimit: selection.prepared.limit }),
    };
  });
  const byClass = new Map(classes.map((casting) => [casting.classId, casting]));
  const selected = new Set<string>();
  const entries: SpellbookEntry[] = [];
  const unsupportedClassIds = new Set<string>();

  const granted = new Map(
    grantedSpells(registry, state.build).map((entry) => [
      `${entry.classId}:${entry.spellId}`,
      entry.from,
    ]),
  );
  for (const selection of spellListsWithGrants(registry, state.build)) {
    const casting = byClass.get(selection.classId);
    const derived = sheet.spellcasting.find((entry) => entry.classId === selection.classId);
    if (!casting && (selection.known.length > 0 || (selection.prepared?.length ?? 0) > 0))
      unsupportedClassIds.add(selection.classId);
    for (const id of [...selection.known, ...(selection.prepared ?? [])]) {
      const key = `${selection.classId}:${id}`;
      if (selected.has(key)) continue;
      selected.add(key);
      const def = registry.get('spell', id);
      const spell: SpellView = {
        ...spellView(def, state.build.spellTags?.[id]),
        ...(derived?.saveDc.override ? { dcOverride: derived.saveDc.override } : {}),
        ...(derived?.attack.override ? { attackOverride: derived.attack.override } : {}),
      };
      const from = granted.get(key);
      entries.push({
        spell,
        classId: selection.classId,
        ...(from ? { alwaysFrom: from } : {}),
        ...(casting ? { dc: casting.dc, attack: casting.attack } : {}),
      });
    }
  }

  for (const source of featSpellSources({ registry, build: state.build, sheet })) {
    if (source.grant.castingClassId) continue;
    for (const feat of source.spells) {
      const def = registry.get('spell', feat.spellId);
      entries.push({
        spell: spellView(def, state.build.spellTags?.[def.id]),
        classId: source.featureId,
        ...(source.dc === undefined ? {} : { dc: source.dc, attack: source.attack! }),
        feat: {
          name: source.name,
          ...(source.classId ? { classId: source.classId } : {}),
          ...(feat.free ? { free: feat.free } : {}),
          freeLeft: featFreeLeft(state.live, source.featureId, feat),
          ...(feat.castLevel ? { castLevel: feat.castLevel } : {}),
          slots: source.grant.slots,
        },
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.spell.level - b.spell.level ||
      a.spell.name.localeCompare(b.spell.name) ||
      a.classId.localeCompare(b.classId),
  );
  const slots = sheet.slots.max.flatMap((max, level) =>
    level > 0 && max > 0 ? [{ level, max, used: state.live.slotsUsed[level] ?? 0 }] : [],
  );
  const levels = [
    ...new Set([...entries.map(({ spell }) => spell.level), ...slots.map((s) => s.level)]),
  ].sort((a, b) => a - b);
  return { entries, slots, levels, classes, unsupportedClassIds: [...unsupportedClassIds].sort() };
}

/** Card view of one spell definition, without character-specific casting stats. */
export function spellView(def: SpellDef, tagOverride?: readonly SpellView['type'][]): SpellView {
  const tags = [...(tagOverride ?? def.tags)];
  if (tags.length === 0) tags.push('utility');
  return {
    id: def.id,
    name: def.name,
    level: def.level,
    school: def.school[0]!.toUpperCase() + def.school.slice(1),
    cost: castingCost(def),
    range: def.range,
    ...(def.save === undefined ? {} : { save: def.save }),
    ...(def.attack === undefined ? {} : { attack: def.attack }),
    duration: def.duration.text,
    concentration: def.duration.concentration,
    ritual: def.ritual,
    components: components(def),
    source: def.source,
    lines: spellLines(def),
    // Imported SRD entries may not have an individual link. Keep the fallback in 2014.
    url: def.url ?? BASIC_RULES_2014,
    type: tags[0]!,
    tags,
  };
}

function castingCost({ casting }: SpellDef): Cost {
  switch (casting.cost) {
    case 'action':
      return 'A';
    case 'bonus':
      return 'BA';
    case 'reaction':
      return 'R';
    case 'minutes':
      return `${casting.amount!} min`;
    case 'hours':
      return `${casting.amount!} h`;
  }
}

function components({ components: value }: SpellDef): string {
  return [
    value.v && 'V',
    value.s && 'S',
    value.m !== undefined && (value.m ? `M (${value.m})` : 'M'),
  ]
    .filter(Boolean)
    .join(', ');
}

function spellLines({ summary, fullText }: SpellDef): string[] {
  if (!summary) return fullText?.split(/\n\s*\n/).filter(Boolean) ?? [];
  const lines = [summary.effect];
  for (const [key, label] of [
    ['fail', 'Fail'],
    ['success', 'Success'],
    ['hit', 'Hit'],
    ['upcast', 'Upcast'],
    ['scaling', 'Scaling'],
  ] as const) {
    if (summary[key]) lines.push(`${label}: ${summary[key]}`);
  }
  return lines;
}

/** Label for where a row's spell comes from: the feat or trait, or the class when there are several. */
export function castingLabel(
  entry: Pick<SpellbookEntry, 'classId' | 'feat'>,
  model: Pick<SpellbookModel, 'classes' | 'unsupportedClassIds'>,
  registry: Registry,
): string | undefined {
  if (entry.feat) return entry.feat.name;
  return model.classes.length + model.unsupportedClassIds.length > 1
    ? (registry.entries.get(entry.classId)?.name ?? entry.classId)
    : undefined;
}

/** No way to cast a leveled spell right now: no slot (or ritual) and no free casting left. */
export function spellUnavailable(
  entry: Pick<SpellbookEntry, 'spell' | 'feat'>,
  slots: SpellbookModel['slots'],
  ritualAvailable = false,
): boolean {
  const { spell, feat } = entry;
  if (spell.level === 0) return false;
  const slotLeft = slots.some((slot) => slot.level >= spell.level && slot.used < slot.max);
  if (feat) return feat.freeLeft <= 0 && !(feat.slots && slotLeft) && !ritualAvailable;
  return !slotLeft && !ritualAvailable;
}
