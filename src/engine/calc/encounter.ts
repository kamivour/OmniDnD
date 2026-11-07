import type { Combatant, Encounter } from '../schema';

/**
 * Turn order: highest initiative first; a tie goes to the higher bonus, then to whoever was added
 * first. The DM may rule a tie differently, so the player can edit any number. Companions that act
 * with their owner sit straight after you. Combatants without an initiative are not in the order.
 */
export function turnOrder(encounter: Pick<Encounter, 'combatants'>): Combatant[] {
  const rolled = encounter.combatants.filter((entry) => entry.initiative !== undefined);
  const independent = rolled
    .filter((entry) => !(entry.side === 'companion' && entry.withOwner))
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        b.entry.initiative! - a.entry.initiative! ||
        b.entry.initiativeBonus - a.entry.initiativeBonus ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
  const followers = rolled.filter((entry) => entry.side === 'companion' && entry.withOwner);
  const you = independent.findIndex((entry) => entry.side === 'you');
  if (you === -1) return [...independent, ...followers];
  return [...independent.slice(0, you + 1), ...followers, ...independent.slice(you + 1)];
}

/** Who goes after the current combatant, skipping defeated ones, and whether that starts a new round. */
export function nextInOrder(
  encounter: Pick<Encounter, 'combatants' | 'currentId'>,
): { next: Combatant; newRound: boolean } | undefined {
  const order = turnOrder(encounter);
  const start = order.findIndex((entry) => entry.id === encounter.currentId);
  for (let step = 1; step <= order.length; step += 1) {
    const at = (start + step) % order.length;
    const entry = order[at]!;
    if (!entry.defeated) return { next: entry, newRound: start === -1 ? false : at <= start };
  }
  return undefined;
}

/** Splits "Goblin 3" into its base and number; a plain name has no number. */
function parts(name: string): { base: string; number?: number } {
  const match = /^(.*\S) (\d+)$/.exec(name);
  return match ? { base: match[1]!, number: Number(match[2]) } : { base: name };
}

/**
 * Names for `count` new combatants called `base`. Several of one kind are numbered; adding to a
 * lone "Goblin" renames it "Goblin 1" so the group reads Goblin 1, Goblin 2 ...
 */
export function groupNames(
  existing: readonly string[],
  base: string,
  count: number,
): { names: string[]; renames: Record<string, string> } {
  const same = existing.filter((name) => parts(name).base === base);
  const renames: Record<string, string> = {};
  let top = Math.max(0, ...same.map((name) => parts(name).number ?? 0));
  const lone = same.find((name) => parts(name).number === undefined);
  if (lone) {
    top = Math.max(top, 1);
    renames[lone] = `${base} 1`;
  }
  const numbered = count > 1 || same.length > 0;
  const names = Array.from({ length: count }, (_, index) =>
    numbered ? `${base} ${top + index + 1}` : base,
  );
  return { names, renames };
}
