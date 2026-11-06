import type { Condition } from '../rules2014';
import type { Ability } from './abilities';

/** Which roll a reminder is about. "attacked" means attack rolls made against you. */
export type RollKind = 'attacks' | 'attacked' | 'checks' | 'saves';
export type RollMode = 'advantage' | 'disadvantage' | 'auto-fail' | 'critical';

export interface RollReminder {
  roll: RollKind;
  mode: RollMode;
  /** Only these saves; absent means every roll of the kind. */
  abilities?: readonly Ability[];
  /** A situation the player judges, such as "the check needs sight". */
  when?: string;
  /** "poisoned", "exhaustion 3". */
  source: string;
}

type Rule = Omit<RollReminder, 'source'>;

const STR_DEX: readonly Ability[] = ['STR', 'DEX'];
const attackedWithAdvantage: Rule = { roll: 'attacked', mode: 'advantage' };
const failsStrDexSaves: Rule = { roll: 'saves', mode: 'auto-fail', abilities: STR_DEX };
const meleeCritical: Rule = {
  roll: 'attacked',
  mode: 'critical',
  when: 'a hit from within 5 ft',
};

/** PHB 2014 appendix A, roll effects only. Movement and action limits live elsewhere. */
export const CONDITION_ROLLS: Readonly<Record<Condition, readonly Rule[]>> = {
  blinded: [
    { roll: 'checks', mode: 'auto-fail', when: 'the check needs sight' },
    { roll: 'attacks', mode: 'disadvantage' },
    attackedWithAdvantage,
  ],
  charmed: [],
  deafened: [{ roll: 'checks', mode: 'auto-fail', when: 'the check needs hearing' }],
  frightened: [
    { roll: 'checks', mode: 'disadvantage', when: 'the source of fear is in sight' },
    { roll: 'attacks', mode: 'disadvantage', when: 'the source of fear is in sight' },
  ],
  grappled: [],
  incapacitated: [],
  invisible: [
    { roll: 'attacks', mode: 'advantage' },
    { roll: 'attacked', mode: 'disadvantage' },
  ],
  paralyzed: [failsStrDexSaves, attackedWithAdvantage, meleeCritical],
  petrified: [failsStrDexSaves, attackedWithAdvantage],
  poisoned: [
    { roll: 'attacks', mode: 'disadvantage' },
    { roll: 'checks', mode: 'disadvantage' },
  ],
  prone: [
    { roll: 'attacks', mode: 'disadvantage' },
    { roll: 'attacked', mode: 'advantage', when: 'the attacker is within 5 ft' },
    { roll: 'attacked', mode: 'disadvantage', when: 'the attacker is farther away' },
  ],
  restrained: [
    { roll: 'attacks', mode: 'disadvantage' },
    attackedWithAdvantage,
    { roll: 'saves', mode: 'disadvantage', abilities: ['DEX'] },
  ],
  stunned: [failsStrDexSaves, attackedWithAdvantage],
  unconscious: [failsStrDexSaves, attackedWithAdvantage, meleeCritical],
};

/** What each exhaustion level adds; levels stack (PHB 2014). */
export const EXHAUSTION_LEVELS: readonly string[] = [
  'Disadvantage on ability checks',
  'Speed halved',
  'Disadvantage on attack rolls and saving throws',
  'Hit point maximum halved',
  'Speed 0',
  'Death',
];

/** Roll reminders from conditions and exhaustion, in condition order. */
export function rollReminders(
  conditions: readonly Condition[],
  exhaustion: number,
): RollReminder[] {
  const reminders: RollReminder[] = conditions.flatMap((condition) =>
    CONDITION_ROLLS[condition].map((rule) => ({ ...rule, source: condition })),
  );
  if (exhaustion >= 1) {
    reminders.push({ roll: 'checks', mode: 'disadvantage', source: `exhaustion ${exhaustion}` });
  }
  if (exhaustion >= 3) {
    reminders.push(
      { roll: 'attacks', mode: 'disadvantage', source: `exhaustion ${exhaustion}` },
      { roll: 'saves', mode: 'disadvantage', source: `exhaustion ${exhaustion}` },
    );
  }
  return reminders;
}

export interface SaveRollState {
  autoFail: boolean;
  advantage: boolean;
  disadvantage: boolean;
}

/** Unconditional effects on one saving throw. Situational ones stay with the player. */
export function saveRollState(reminders: readonly RollReminder[], ability: Ability): SaveRollState {
  const applies = reminders.filter(
    (reminder) =>
      reminder.roll === 'saves' &&
      reminder.when === undefined &&
      (reminder.abilities === undefined || reminder.abilities.includes(ability)),
  );
  return {
    autoFail: applies.some(({ mode }) => mode === 'auto-fail'),
    advantage: applies.some(({ mode }) => mode === 'advantage'),
    disadvantage: applies.some(({ mode }) => mode === 'disadvantage'),
  };
}

/**
 * True when one roll kind has both unconditional advantage and disadvantage: in 2014 they cancel,
 * however many of each apply.
 */
export function cancels(reminders: readonly RollReminder[], roll: RollKind): boolean {
  const plain = reminders.filter((reminder) => reminder.roll === roll && !reminder.when);
  return (
    plain.some(({ mode, abilities }) => mode === 'advantage' && !abilities) &&
    plain.some(({ mode, abilities }) => mode === 'disadvantage' && !abilities)
  );
}
