import { formatDuration } from '../clock';
import { CONDITIONS, MAX_EXHAUSTION, type Condition } from '../rules2014';
import type { ActiveEffect, EffectEndsOn, FeatureDefenses, LiveState, Modifier } from '../schema';
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

/** "turn-start"/"turn-end" mean your next turn; rests mean the next one you finish. */
export type EffectEndTrigger = EffectEndsOn['event'];

interface EffectFields {
  name: string;
  /** From now. Absent: lasts until removed (or until its trigger). */
  durationSeconds?: number;
  endsOn?: EffectEndTrigger;
  conditions?: Condition[];
  modifiers?: Modifier[];
  defenses?: FeatureDefenses;
  note?: string;
}

export interface AddEffectPayload extends EffectFields {
  /** Ends with your current concentration. */
  concentration?: boolean;
  sourceId?: string;
}

/** Checks shared by adding and editing. */
function effectFieldChecks(ctx: CommandContext, fields: EffectFields): Check[] {
  const checks: Check[] = [];
  if (fields.name.trim() === '') checks.push(block('Name the effect'));
  if (fields.durationSeconds !== undefined) {
    const durationChecks = minCheck('Duration in seconds', fields.durationSeconds, 1);
    checks.push(...durationChecks);
    if (durationChecks.length === 0) {
      checks.push(...timeRangeChecks(ctx.live.clock.seconds, fields.durationSeconds));
    }
  }
  if ((fields.endsOn === 'turn-start' || fields.endsOn === 'turn-end') && !ctx.live.combat) {
    checks.push(block('Turn timing needs combat: start combat first'));
  }
  checks.push(...conditionChecks(fields.conditions ?? []));
  return checks;
}

/** Your next turn is always the next round: a current turn is already under way. */
function endsOnFor(live: LiveState, trigger: EffectEndTrigger): EffectEndsOn {
  if (trigger === 'short-rest' || trigger === 'long-rest') return { event: trigger };
  return { event: trigger, round: (live.combat?.round ?? 0) + 1 };
}

function cleanDefenses(defenses: FeatureDefenses | undefined): FeatureDefenses | undefined {
  if (!defenses) return undefined;
  const clean: FeatureDefenses = {};
  if (defenses.resistances?.length) clean.resistances = [...new Set(defenses.resistances)];
  if (defenses.immunities?.length) clean.immunities = [...new Set(defenses.immunities)];
  if (defenses.vulnerabilities?.length) {
    clean.vulnerabilities = [...new Set(defenses.vulnerabilities)];
  }
  if (defenses.saveAdvantages?.length) {
    clean.saveAdvantages = [...new Set(defenses.saveAdvantages)];
  }
  if (defenses.magicalSleepImmunity) clean.magicalSleepImmunity = true;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** Writes the editable fields; an unchanged trigger keeps its original round. */
function writeFields(live: LiveState, effect: ActiveEffect, fields: EffectFields): void {
  effect.name = fields.name.trim();
  effect.conditions = [...new Set(fields.conditions ?? [])];
  effect.modifiers = fields.modifiers ?? [];
  if (fields.durationSeconds === undefined) delete effect.endsAt;
  else effect.endsAt = live.clock.seconds + fields.durationSeconds;
  if (fields.endsOn === undefined) delete effect.endsOn;
  else if (effect.endsOn?.event !== fields.endsOn) effect.endsOn = endsOnFor(live, fields.endsOn);
  const defenses = cleanDefenses(fields.defenses);
  if (defenses) effect.defenses = defenses;
  else delete effect.defenses;
  const note = fields.note?.trim();
  if (note) effect.note = note;
  else delete effect.note;
}

export const EFFECT_TRIGGER_LABEL: Record<EffectEndTrigger, string> = {
  'turn-start': 'until the start of your next turn',
  'turn-end': 'until the end of your next turn',
  'short-rest': 'until a short or long rest',
  'long-rest': 'until a long rest',
};

function lengthLabel(fields: EffectFields): string {
  const parts = [
    fields.durationSeconds === undefined ? undefined : formatDuration(fields.durationSeconds),
    fields.endsOn === undefined ? undefined : EFFECT_TRIGGER_LABEL[fields.endsOn],
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
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
    const checks = effectFieldChecks(ctx, payload);
    if (payload.concentration && !ctx.live.concentration) {
      checks.push(block('Not concentrating: cast the concentration spell first'));
    }
    checks.push(...concentrationEndsCheck(ctx, payload.conditions ?? []));
    return checks;
  },
  apply: ({ live }, payload, { registry }) => {
    const name = payload.name.trim();
    const effect: ActiveEffect = {
      id: uniqueEffectId(live, `effect.${slug(name)}`),
      name,
      concentration: payload.concentration ?? false,
      conditions: [],
      modifiers: [],
    };
    if (payload.sourceId !== undefined) effect.sourceId = payload.sourceId;
    writeFields(live, effect, payload);
    live.effects.push(effect);
    return withNotes(`Effect added: ${name}${lengthLabel(payload)}`, [
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

export interface EditEffectPayload extends EffectFields {
  effectId: string;
}

/** Change an effect in place. Its id, source and concentration link stay as they are. */
export const editEffect: Command<EditEffectPayload> = {
  name: 'editEffect',
  check: (ctx, payload) => {
    const effect = ctx.live.effects.find(({ id }) => id === payload.effectId);
    if (!effect) return [block(`No effect ${payload.effectId}`)];
    const checks = effectFieldChecks(ctx, payload);
    const added = (payload.conditions ?? []).filter((c) => !effect.conditions.includes(c));
    checks.push(...concentrationEndsCheck(ctx, added));
    return checks;
  },
  apply: ({ live }, payload, { registry }) => {
    const effect = live.effects.find(({ id }) => id === payload.effectId);
    if (!effect) return `No effect ${payload.effectId}`;
    writeFields(live, effect, payload);
    return withNotes(`Effect edited: ${effect.name}${lengthLabel(payload)}`, [
      breakConcentrationIfIncapacitated(live, registry),
    ]);
  },
};
