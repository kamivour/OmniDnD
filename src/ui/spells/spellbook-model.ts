import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import { spellSelectionDetails, type SpellSelectionMode } from '../../engine/calc/spell-selections';
import type { Registry } from '../../engine/registry';
import type { SpellDef } from '../../engine/schema';
import type { Cost, SpellView } from '../fixtures/the-fool';

export interface SpellbookEntry {
  spell: SpellView;
  classId: string;
  dc?: number;
  attack?: number;
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

  for (const selection of state.build.spells) {
    const casting = byClass.get(selection.classId);
    const derived = sheet.spellcasting.find((entry) => entry.classId === selection.classId);
    if (!casting && (selection.known.length > 0 || (selection.prepared?.length ?? 0) > 0))
      unsupportedClassIds.add(selection.classId);
    for (const id of [...selection.known, ...(selection.prepared ?? [])]) {
      const key = `${selection.classId}:${id}`;
      if (selected.has(key)) continue;
      selected.add(key);
      const def = registry.get('spell', id);
      const tags = [...(state.build.spellTags?.[id] ?? def.tags)];
      if (tags.length === 0) tags.push('utility');
      const spell: SpellView = {
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
        ...(derived?.saveDc.override ? { dcOverride: derived.saveDc.override } : {}),
        ...(derived?.attack.override ? { attackOverride: derived.attack.override } : {}),
      };
      entries.push({
        spell,
        classId: selection.classId,
        ...(casting ? { dc: casting.dc, attack: casting.attack } : {}),
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
