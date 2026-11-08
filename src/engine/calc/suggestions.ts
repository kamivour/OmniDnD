import type { Guidance } from '../schema/guidance';
import { SKILL_ABILITY, type Skill } from '../rules2014';
import { ABILITIES, type Ability } from './abilities';
import { STANDARD_ARRAY } from './ability-methods';

/**
 * Suggestions for new players, built from guidance entries. They only describe what might suit
 * the build; callers show them as tags or a button and never apply them without the player.
 */

/** Order for abilities a class does not name: toughness first, then reflexes, wisdom, charm. */
const FILL_ORDER: readonly Ability[] = ['CON', 'DEX', 'WIS', 'CHA', 'INT', 'STR'];

/**
 * A base-score spread for the standard array or point buy (15, 14, 13, 12, 10, 8 costs exactly
 * 27 points too). Main abilities get the highest scores; the rest follow `FILL_ORDER`.
 */
export function suggestAbilityBases(mainAbilities: readonly Ability[]): Record<Ability, number> {
  const order = [...new Set([...mainAbilities, ...FILL_ORDER])];
  const bases = {} as Record<Ability, number>;
  order.forEach((ability, index) => {
    bases[ability] = STANDARD_ARRAY[index]!;
  });
  return Object.fromEntries(ABILITIES.map((ability) => [ability, bases[ability]!])) as Record<
    Ability,
    number
  >;
}

/** One-line reasons for skills that suit the class: its own picks first, then main-ability skills. */
export function skillSuggestions(
  skills: readonly Skill[],
  guidance: Pick<Guidance, 'skills' | 'mainAbilities'> | undefined,
): Partial<Record<Skill, string>> {
  const tags: Partial<Record<Skill, string>> = {};
  if (!guidance) return tags;
  for (const skill of skills) {
    if (guidance.skills?.includes(skill)) tags[skill] = 'Often taken by this class';
    else if (guidance.mainAbilities?.includes(SKILL_ABILITY[skill]))
      tags[skill] = `Uses ${SKILL_ABILITY[skill]}, a main ability`;
  }
  return tags;
}

/** Suggested starter spells that are on the offered list, with the reason for each. */
export function spellSuggestions(
  guidance: Pick<Guidance, 'starterSpells'> | undefined,
  offered: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { id, why } of guidance?.starterSpells ?? [])
    if (offered.includes(id)) result[id] = why;
  return result;
}

export interface SynergyNote {
  /** The entry that carries the note, and the chosen entry it pairs with. */
  from: string;
  with: string;
  why: string;
}

/** Notes for pairings among the entries chosen so far (race, class, subclass, background). */
export function synergyNotes(
  chosen: readonly (Guidance | undefined)[],
  chosenIds: readonly string[],
): SynergyNote[] {
  const notes: SynergyNote[] = [];
  const seen = new Set<string>();
  for (const entry of chosen) {
    for (const link of entry?.goodWith ?? []) {
      const key = [entry!.id, link.id].sort().join('|');
      if (!chosenIds.includes(link.id) || seen.has(key)) continue;
      seen.add(key);
      notes.push({ from: entry!.id, with: link.id, why: link.why });
    }
  }
  return notes;
}
