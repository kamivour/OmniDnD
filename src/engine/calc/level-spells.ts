import { z } from 'zod';
import type { CharacterBuild } from '../schema';
import { refId } from '../schema';
import { spellSelectionDetails, type SpellSelectionContext } from './spell-selections';

/** Spells picked while levelling: cantrips, known or prepared spells, and one swap for known casters. */
export const LevelSpellsSchema = z.strictObject({
  add: z.array(refId('spell')).optional(),
  swap: z.strictObject({ remove: refId('spell'), add: refId('spell') }).optional(),
});

export type LevelSpells = z.infer<typeof LevelSpellsSchema>;

/** PHB 2014: a Wizard copies two spells per level and starts with six in the spellbook. */
const WIZARD_LEVEL_SPELLS = 2;
const WIZARD_FIRST_SPELLS = 6;

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
    canSwapCantrip: classId === 'class.artificer' && !firstLevel,
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
  if (add.length === 0 && !picks.swap) return { build, summary };
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

  if (picks.swap) {
    const { remove, add: replacement } = picks.swap;
    const cantripSwap = gains.canSwapCantrip;
    if (!gains.canSwap && !cantripSwap)
      return { blocked: `${details.name} cannot swap a spell at this level` };
    const oldChoices = cantripSwap ? details.cantrips.ids : details.known.ids;
    const newChoices = cantripSwap ? details.candidates.cantrips : details.candidates.known;
    if (!oldChoices.includes(remove))
      return {
        blocked: cantripSwap
          ? 'Swap out an Artificer cantrip you know'
          : 'Swap out a leveled spell you know',
      };
    if (!cantripSwap && (level(replacement) ?? 0) === 0)
      return { blocked: 'Swap in a leveled spell' };
    if (!newChoices.includes(replacement) || known.has(replacement) || add.includes(replacement))
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
