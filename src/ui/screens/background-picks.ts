import { toolSlots } from '../../engine/calc/background-choices';
import type { Skill } from '../../engine/rules2014';
import type { BackgroundDef } from '../../engine/schema';

/** What the player picked from a background's open choices; unfilled slots are ''. */
export interface BackgroundPicks {
  skills: string[];
  languages: string[];
  tools: string[];
}

export const emptyBackgroundPicks = (): BackgroundPicks => ({
  skills: [],
  languages: [],
  tools: [],
});

/** How many open slots a background has in total. */
export function openSlots(background: BackgroundDef | undefined): number {
  if (!background) return 0;
  return (
    (background.skillChoices ?? 0) +
    (background.languageChoices ?? 0) +
    toolSlots(background).length
  );
}

/** Picks for createCharacter: a group is sent only when every slot is filled. */
export function picksPayload(background: BackgroundDef | undefined, picks: BackgroundPicks) {
  if (!background) return undefined;
  const full = (values: string[], count: number) =>
    count > 0 && values.length === count && values.every((v) => v !== '');
  const out: { skills?: Skill[]; languages?: string[]; tools?: string[] } = {};
  if (full(picks.skills, background.skillChoices ?? 0)) out.skills = picks.skills as Skill[];
  if (full(picks.languages, background.languageChoices ?? 0)) out.languages = picks.languages;
  if (full(picks.tools, toolSlots(background).length)) out.tools = picks.tools;
  return Object.keys(out).length > 0 ? out : undefined;
}
