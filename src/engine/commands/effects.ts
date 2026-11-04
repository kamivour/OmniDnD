import { formatDuration } from '../clock';
import { CONDITIONS, MAX_EXHAUSTION, type Condition } from '../rules2014';
import type { ActiveEffect, Modifier } from '../schema';
import type { Check, Command, CommandContext } from './runner';
import {
  addCondition,
  block,
  breakConcentrationIfIncapacitated,
  dropConcentration,
  incapacitatedBy,
  info,
  maxHpAfter,
  minCheck,
  rangeCheck,
  removeCondition,
  removeEffects,
  timeRangeChecks,
  uniqueEffectId,
  withNotes,
} from './shared';

/** Info when a change would incapacitate you while you concentrate. */
function concentrationEndsCheck(ctx: CommandContext, conditions: readonly Condition[]): Check[] {
  const spellId = ctx.live.concentration?.spellId;
  if (!spellId || !incapacitatedBy(conditions)) return [];
  return [info(`Ends concentration on ${ctx.registry.get('spell', spellId).name}`)];
}

function conditionChecks(conditions: readonly string[]): Check[] {
  return conditions
    .filter((condition) => !(CONDITIONS as readonly string[]).includes(condition))
    .map((condition) => block(`Unknown condition ${condition}`));
}

export interface ToggleConditionPayload {
  condition: Condition;
}

export const toggleCondition: Command<ToggleConditionPayload> = {
  name: 'toggleCondition',
  check: (ctx, { condition }) => {
    const unknown = conditionChecks([condition]);
    if (unknown.length > 0) return unknown;
    return ctx.live.conditions.includes(condition) ? [] : concentrationEndsCheck(ctx, [condition]);
  },
  apply: ({ live }, { condition }, { registry }) => {
    if (live.conditions.includes(condition)) {
      removeCondition(live, condition);
      return `Condition removed: ${condition}`;
    }
    addCondition(live, condition);
    return withNotes(`Condition added: ${condition}`, [
      breakConcentrationIfIncapacitated(live, registry),
    ]);
  },
};

export interface SetExhaustionPayload {
  level: number;
}

/** Level 4 halves max HP, so current HP drops to the new max. Level 6 is death. */
export const setExhaustion: Command<SetExhaustionPayload> = {
  name: 'setExhaustion',
  check: (_ctx, { level }) => {
    const checks = rangeCheck('Exhaustion', level, 0, MAX_EXHAUSTION);
    if (checks.length === 0 && level === MAX_EXHAUSTION) checks.push(info('Exhaustion 6: death'));
    return checks;
  },
  apply: ({ live }, { level }, ctx) => {
    const before = live.exhaustion;
    live.exhaustion = level;
    const notes: (string | undefined)[] = [];
    const maxHp = maxHpAfter(ctx, { live: { ...ctx.live, exhaustion: level } });
    if (live.hp > maxHp) {
      notes.push(`HP ${live.hp} → ${maxHp} (max HP halved)`);
      live.hp = maxHp;
    }
    if (level >= MAX_EXHAUSTION) notes.push('dead');
    notes.push(breakConcentrationIfIncapacitated(live, ctx.registry));
    return withNotes(`Exhaustion ${before} → ${level}`, notes);
  },
};

export interface AddEffectPayload {
  name: string;
  /** Absent: lasts until removed. */
  durationSeconds?: number;
  /** Ends with your current concentration. */
  concentration?: boolean;
  conditions?: Condition[];
  modifiers?: Modifier[];
  note?: string;
  sourceId?: string;
}

/** "Bless (cleric)" → "bless-cleric". */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'effect'
  );
}

/** A manual effect on you: a spell someone else cast, a potion, a DM ruling. */
export const addEffect: Command<AddEffectPayload> = {
  name: 'addEffect',
  check: (ctx, payload) => {
    const checks: Check[] = [];
    if (payload.name.trim() === '') checks.push(block('Name the effect'));
    if (payload.durationSeconds !== undefined) {
      const durationChecks = minCheck('Duration in seconds', payload.durationSeconds, 1);
      checks.push(...durationChecks);
      if (durationChecks.length === 0) {
        checks.push(...timeRangeChecks(ctx.live.clock.seconds, payload.durationSeconds));
      }
    }
    if (payload.concentration && !ctx.live.concentration) {
      checks.push(block('Not concentrating: cast the concentration spell first'));
    }
    const conditions = payload.conditions ?? [];
    checks.push(...conditionChecks(conditions), ...concentrationEndsCheck(ctx, conditions));
    return checks;
  },
  apply: ({ live }, payload, { registry }) => {
    const name = payload.name.trim();
    const effect: ActiveEffect = {
      id: uniqueEffectId(live, `effect.${slug(name)}`),
      name,
      concentration: payload.concentration ?? false,
      conditions: [...new Set(payload.conditions ?? [])],
      modifiers: payload.modifiers ?? [],
    };
    if (payload.sourceId !== undefined) effect.sourceId = payload.sourceId;
    if (payload.durationSeconds !== undefined) {
      effect.endsAt = live.clock.seconds + payload.durationSeconds;
    }
    if (payload.note !== undefined && payload.note !== '') effect.note = payload.note;
    live.effects.push(effect);
    const duration =
      payload.durationSeconds === undefined ? '' : ` (${formatDuration(payload.durationSeconds)})`;
    return withNotes(`Effect added: ${name}${duration}`, [
      breakConcentrationIfIncapacitated(live, registry),
    ]);
  },
};

export interface RemoveEffectPayload {
  effectId: string;
}

/** Removing the effect your concentration spell put on you also ends the concentration. */
export const removeEffect: Command<RemoveEffectPayload> = {
  name: 'removeEffect',
  check: ({ live }, { effectId }) =>
    live.effects.some((effect) => effect.id === effectId) ? [] : [block(`No effect ${effectId}`)],
  apply: ({ live }, { effectId }, { registry }) => {
    const name = live.effects.find((effect) => effect.id === effectId)?.name ?? effectId;
    if (live.concentration?.effectId === effectId) {
      const spell = dropConcentration(live, registry);
      return `Effect removed: ${name}; concentration on ${spell} ended`;
    }
    removeEffects(live, (effect) => effect.id === effectId);
    return `Effect removed: ${name}`;
  },
};
