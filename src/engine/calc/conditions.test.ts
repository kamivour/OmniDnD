import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../rules2014';
import { CONDITION_ROLLS, cancels, rollReminders, saveRollState } from './conditions';

describe('condition roll reminders (2014)', () => {
  it('covers every condition', () => {
    expect(Object.keys(CONDITION_ROLLS).sort()).toEqual([...CONDITIONS].sort());
  });

  it('poisoned gives disadvantage on attacks and checks, not saves', () => {
    const reminders = rollReminders(['poisoned'], 0);
    expect(reminders.map(({ roll, mode }) => `${roll}:${mode}`)).toEqual([
      'attacks:disadvantage',
      'checks:disadvantage',
    ]);
    expect(saveRollState(reminders, 'CON')).toEqual({
      autoFail: false,
      advantage: false,
      disadvantage: false,
    });
  });

  it('stunned and unconscious fail only STR and DEX saves', () => {
    const reminders = rollReminders(['stunned'], 0);
    expect(saveRollState(reminders, 'STR').autoFail).toBe(true);
    expect(saveRollState(reminders, 'DEX').autoFail).toBe(true);
    expect(saveRollState(reminders, 'WIS').autoFail).toBe(false);
  });

  it('restrained gives disadvantage on DEX saves only', () => {
    const reminders = rollReminders(['restrained'], 0);
    expect(saveRollState(reminders, 'DEX').disadvantage).toBe(true);
    expect(saveRollState(reminders, 'STR').disadvantage).toBe(false);
  });

  it('exhaustion adds check disadvantage at 1 and attack and save disadvantage at 3', () => {
    expect(rollReminders([], 2).map(({ roll }) => roll)).toEqual(['checks']);
    const level3 = rollReminders([], 3);
    expect(level3.map(({ roll }) => roll)).toEqual(['checks', 'attacks', 'saves']);
    expect(level3.every(({ source }) => source === 'exhaustion 3')).toBe(true);
    expect(saveRollState(level3, 'WIS').disadvantage).toBe(true);
  });

  it('plain advantage and disadvantage on the same roll cancel', () => {
    expect(cancels(rollReminders(['invisible', 'poisoned'], 0), 'attacks')).toBe(true);
    expect(cancels(rollReminders(['poisoned'], 0), 'attacks')).toBe(false);
  });

  it('situational reminders do not cancel or count as unconditional', () => {
    // Prone: advantage within 5 ft, disadvantage farther away; the player judges which.
    expect(cancels(rollReminders(['prone'], 0), 'attacked')).toBe(false);
    const frightened = rollReminders(['frightened'], 0);
    expect(frightened.every(({ when }) => when === 'the source of fear is in sight')).toBe(true);
  });
});
