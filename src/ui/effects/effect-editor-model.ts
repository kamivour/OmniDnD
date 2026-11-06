import type { EffectEndTrigger } from '../../engine/commands';
import {
  DAMAGE_TYPES,
  SECONDS_PER_ROUND,
  type Condition,
  type DamageType,
} from '../../engine/rules2014';
import type { ActiveEffect, FeatureDefenses, LiveState, Modifier } from '../../engine/schema';

export type DurationUnit = 'none' | 'rounds' | 'minutes' | 'hours' | 'seconds';
export type DefenseKind = '' | 'resistances' | 'immunities' | 'vulnerabilities';

/** Numeric modifiers the editor offers; other modifier kinds are kept unchanged. */
export const EDITABLE_TARGETS = [
  { target: 'ac', label: 'AC' },
  { target: 'initiative', label: 'Initiative' },
  { target: 'speed', label: 'Speed (ft)' },
  { target: 'saves', label: 'Saving throws' },
  { target: 'checks', label: 'Ability checks' },
] as const satisfies readonly { target: Modifier['target']; label: string }[];
type EditableTarget = (typeof EDITABLE_TARGETS)[number]['target'];

export const UNIT_SECONDS: Record<Exclude<DurationUnit, 'none'>, number> = {
  rounds: SECONDS_PER_ROUND,
  minutes: 60,
  hours: 3600,
  seconds: 1,
};

export interface EffectFormFields {
  name: string;
  amount: string;
  unit: DurationUnit;
  endsOn: EffectEndTrigger | '';
  conditions: Condition[];
  modifiers: Record<EditableTarget, string>;
  damage: Record<DamageType, DefenseKind>;
  note: string;
  concentration: boolean;
}

const noModifiers = (): Record<EditableTarget, string> => ({
  ac: '',
  initiative: '',
  speed: '',
  saves: '',
  checks: '',
});

const noDamage = (): Record<DamageType, DefenseKind> =>
  Object.fromEntries(DAMAGE_TYPES.map((type) => [type, ''])) as Record<DamageType, DefenseKind>;

export function emptyEffectFields(inCombat: boolean): EffectFormFields {
  return {
    name: '',
    amount: inCombat ? '10' : '1',
    unit: inCombat ? 'rounds' : 'none',
    endsOn: '',
    conditions: [],
    modifiers: noModifiers(),
    damage: noDamage(),
    note: '',
    concentration: false,
  };
}

/** Picks the largest unit that shows the remaining time exactly. */
function durationFields(seconds: number | undefined): Pick<EffectFormFields, 'amount' | 'unit'> {
  if (seconds === undefined || seconds <= 0) return { amount: '1', unit: 'none' };
  for (const unit of ['hours', 'minutes', 'rounds'] as const) {
    if (seconds % UNIT_SECONDS[unit] === 0) {
      return { amount: String(seconds / UNIT_SECONDS[unit]), unit };
    }
  }
  return { amount: String(seconds), unit: 'seconds' };
}

export function effectFields(effect: ActiveEffect, live: LiveState): EffectFormFields {
  const modifiers = noModifiers();
  for (const { target, value } of effect.modifiers) {
    if (typeof value === 'number' && target in modifiers) {
      const key = target as EditableTarget;
      modifiers[key] = String((Number(modifiers[key]) || 0) + value);
    }
  }
  const damage = noDamage();
  for (const kind of ['vulnerabilities', 'resistances', 'immunities'] as const) {
    for (const type of effect.defenses?.[kind] ?? []) damage[type] = kind;
  }
  return {
    name: effect.name,
    ...durationFields(effect.endsAt === undefined ? undefined : effect.endsAt - live.clock.seconds),
    endsOn: effect.endsOn?.event ?? '',
    conditions: [...effect.conditions],
    modifiers,
    damage,
    note: effect.note ?? '',
    concentration: effect.concentration,
  };
}

export interface BuiltEffect {
  errors: string[];
  fields?: {
    name: string;
    durationSeconds?: number;
    endsOn?: EffectEndTrigger;
    conditions: Condition[];
    modifiers: Modifier[];
    defenses?: FeatureDefenses;
    note?: string;
  };
}

const wholeNumber = (text: string) => (/^[+-]?\d+$/.test(text.trim()) ? Number(text) : undefined);

/** Turns form text into command fields; `original` keeps modifiers and defenses the form lacks. */
export function buildEffect(form: EffectFormFields, original?: ActiveEffect): BuiltEffect {
  const errors: string[] = [];
  let durationSeconds: number | undefined;
  if (form.unit !== 'none') {
    const amount = wholeNumber(form.amount);
    if (amount === undefined || amount < 1) errors.push('Enter a duration of 1 or more.');
    else durationSeconds = amount * UNIT_SECONDS[form.unit];
  }
  const kept = (original?.modifiers ?? []).filter(
    ({ target, value }) =>
      typeof value !== 'number' || !EDITABLE_TARGETS.some((entry) => entry.target === target),
  );
  const modifiers: Modifier[] = [...kept];
  for (const { target, label } of EDITABLE_TARGETS) {
    const text = form.modifiers[target].trim();
    if (text === '') continue;
    const value = wholeNumber(text);
    if (value === undefined) errors.push(`${label} must be a whole number, like +2 or -1.`);
    else if (value !== 0) modifiers.push({ target, value });
  }
  const defenses: FeatureDefenses = {};
  for (const type of DAMAGE_TYPES) {
    const kind = form.damage[type];
    if (kind) (defenses[kind] ??= []).push(type);
  }
  if (original?.defenses?.saveAdvantages)
    defenses.saveAdvantages = original.defenses.saveAdvantages;
  if (original?.defenses?.magicalSleepImmunity) defenses.magicalSleepImmunity = true;
  if (errors.length > 0) return { errors };
  const note = form.note.trim();
  return {
    errors,
    fields: {
      name: form.name,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      ...(form.endsOn ? { endsOn: form.endsOn } : {}),
      conditions: form.conditions,
      modifiers,
      ...(Object.keys(defenses).length > 0 ? { defenses } : {}),
      ...(note ? { note } : {}),
    },
  };
}
