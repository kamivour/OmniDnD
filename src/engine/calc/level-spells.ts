import { z } from 'zod';
import type { CharacterBuild } from '../schema';
import { refId } from '../schema';
import { asiLevels } from './level-choices';
import { sourceAllows } from './campaign-rules';
import { spellSelectionDetails, type SpellSelectionContext } from './spell-selections';

/** Spells picked while levelling: cantrips, known or prepared spells, and one swap for known casters. */
export const LevelSpellsSchema = z.strictObject({
  add: z.array(refId('spell')).optional(),
  swap: z.strictObject({ remove: refId('spell'), add: refId('spell') }).optional(),
  cantripSwap: z.strictObject({ remove: refId('spell'), add: refId('spell') }).optional(),
});

export type LevelSpells = z.infer<typeof LevelSpellsSchema>;

/** PHB 2014: a Wizard copies two spells per level and starts with six in the spellbook. */
const WIZARD_LEVEL_SPELLS = 2;
const WIZARD_FIRST_SPELLS = 6;

const CANTRIP_VERSATILITY: Record<string, string> = {
  'class.bard': 'feature.tce.bard-bardic-versatility',
  'class.cleric': 'feature.tce.cleric-cantrip-versatility',
  'class.druid': 'feature.tce.druid-cantrip-versatility',
  'class.sorcerer': 'feature.tce.sorcerer-sorcerous-versatility',
  'class.warlock': 'feature.tce.warlock-eldritch-versatility',
};

function bardSecrets(ctx: SpellSelectionContext, classId: string) {
  if (classId !== 'class.bard') return [];
  return ctx.sheet.features.flatMap(({ def }) =>
    def.id === 'feature.bard.additional-magical-secrets' ||
    def.id.startsWith('feature.bard.magical-secrets')
      ? (ctx.build.featSpells?.[def.id]?.spellIds ?? []).map((id) => ({ id, featureId: def.id }))
      : [],
  );
}

export function swappableLevelSpells(
  ctx: SpellSelectionContext,
  details: ReturnType<typeof spellSelectionDetails>,
): string[] {
  return [
    ...details.known.ids,
    ...bardSecrets(ctx, details.classId).flatMap(({ id }) => {
      const spell = ctx.registry.entries.get(id);
      return spell?.kind === 'spell' && !spell.retired && spell.level > 0 ? [id] : [];
    }),
  ];
}

export interface LevelSpellGains {
  mode: 'known' | 'prepared' | 'spellbook' | 'unsupported';
  cantrips: number;
  /** Leveled spells to learn, copy into a spellbook, or prepare. */
  spells: number;
  /** Known casters may swap one leveled spell for another. */
  canSwap: boolean;
  canSwapCantrip: boolean;
}

/** `ctx` already holds the character at its new level in `classId`; `firstLevel` is true when the class is new. */
export function levelSpellGains(
  ctx: SpellSelectionContext,
  classId: string,
  firstLevel: boolean,
): LevelSpellGains {
  const details = spellSelectionDetails(ctx, classId);
  if (details.mode === 'unsupported')
    return { mode: 'unsupported', cantrips: 0, spells: 0, canSwap: false, canSwapCantrip: false };
  const room = (list: { count: number; limit?: number }) =>
    list.limit === undefined ? 0 : Math.max(0, list.limit - list.count);
  return {
    mode: details.mode,
    cantrips: room(details.cantrips),
    spells:
      details.mode === 'known'
        ? room(details.known)
        : details.mode === 'spellbook'
          ? firstLevel
            ? WIZARD_FIRST_SPELLS
            : WIZARD_LEVEL_SPELLS
          : room(details.prepared),
    canSwap: details.mode === 'known' && !firstLevel,
    canSwapCantrip:
      !firstLevel &&
      (classId === 'class.artificer' ||
        (asiLevels(classId).includes(details.classLevel) &&
          ctx.sheet.features.some(
            ({ def }) => def.id === CANTRIP_VERSATILITY[classId] && sourceAllows(ctx.campaign, def),
          ))),
  };
}

export type SpellResult = { blocked: string } | { build: CharacterBuild; summary: string[] };

/** Records optional spell picks within the class's available limits. */
export function applyLevelSpells(
  ctx: SpellSelectionContext,
  classId: string,
  firstLevel: boolean,
  picks: LevelSpells,
): SpellResult {
  const build = structuredClone(ctx.build);
  const summary: string[] = [];
  const add = picks.add ?? [];
  if (add.length === 0 && !picks.swap && !picks.cantripSwap) return { build, summary };
  const details = spellSelectionDetails(ctx, classId);
  const gains = levelSpellGains(ctx, classId, firstLevel);
  if (gains.mode === 'unsupported')
    return { blocked: `${details.name} has no spell selection to change here` };
  const nameOf = (id: string) => ctx.registry.entries.get(id)?.name ?? id;
  const level = (id: string) => {
    const entry = ctx.registry.entries.get(id);
    return entry?.kind === 'spell' ? entry.level : undefined;
  };

  const prepares = gains.mode === 'prepared';
  const known = new Set(details.selection.known);
  const prepared = new Set(details.selection.prepared);
  const leveledCandidates = prepares ? details.candidates.prepared : details.candidates.known;
  if (new Set(add).size !== add.length) return { blocked: 'The same spell is picked twice' };
  let cantrips = 0;
  let spells = 0;
  for (const id of add) {
    const spellLevel = level(id);
    if (spellLevel === undefined) return { blocked: `Unknown spell ${id}` };
    const prepare = prepares && spellLevel > 0;
    if ((prepare ? prepared : known).has(id))
      return { blocked: `${nameOf(id)} is already ${prepare ? 'prepared' : 'known'}` };
    const allowed = spellLevel === 0 ? details.candidates.cantrips : leveledCandidates;
    if (!allowed.includes(id))
      return { blocked: `${nameOf(id)} is not available to ${details.name} at this level` };
    if (spellLevel === 0) cantrips++;
    else spells++;
  }
  if (cantrips > gains.cantrips)
    return { blocked: `${details.name} learns ${gains.cantrips} more cantrip(s) at this level` };
  if (spells > gains.spells)
    return {
      blocked: prepares
        ? `${details.name} can prepare ${gains.spells} more spell(s)`
        : `${details.name} learns ${gains.spells} more spell(s) at this level`,
    };

  // Earlier Artificer callers used the single swap field for cantrips.
  const cantripSwap = picks.cantripSwap ?? (classId === 'class.artificer' ? picks.swap : undefined);
  const spellSwap = classId === 'class.artificer' ? undefined : picks.swap;
  if (classId === 'class.artificer' && picks.cantripSwap && picks.swap)
    return { blocked: 'Choose only one cantrip replacement' };
  if (spellSwap) {
    const { remove, add: replacement } = spellSwap;
    if (!gains.canSwap) return { blocked: `${details.name} cannot swap a spell at this level` };
    if (!swappableLevelSpells(ctx, details).includes(remove))
      return { blocked: 'Swap out a leveled spell you know' };
    if ((level(replacement) ?? 0) === 0) return { blocked: 'Swap in a leveled spell' };
    if (
      !details.candidates.known.includes(replacement) ||
      known.has(replacement) ||
      add.includes(replacement)
    )
      return { blocked: `${nameOf(replacement)} is not available to swap in` };
    const secret = bardSecrets(ctx, classId).find(({ id }) => id === remove);
    known.delete(remove);
    if (secret) {
      const source = build.featSpells?.[secret.featureId];
      if (source) source.spellIds = source.spellIds.map((id) => (id === remove ? replacement : id));
    } else known.add(replacement);
    summary.push(`Swap ${nameOf(remove)} for ${nameOf(replacement)}`);
  }
  if (cantripSwap) {
    const { remove, add: replacement } = cantripSwap;
    if (!gains.canSwapCantrip)
      return { blocked: `${details.name} cannot swap a cantrip at this level` };
    if (!details.cantrips.ids.includes(remove))
      return { blocked: 'Swap out a class cantrip you know' };
    if (
      !details.candidates.cantrips.includes(replacement) ||
      known.has(replacement) ||
      add.includes(replacement)
    )
      return { blocked: `${nameOf(replacement)} is not available to swap in` };
    known.delete(remove);
    known.add(replacement);
    summary.push(`Swap ${nameOf(remove)} for ${nameOf(replacement)}`);
  }
  for (const id of add) {
    if (prepares && level(id)! > 0) {
      prepared.add(id);
      summary.push(`Prepare ${nameOf(id)}`);
    } else {
      known.add(id);
      summary.push(`Learn ${nameOf(id)}`);
    }
  }

  const record = build.spells.find((row) => row.classId === classId);
  const next = {
    classId,
    known: [...known],
    ...(prepares && spells > 0 ? { prepared: [...prepared] } : {}),
  };
  if (record) Object.assign(record, next);
  else build.spells.push(next);
  return { build, summary };
}
