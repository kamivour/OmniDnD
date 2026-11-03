import type { Draft } from 'immer';
import { computeSheet, type Sheet } from '../calc/sheet';
import type { Registry } from '../registry';
import {
  DAWN_SECONDS,
  DEATH_SAVES_NEEDED,
  INCAPACITATING_CONDITIONS,
  MAX_EXHAUSTION,
  SECONDS_PER_DAY,
  type Condition,
} from '../rules2014';
import type { ActiveEffect, Economy, LiveState, Recharge } from '../schema';
import type { CharacterData, Check, CommandContext } from './runner';

/** Helpers shared by the commands. They change a live-state draft and return log fragments. */

type Live = Draft<LiveState>;

export const freshEconomy = (): Economy => ({
  actionUsed: false,
  bonusUsed: false,
  reactionUsed: false,
  movementUsed: 0,
  objectInteractionUsed: false,
  bonusActionSpellCast: false,
  otherSpellCast: false,
});

export type EconomySlot = 'action' | 'bonus' | 'reaction' | 'object';

const USED_FLAG = {
  action: 'actionUsed',
  bonus: 'bonusUsed',
  reaction: 'reactionUsed',
  object: 'objectInteractionUsed',
} as const satisfies Record<EconomySlot, keyof Economy>;

export const ECONOMY_LABEL: Record<EconomySlot, string> = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  object: 'Object interaction',
};

export function incapacitatedBy(conditions: readonly Condition[]): Condition | undefined {
  return conditions.find((condition) => INCAPACITATING_CONDITIONS.includes(condition));
}

/**
 * Warnings for spending part of the turn economy. Outside combat the economy is not tracked.
 * A reaction may be used on other creatures' turns; an action or bonus action may not.
 */
export function economyChecks({ live, sheet }: CommandContext, slot: EconomySlot): Check[] {
  const checks: Check[] = [];
  const cause = slot === 'object' ? undefined : incapacitatedBy(sheet.conditions);
  if (cause)
    checks.push({ level: 'warn', reason: `Incapacitated (${cause}): no actions or reactions` });
  const combat = live.combat;
  if (!combat) return checks;
  if (slot !== 'reaction' && !combat.turnActive) {
    checks.push({ level: 'warn', reason: 'Not your turn' });
  }
  if (combat.economy[USED_FLAG[slot]]) {
    checks.push({ level: 'warn', reason: `${ECONOMY_LABEL[slot]} already used` });
  }
  return checks;
}

/** Marks part of the economy used (or available again). Outside combat it is not tracked. */
export function spendEconomy(live: Live, slot: EconomySlot, used = true) {
  if (live.combat) live.combat.economy[USED_FLAG[slot]] = used;
}

/** Removes matching effects and returns their names. Splices from the end to keep patches small. */
export function removeEffects(live: Live, matches: (effect: ActiveEffect) => boolean): string[] {
  const names: string[] = [];
  for (let index = live.effects.length - 1; index >= 0; index--) {
    const effect = live.effects[index];
    if (effect && matches(effect)) {
      names.unshift(effect.name);
      live.effects.splice(index, 1);
    }
  }
  return names;
}

/**
 * 2014 Invisibility ends for the target that attacks or casts, not for every invisible creature.
 * https://www.dndbeyond.com/spells/2159-invisibility
 * Only the local spell-created effects are known; possible upcast ally targets stay manual.
 */
export function endSelfInvisibility(live: Live, trigger: 'attack' | 'cast'): string[] {
  const ids = new Set(
    live.effects
      .filter((effect) => effect.sourceId === 'spell.invisibility')
      .map((effect) => effect.id),
  );
  if (ids.size === 0) return [];
  const linked = live.concentration?.effectId !== undefined && ids.has(live.concentration.effectId);
  removeEffects(live, (effect) => ids.has(effect.id));
  const notes = [`Invisibility on you ended (${trigger})`];
  if (linked && live.concentration) {
    if (live.concentration.spellId === 'spell.invisibility' && live.concentration.slotLevel === 2) {
      delete live.concentration;
      notes.push('concentration on Invisibility ended');
    } else {
      delete live.concentration.effectId;
      notes.push('concentration retained; other targets may still be affected');
    }
  }
  return notes;
}

/** Ends your concentration and every effect that depends on it. Returns the spell's name. */
export function dropConcentration(live: Live, registry: Registry): string | undefined {
  const concentration = live.concentration;
  if (!concentration) return undefined;
  const name = registry.get('spell', concentration.spellId).name;
  removeEffects(live, (effect) => effect.concentration);
  delete live.concentration;
  return name;
}

/** Incapacitated or dead ends concentration. Returns a log fragment when it ended. */
export function breakConcentrationIfIncapacitated(
  live: Live,
  registry: Registry,
): string | undefined {
  if (!live.concentration) return undefined;
  const cause = isDead(live)
    ? 'dead'
    : incapacitatedBy([...live.conditions, ...live.effects.flatMap((effect) => effect.conditions)]);
  if (!cause) return undefined;
  return `concentration on ${dropConcentration(live, registry)} ended (${cause})`;
}

export function isDead(live: Pick<LiveState, 'hp' | 'deathSaves' | 'exhaustion'>): boolean {
  return (
    (live.hp === 0 && live.deathSaves.fail >= DEATH_SAVES_NEEDED) ||
    live.exhaustion >= MAX_EXHAUSTION
  );
}

/**
 * Heals up to max HP; never lowers HP that is above max (exhaustion 4 halves max HP).
 * Regaining any HP from 0 resets death saves and wakes you.
 */
export function restoreHp(live: Live, amount: number, maxHp: number) {
  const before = live.hp;
  live.hp = Math.max(before, Math.min(maxHp, before + amount));
  if (before === 0 && live.hp > 0) {
    resetDeathSaves(live);
    removeCondition(live, 'unconscious');
  }
  return { before, after: live.hp };
}

export function resetDeathSaves(live: Live) {
  if (live.deathSaves.success !== 0 || live.deathSaves.fail !== 0) {
    live.deathSaves = { success: 0, fail: 0 };
  }
}

export function addCondition(live: Live, condition: Condition) {
  if (!live.conditions.includes(condition)) live.conditions.push(condition);
}

export function removeCondition(live: Live, condition: Condition) {
  const index = live.conditions.indexOf(condition);
  if (index >= 0) live.conditions.splice(index, 1);
}

/** Clears spent uses of features with one of these recharges. Returns the features' names. */
export function restoreFeatures(live: Live, sheet: Sheet, recharges: readonly Recharge[]) {
  const names: string[] = [];
  for (const { def, uses } of sheet.features) {
    if (!uses || !recharges.includes(uses.recharge)) continue;
    if ((live.featureUsesSpent[def.id] ?? 0) === 0) continue;
    delete live.featureUsesSpent[def.id];
    names.push(def.name);
  }
  return names;
}

/**
 * Moves the clock forward and ends what ran out: concentration, then timed effects (D46).
 * Passing 06:00 restores "at dawn" features. Returns log fragments.
 */
export function passTime(live: Live, seconds: number, { registry, sheet }: CommandContext) {
  const start = live.clock.seconds;
  const end = start + seconds;
  live.clock.seconds = end;
  const notes: string[] = [];
  const concentrationEnds = live.concentration?.endsAt;
  if (concentrationEnds !== undefined && concentrationEnds <= end) {
    notes.push(`${dropConcentration(live, registry)} ended`);
  }
  const expired = removeEffects(
    live,
    (effect) => effect.endsAt !== undefined && effect.endsAt <= end,
  );
  notes.push(...expired.map((name) => `${name} ended`));
  const dawn = (time: number) => Math.floor((time - DAWN_SECONDS) / SECONDS_PER_DAY);
  if (dawn(end) > dawn(start)) {
    const restored = restoreFeatures(live, sheet, ['dawn']);
    if (restored.length > 0) notes.push(`dawn restored ${restored.join(', ')}`);
  }
  return notes;
}

/** An effect id not used by any current effect: the base, else base-2, base-3, ... */
export function uniqueEffectId(live: Pick<LiveState, 'effects'>, base: string): string {
  const ids = new Set(live.effects.map((effect) => effect.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** "Took 12 damage", plus notes: "Took 12 damage; Invisibility ended". */
export function withNotes(text: string, notes: readonly (string | undefined)[]): string {
  const kept = notes.filter((note): note is string => note !== undefined && note !== '');
  return kept.length > 0 ? `${text}; ${kept.join('; ')}` : text;
}

export function block(reason: string): Check {
  return { level: 'block', reason };
}

export function warn(reason: string): Check {
  return { level: 'warn', reason };
}

export function info(reason: string): Check {
  return { level: 'info', reason };
}

/** Block unless the value is a whole number in range. */
export function rangeCheck(label: string, value: number, min: number, max: number): Check[] {
  return Number.isInteger(value) && value >= min && value <= max
    ? []
    : [block(`${label} must be a whole number from ${min} to ${max}`)];
}

/** Block unless the value is a whole number of at least `min`. */
export function minCheck(label: string, value: number, min: number): Check[] {
  return Number.isInteger(value) && value >= min
    ? []
    : [block(`${label} must be a whole number of at least ${min}`)];
}

export function notInCombat({ live }: CommandContext): Check[] {
  return live.combat ? [] : [block('Not in combat')];
}

export function deadCheck({ live }: CommandContext): Check[] {
  return isDead(live) ? [block('You are dead')] : [];
}

/** Max HP after a change to build or live state (exhaustion 4 halves it, a level raises it). */
export function maxHpAfter(ctx: CommandContext, change: Partial<CharacterData>): number {
  const { campaign, build, live, registry } = ctx;
  return computeSheet({ campaign, build, live, ...change }, registry).maxHp.value;
}

/** Number of faces of a die name: "d8" → 8. */
export function faces(die: string): number {
  return Number(die.slice(1));
}

/** Lowest and highest total of dice like "2d4". */
export function diceRange(dice: string): { min: number; max: number } {
  const [count = 0, size = 0] = dice.split('d').map(Number);
  return { min: count, max: count * size };
}

/** "Bardic Inspiration 3/5 left". */
export function usesLeft(name: string, spent: number, max: number): string {
  return `${name} ${max - spent}/${max} left`;
}

export function featureName({ registry }: Pick<CommandContext, 'registry'>, id: string): string {
  return registry.entries.get(id)?.name ?? id;
}
