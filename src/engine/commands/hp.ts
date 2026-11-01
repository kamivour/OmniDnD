import { DEATH_SAVES_NEEDED } from '../rules2014';
import type { Check, Command } from './runner';
import {
  addCondition,
  breakConcentrationIfIncapacitated,
  deadCheck,
  info,
  isDead,
  minCheck,
  rangeCheck,
  block,
  removeCondition,
  resetDeathSaves,
  restoreHp,
  warn,
  withNotes,
} from './shared';

export interface ApplyDamagePayload {
  amount: number;
  /** A critical hit while you are at 0 HP counts as two death save failures. */
  critical?: boolean;
}

/** PHB 2014: the concentration save DC is 10 or half the damage, whichever is higher. */
export function concentrationSaveDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

/**
 * Temp HP absorb damage first. Damage that drops you to 0 HP knocks you unconscious, or kills
 * you outright when the rest equals your max HP. Damage at 0 HP adds death save failures.
 * The concentration save itself is the player's roll: the app shows the DC (Info).
 */
export const applyDamage: Command<ApplyDamagePayload> = {
  name: 'applyDamage',
  check: (ctx, { amount }) => {
    const checks: Check[] = [...deadCheck(ctx), ...minCheck('Damage', amount, 1)];
    const { live } = ctx;
    const toHp = Math.max(0, amount - live.tempHp);
    if (live.concentration && live.hp - toHp > 0) {
      const spell = ctx.registry.get('spell', live.concentration.spellId);
      checks.push(info(`Concentration save DC ${concentrationSaveDc(amount)} (${spell.name})`));
    }
    return checks;
  },
  apply: ({ live }, { amount, critical = false }, ctx) => {
    const maxHp = ctx.sheet.maxHp.value;
    const notes: (string | undefined)[] = [];
    const absorbed = Math.min(live.tempHp, amount);
    live.tempHp -= absorbed;
    if (absorbed > 0) notes.push(`temp HP absorbed ${absorbed}`);
    const rest = amount - absorbed;
    const before = live.hp;

    if (before > 0) {
      if (rest >= before) {
        live.hp = 0;
        if (rest - before >= maxHp) {
          live.deathSaves = { success: 0, fail: DEATH_SAVES_NEEDED };
          notes.push('instant death (massive damage)');
        } else {
          addCondition(live, 'unconscious');
          notes.push('down at 0 HP, unconscious');
        }
      } else {
        live.hp = before - rest;
      }
    } else if (rest >= maxHp) {
      live.deathSaves = { success: 0, fail: DEATH_SAVES_NEEDED };
      notes.push('instant death (massive damage)');
    } else if (rest > 0) {
      // Damage ends stability: the death save count starts over.
      if (live.deathSaves.success >= DEATH_SAVES_NEEDED) resetDeathSaves(live);
      const failures = critical ? 2 : 1;
      live.deathSaves.fail = Math.min(DEATH_SAVES_NEEDED, live.deathSaves.fail + failures);
      notes.push(`${failures} death save ${failures === 1 ? 'failure' : 'failures'}`);
      if (isDead(live)) notes.push('dead');
    }
    notes.push(breakConcentrationIfIncapacitated(live, ctx.registry));

    const kind = critical ? 'critical damage' : 'damage';
    return withNotes(`Took ${amount} ${kind} (HP ${before} → ${live.hp})`, notes);
  },
};

export interface AmountPayload {
  amount: number;
}

export const heal: Command<AmountPayload> = {
  name: 'heal',
  check: (ctx, { amount }) => [...deadCheck(ctx), ...minCheck('Healing', amount, 1)],
  apply: ({ live }, { amount }, ctx) => {
    const { before, after } = restoreHp(live, amount, ctx.sheet.maxHp.value);
    return withNotes(`Healed ${amount} (HP ${before} → ${after})`, [
      before === 0 && after > 0 ? 'conscious again' : undefined,
    ]);
  },
};

/** Temp HP never stack: a new amount replaces the old one, so a smaller amount asks first. */
export const setTempHp: Command<AmountPayload> = {
  name: 'setTempHp',
  check: ({ live }, { amount }) => {
    const checks = minCheck('Temp HP', amount, 0);
    if (amount > 0 && amount < live.tempHp) {
      checks.push(warn(`Temp HP don't stack: you have ${live.tempHp}`));
    }
    return checks;
  },
  apply: ({ live }, { amount }) => {
    const before = live.tempHp;
    live.tempHp = amount;
    return amount === 0 ? 'Temp HP cleared' : `Temp HP ${before} → ${amount}`;
  },
};

export interface DeathSavePayload {
  /** The d20 the player rolled. */
  roll: number;
}

/**
 * 10 or higher succeeds, below 10 fails. A 1 counts as two failures; a 20 brings you back with
 * 1 HP. Three successes make you stable (kept as 3 successes until you heal or take damage).
 */
export const rollDeathSave: Command<DeathSavePayload> = {
  name: 'rollDeathSave',
  check: (ctx, { roll }) => {
    const { live } = ctx;
    if (live.hp > 0) return [block('Death saves only at 0 HP')];
    const dead = deadCheck(ctx);
    if (dead.length > 0) return dead;
    if (live.deathSaves.success >= DEATH_SAVES_NEEDED) {
      return [block('You are stable: no more death saves')];
    }
    return rangeCheck('Death save roll', roll, 1, 20);
  },
  apply: ({ live }, { roll }) => {
    if (roll === 20) {
      live.hp = 1;
      resetDeathSaves(live);
      removeCondition(live, 'unconscious');
      return 'Death save 20: back up with 1 HP';
    }
    let outcome: string;
    if (roll >= 10) {
      live.deathSaves.success += 1;
      outcome = live.deathSaves.success >= DEATH_SAVES_NEEDED ? 'success, stable' : 'success';
    } else {
      const failures = roll === 1 ? 2 : 1;
      live.deathSaves.fail = Math.min(DEATH_SAVES_NEEDED, live.deathSaves.fail + failures);
      outcome = roll === 1 ? 'two failures' : 'failure';
      if (isDead(live)) outcome += ', dead';
    }
    const { success, fail } = live.deathSaves;
    return `Death save ${roll}: ${outcome} (${success} ✓ / ${fail} ✗)`;
  },
};
