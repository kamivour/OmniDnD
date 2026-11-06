import type { Ability } from '../../engine/calc/abilities';
import {
  cancels,
  saveRollState,
  type RollKind,
  type RollMode,
  type RollReminder,
} from '../../engine/calc/conditions';

const ROLL_ORDER: readonly RollKind[] = ['attacks', 'attacked', 'checks', 'saves'];

export const ROLL_LABEL: Record<RollKind, string> = {
  attacks: 'Your attacks',
  attacked: 'Attacks against you',
  checks: 'Ability checks',
  saves: 'Saving throws',
};

const MODE_TEXT: Record<RollMode, string> = {
  advantage: 'advantage',
  disadvantage: 'disadvantage',
  'auto-fail': 'fail automatically',
  critical: 'hits are critical',
};

export interface ReminderGroup {
  roll: RollKind;
  label: string;
  lines: { text: string; sources: string[] }[];
  /** Plain advantage and disadvantage both apply, so the roll is normal. */
  cancelled: boolean;
}

function lineText({ roll, mode, abilities, when }: RollReminder): string {
  const names = abilities
    ? abilities.length > 2
      ? `${abilities.slice(0, -1).join(', ')} and ${abilities.at(-1)}`
      : abilities.join(' and ')
    : '';
  const scope = abilities ? `${names} ${roll}: ` : '';
  return `${scope}${MODE_TEXT[mode]}${when ? ` when ${when}` : ''}`;
}

/** Groups reminders by roll, merging identical lines from different sources. */
export function reminderGroups(reminders: readonly RollReminder[]): ReminderGroup[] {
  return ROLL_ORDER.flatMap((roll) => {
    const lines: ReminderGroup['lines'] = [];
    for (const reminder of reminders.filter((entry) => entry.roll === roll)) {
      const text = lineText(reminder);
      const line = lines.find((entry) => entry.text === text);
      if (!line) lines.push({ text, sources: [reminder.source] });
      else if (!line.sources.includes(reminder.source)) line.sources.push(reminder.source);
    }
    if (lines.length === 0) return [];
    return [{ roll, label: ROLL_LABEL[roll], lines, cancelled: cancels(reminders, roll) }];
  });
}

/** One word for a save's summary tile; nothing when advantage and disadvantage cancel. */
export function saveTag(
  reminders: readonly RollReminder[],
  ability: Ability,
): 'Auto-fail' | 'Advantage' | 'Disadvantage' | undefined {
  const state = saveRollState(reminders, ability);
  if (state.autoFail) return 'Auto-fail';
  if (state.advantage && state.disadvantage) return undefined;
  if (state.disadvantage) return 'Disadvantage';
  if (state.advantage) return 'Advantage';
  return undefined;
}
