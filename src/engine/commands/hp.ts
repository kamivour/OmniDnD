import { z } from 'zod';
import { DEATH_SAVES_NEEDED } from '../rules2014';
import type { Check, Command, CommandContext } from './runner';
import {
  addCondition,
  breakConcentrationIfIncapacitated,
  deadCheck,
  dropConcentration,
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

const AmountPayloadSchema = z.strictObject({ amount: z.number().max(Number.MAX_SAFE_INTEGER) });
const DamagePayloadSchema = AmountPayloadSchema.extend({ critical: z.boolean().optional() });
const DeathSavePayloadSchema = z.strictObject({
  roll: z.number(),
  /** Leave room for every valid natural d20 result when adding an external modifier. */
  modifier: z
    .int()
    .min(Number.MIN_SAFE_INTEGER + 20)
    .max(Number.MAX_SAFE_INTEGER - 20)
    .optional(),
});

const TEMP_HP_MASSIVE_DAMAGE_REVIEW =
  'Temp HP at 0 HP: massive-damage outcome needs DM review; current default uses damage remaining after temp HP';

function needsTempHpMassiveDamageReview(
  hp: number,
  amount: number,
  remaining: number,
  maxHp: number,
) {
  return hp === 0 && amount >= maxHp && remaining < maxHp;
}

/** Shared legal-action/status flags, including dead imports with no condition entries. */
export function healthDetails({ live, sheet }: Pick<CommandContext, 'live' | 'sheet'>): {
  hp: number;
  maxHp: number;
  tempHp: number;
  status: 'alive' | 'dying' | 'stable' | 'dead';
  canTakeDamage: boolean;
  canHeal: boolean;
  canRollDeathSave: boolean;
} {
  const dead = isDead(live);
  const status = dead
    ? 'dead'
    : live.hp > 0
      ? 'alive'
      : live.deathSaves.success >= DEATH_SAVES_NEEDED
        ? 'stable'
        : 'dying';
  return {
    hp: live.hp,
    maxHp: sheet.maxHp.value,
    tempHp: live.tempHp,
    status,
    canTakeDamage: !dead,
    canHeal: !dead,
    canRollDeathSave: status === 'dying',
  };
}

/** PHB 2014: the concentration save DC is 10 or half the damage, whichever is higher. */
export function concentrationSaveDc(damage: number): number {
  return Math.max(10, Math.floor(damage / 2));
}

/**
 * Temp HP absorb damage first. Damage that drops you to 0 HP knocks you unconscious, or kills
 * you outright when the rest equals your max HP. Damage at 0 HP adds death save failures.
 * The concentration save itself is the player's roll: Assisted mode records a pending check.
 */
export const applyDamage: Command<ApplyDamagePayload> = {
  name: 'applyDamage',
  check: (ctx, payload) => {
    const parsed = DamagePayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Damage details are invalid')];
    const { amount } = parsed.data;
    const checks: Check[] = [...deadCheck(ctx), ...minCheck('Damage', amount, 1)];
    const { live } = ctx;
    const toHp = Math.max(0, amount - live.tempHp);
    if (needsTempHpMassiveDamageReview(live.hp, amount, toHp, ctx.sheet.maxHp.value))
      checks.push(info(TEMP_HP_MASSIVE_DAMAGE_REVIEW));
    if (live.concentration && live.hp - toHp > 0) {
      const spell = ctx.registry.get('spell', live.concentration.spellId);
      checks.push(info(`Concentration save DC ${concentrationSaveDc(amount)} (${spell.name})`));
    }
    return checks;
  },
  apply: ({ live }, payload, ctx) => {
    const { amount, critical = false } = DamagePayloadSchema.parse(payload);
    const maxHp = ctx.sheet.maxHp.value;
    const notes: (string | undefined)[] = [];
    const absorbed = Math.min(live.tempHp, amount);
    live.tempHp -= absorbed;
    if (absorbed > 0) notes.push(`temp HP absorbed ${absorbed}`);
    const rest = amount - absorbed;
    const before = live.hp;
    if (
      ctx.automation === 'assisted' &&
      needsTempHpMassiveDamageReview(before, amount, rest, maxHp)
    )
      notes.push(TEMP_HP_MASSIVE_DAMAGE_REVIEW);

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
    } else if (amount > 0) {
      // Damage ends stability: the death save count starts over.
      if (live.deathSaves.success >= DEATH_SAVES_NEEDED) resetDeathSaves(live);
      const failures = critical ? 2 : 1;
      live.deathSaves.fail = Math.min(DEATH_SAVES_NEEDED, live.deathSaves.fail + failures);
      notes.push(`${failures} death save ${failures === 1 ? 'failure' : 'failures'}`);
      if (isDead(live)) notes.push('dead');
    }
    notes.push(breakConcentrationIfIncapacitated(live, ctx.registry));
    // HP-zero imports may omit unconscious; they still cannot keep concentration after damage.
    if (live.hp === 0 && live.concentration)
      notes.push(`concentration on ${dropConcentration(live, ctx.registry)} ended (0 HP)`);
    if (ctx.automation === 'assisted' && live.concentration) {
      live.concentration.pendingSaves ??= [];
      live.concentration.pendingSaves.push({ id: ctx.eventId, dc: concentrationSaveDc(amount) });
    }

    const kind = critical ? 'critical damage' : 'damage';
    return withNotes(`Took ${amount} ${kind} (HP ${before} → ${live.hp})`, notes);
  },
};

export interface AmountPayload {
  amount: number;
}

export const heal: Command<AmountPayload> = {
  name: 'heal',
  check: (ctx, payload) => {
    const parsed = AmountPayloadSchema.safeParse(payload);
    return parsed.success
      ? [...deadCheck(ctx), ...minCheck('Healing', parsed.data.amount, 1)]
      : [block('Healing details are invalid')];
  },
  apply: ({ live }, payload, ctx) => {
    const { amount } = AmountPayloadSchema.parse(payload);
    const { before, after } = restoreHp(live, amount, ctx.sheet.maxHp.value);
    return withNotes(`Healed ${amount} (HP ${before} → ${after})`, [
      before === 0 && after > 0 ? 'conscious again' : undefined,
    ]);
  },
};

/** Temp HP never stack: a new amount replaces the old one, so a smaller amount asks first. */
export const setTempHp: Command<AmountPayload> = {
  name: 'setTempHp',
  check: ({ live }, payload) => {
    const parsed = AmountPayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Temp HP details are invalid')];
    const { amount } = parsed.data;
    const checks = minCheck('Temp HP', amount, 0);
    if (amount > 0 && amount < live.tempHp) {
      checks.push(warn(`Temp HP don't stack: you have ${live.tempHp}`));
    }
    return checks;
  },
  apply: ({ live }, payload) => {
    const { amount } = AmountPayloadSchema.parse(payload);
    const before = live.tempHp;
    live.tempHp = amount;
    return amount === 0 ? 'Temp HP cleared' : `Temp HP ${before} → ${amount}`;
  },
};

export interface DeathSavePayload {
  /** The d20 the player rolled. */
  roll: number;
  /** External spell/feature or DM modifier; natural 1 and 20 retain their special outcomes. */
  modifier?: number;
}

/**
 * A modified total of 10 or higher succeeds. A natural 1 counts as two failures; a 20 brings you back with
 * 1 HP. Three successes make you stable (kept as 3 successes until you heal or take damage).
 */
export const rollDeathSave: Command<DeathSavePayload> = {
  name: 'rollDeathSave',
  check: (ctx, payload) => {
    const parsed = DeathSavePayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Death save details are invalid')];
    const { roll } = parsed.data;
    const { live } = ctx;
    if (live.hp > 0) return [block('Death saves only at 0 HP')];
    const dead = deadCheck(ctx);
    if (dead.length > 0) return dead;
    if (live.deathSaves.success >= DEATH_SAVES_NEEDED) {
      return [block('You are stable: no more death saves')];
    }
    return rangeCheck('Death save roll', roll, 1, 20);
  },
  apply: ({ live }, payload) => {
    const { roll, modifier = 0 } = DeathSavePayloadSchema.parse(payload);
    if (roll === 20) {
      live.hp = 1;
      resetDeathSaves(live);
      removeCondition(live, 'unconscious');
      return 'Death save 20: back up with 1 HP';
    }
    let outcome: string;
    const total = roll + modifier;
    if (roll !== 1 && total >= 10) {
      live.deathSaves.success += 1;
      outcome = live.deathSaves.success >= DEATH_SAVES_NEEDED ? 'success, stable' : 'success';
    } else {
      const failures = roll === 1 ? 2 : 1;
      live.deathSaves.fail = Math.min(DEATH_SAVES_NEEDED, live.deathSaves.fail + failures);
      outcome = roll === 1 ? 'two failures' : 'failure';
      if (isDead(live)) outcome += ', dead';
    }
    const { success, fail } = live.deathSaves;
    const result =
      modifier !== 0 && roll !== 1
        ? `${roll} ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)} = ${total}`
        : String(roll);
    return `Death save ${result}: ${outcome} (${success} ✓ / ${fail} ✗)`;
  },
};

const ResolveConcentrationSavePayloadSchema = z.strictObject({
  saveId: z.string().min(1),
  outcome: z.enum(['pass', 'fail']),
});
export type ResolveConcentrationSavePayload = z.infer<typeof ResolveConcentrationSavePayloadSchema>;

/** Resolve only an existing request on the current concentration, never a stale UI snapshot. */
export const resolveConcentrationSave: Command<ResolveConcentrationSavePayload> = {
  name: 'resolveConcentrationSave',
  check: ({ live }, payload) => {
    const parsed = ResolveConcentrationSavePayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Concentration save details are invalid')];
    return live.concentration?.pendingSaves?.some((save) => save.id === parsed.data.saveId)
      ? []
      : [block('That concentration save is no longer pending')];
  },
  apply: ({ live }, payload, { registry }) => {
    const { saveId, outcome } = ResolveConcentrationSavePayloadSchema.parse(payload);
    const concentration = live.concentration!;
    const save = concentration.pendingSaves!.find((entry) => entry.id === saveId)!;
    const name = registry.get('spell', concentration.spellId).name;
    if (outcome === 'fail') {
      dropConcentration(live, registry);
      return `Concentration save failed: ${name} (DC ${save.dc}); concentration ended`;
    }
    concentration.pendingSaves = concentration.pendingSaves!.filter((entry) => entry.id !== saveId);
    if (concentration.pendingSaves.length === 0) delete concentration.pendingSaves;
    return `Concentration save passed: ${name} (DC ${save.dc})`;
  },
};
