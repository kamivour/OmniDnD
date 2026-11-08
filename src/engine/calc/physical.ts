import { CARRY_PER_STR } from '../rules2014';
import type { Sheet } from './sheet';
import { sumParts, type Part, type Stat } from './stat';

/**
 * Body numbers from the 2014 PHB (jumping, lifting, suffocating, food, climbing and swimming).
 * Every value carries its parts; the DM still rules on terrain and edge cases.
 */
export interface PhysicalNumbers {
  longJumpRunning: Stat;
  longJumpStanding: Stat;
  highJumpRunning: Stat;
  highJumpStanding: Stat;
  /** Run-up needed for a running jump, in feet. */
  runUpFeet: number;
  /** Most weight you can push, drag or lift (twice carrying capacity), in pounds. */
  pushDragLift: Stat;
  /** Seconds you can hold your breath. */
  holdBreathSeconds: Stat;
  /** Rounds you survive after breath runs out (minimum 1). */
  chokingRounds: Stat;
  /** Days you can go without food before exhaustion starts. */
  daysWithoutFood: Stat;
  climbSpeed: Stat;
  swimSpeed: Stat;
  /** Reminders for features that change these numbers but are applied by the player. */
  reminders: string[];
}

const JUMP_SPELL = 'spell.jump';
const REMARKABLE_ATHLETE = 'feature.fighter.remarkable-athlete';
const ATHLETE_FEAT = 'feature.feat.athlete';
const STEP_OF_THE_WIND = 'feature.monk.step-of-the-wind';

const floorStat = (parts: Part[], label: string, min: number): Stat => {
  const stat = sumParts(parts);
  if (stat.value >= min) return stat;
  return { value: min, parts: [...parts, { label, value: min - stat.value }] };
};

/** Active-effect source ids that triple jump distance (the Jump spell). */
export function physicalNumbers(
  sheet: Sheet,
  activeEffectSources: readonly (string | undefined)[],
): PhysicalNumbers {
  const str = sheet.abilities.STR;
  const con = sheet.abilities.CON.mod;
  const has = (id: string) => sheet.features.some(({ def }) => def.id === id);
  const jumpSpell = activeEffectSources.includes(JUMP_SPELL);
  const athlete = has(ATHLETE_FEAT);
  const remarkable = has(REMARKABLE_ATHLETE);

  const triple = (stat: Stat): Stat => {
    if (!jumpSpell) return stat;
    return {
      value: stat.value * 3,
      parts: [...stat.parts, { label: 'Jump spell (x3)', value: stat.value * 2 }],
    };
  };
  const half = (stat: Stat, label: string): Stat => {
    const value = Math.floor(stat.value / 2);
    return { value, parts: [{ label, value }] };
  };

  const strScore: Part = { label: 'STR score', value: str.score.value };
  const longRunParts: Part[] = [strScore];
  if (remarkable)
    longRunParts.push({ label: 'Remarkable Athlete (STR mod)', value: Math.max(0, str.mod) });
  const longJumpRunning = triple(sumParts(longRunParts));
  const longJumpStanding = triple(half(sumParts([strScore]), 'Half of STR score'));

  const highRunning = triple(
    floorStat([{ label: '3 + STR mod', value: 3 + str.mod }], 'Minimum 0', 0),
  );
  const highStanding = triple(
    half(
      floorStat([{ label: '3 + STR mod', value: 3 + str.mod }], 'Minimum 0', 0),
      'Half of running high jump',
    ),
  );

  const reminders: string[] = [];
  if (has(STEP_OF_THE_WIND))
    reminders.push('Step of the Wind: spend ki to double your jump distance this turn.');
  if (remarkable)
    reminders.push('Remarkable Athlete adds your STR modifier to a running long jump only.');
  if (jumpSpell) reminders.push('The Jump spell is active: distances are tripled.');

  return {
    longJumpRunning,
    longJumpStanding,
    highJumpRunning: highRunning,
    highJumpStanding: highStanding,
    runUpFeet: athlete ? 5 : 10,
    pushDragLift: sumParts([
      { label: `STR score x ${CARRY_PER_STR} x 2`, value: str.score.value * CARRY_PER_STR * 2 },
    ]),
    holdBreathSeconds: floorStat(
      [{ label: '(1 + CON mod) minutes', value: (1 + con) * 60 }],
      'Minimum 30 seconds',
      30,
    ),
    chokingRounds: floorStat([{ label: 'CON mod', value: con }], 'Minimum 1 round', 1),
    daysWithoutFood: floorStat([{ label: '3 + CON mod', value: 3 + con }], 'Minimum 1 day', 1),
    climbSpeed: half(sheet.speed, 'Half of walking speed'),
    swimSpeed: half(sheet.speed, 'Half of walking speed'),
    reminders,
  };
}
