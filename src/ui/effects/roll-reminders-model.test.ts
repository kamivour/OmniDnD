import { describe, expect, it } from 'vitest';
import { rollReminders } from '../../engine/calc/conditions';
import { reminderGroups, saveTag } from './roll-reminders-model';

describe('roll reminder groups', () => {
  it('merges identical lines and keeps roll order', () => {
    const groups = reminderGroups(rollReminders(['poisoned', 'restrained'], 3));
    expect(groups.map(({ label }) => label)).toEqual([
      'Your attacks',
      'Attacks against you',
      'Ability checks',
      'Saving throws',
    ]);
    expect(groups[0]?.lines).toEqual([
      { text: 'disadvantage', sources: ['poisoned', 'restrained', 'exhaustion 3'] },
    ]);
    expect(groups[3]?.lines.map(({ text }) => text)).toEqual([
      'DEX saves: disadvantage',
      'disadvantage',
    ]);
  });

  it('flags cancelled rolls and situational lines', () => {
    const groups = reminderGroups(rollReminders(['invisible', 'prone'], 0));
    const attacks = groups.find(({ roll }) => roll === 'attacks');
    expect(attacks?.cancelled).toBe(true);
    const attacked = groups.find(({ roll }) => roll === 'attacked');
    expect(attacked?.lines.map(({ text }) => text)).toEqual([
      'disadvantage',
      'advantage when the attacker is within 5 ft',
      'disadvantage when the attacker is farther away',
    ]);
  });

  it('tags saves: auto-fail wins, cancelled shows nothing', () => {
    expect(saveTag(rollReminders(['paralyzed'], 3), 'DEX')).toBe('Auto-fail');
    expect(saveTag(rollReminders(['paralyzed'], 3), 'WIS')).toBe('Disadvantage');
    expect(saveTag(rollReminders([], 0), 'WIS')).toBeUndefined();
  });

  it('labels the abilities and roll kind for heavy encumbrance', () => {
    const groups = reminderGroups(rollReminders([], 0, true));
    expect(groups.map(({ lines }) => lines[0]?.text)).toEqual([
      'STR, DEX and CON attacks: disadvantage',
      'STR, DEX and CON checks: disadvantage',
      'STR, DEX and CON saves: disadvantage',
    ]);
    const reminders = rollReminders([], 0, true);
    expect(saveTag(reminders, 'CON')).toBe('Disadvantage');
    expect(saveTag(reminders, 'WIS')).toBeUndefined();
  });
});
