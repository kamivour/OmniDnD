import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { physicalNumbers } from './physical';
import { computeSheet, type CharacterState, type Sheet } from './sheet';

function sheetWith(str: number, con = 10, extra: string[] = []): Sheet {
  const state: CharacterState = structuredClone(seedFile);
  state.build.abilityScores.base.STR = str;
  state.build.abilityScores.base.CON = con;
  const sheet = computeSheet(state, registry);
  const fake = extra.map((id) => ({ def: { id }, level: 1 }));
  return { ...sheet, features: [...sheet.features, ...fake] } as unknown as Sheet;
}

describe('body numbers (2014)', () => {
  it('derives jumps from STR and carry from capacity', () => {
    const sheet = sheetWith(16);
    const mod = sheet.abilities.STR.mod;
    const n = physicalNumbers(sheet, []);
    expect(n.longJumpRunning.value).toBe(sheet.abilities.STR.score.value);
    expect(n.longJumpStanding.value).toBe(Math.floor(sheet.abilities.STR.score.value / 2));
    expect(n.highJumpRunning.value).toBe(3 + mod);
    expect(n.highJumpStanding.value).toBe(Math.floor((3 + mod) / 2));
    expect(n.pushDragLift.value).toBe(sheet.carryingCapacity * 2);
    expect(n.runUpFeet).toBe(10);
  });

  it('floors a weak character at zero feet', () => {
    const n = physicalNumbers(sheetWith(1), []);
    expect(n.highJumpRunning.value).toBeGreaterThanOrEqual(0);
    expect(n.highJumpStanding.value).toBeGreaterThanOrEqual(0);
  });

  it('handles STR 8 and STR 20', () => {
    const weak = sheetWith(8);
    const strong = sheetWith(20);
    const w = physicalNumbers(weak, []);
    const s = physicalNumbers(strong, []);
    expect(s.longJumpRunning.value).toBeGreaterThan(w.longJumpRunning.value);
    expect(s.pushDragLift.value).toBeGreaterThan(w.pushDragLift.value);
    expect(w.highJumpRunning.value).toBe(3 + weak.abilities.STR.mod);
  });

  it('computes breath, choking and food from CON with minimums', () => {
    const tough = physicalNumbers(sheetWith(10, 16), []);
    expect(tough.holdBreathSeconds.value).toBe(4 * 60);
    expect(tough.chokingRounds.value).toBe(3);
    expect(tough.daysWithoutFood.value).toBe(6);
    const frail = physicalNumbers(sheetWith(10, 3), []);
    expect(frail.holdBreathSeconds.value).toBe(30);
    expect(frail.chokingRounds.value).toBe(1);
    expect(frail.daysWithoutFood.value).toBe(1);
  });

  it('halves walking speed for climbing and swimming', () => {
    const sheet = sheetWith(10);
    const n = physicalNumbers(sheet, []);
    expect(n.climbSpeed.value).toBe(Math.floor(sheet.speed.value / 2));
    expect(n.swimSpeed.parts[0]?.label).toBe('Half of walking speed');
  });

  it('applies Remarkable Athlete to the running long jump only', () => {
    const base = physicalNumbers(sheetWith(16), []);
    const sheet = sheetWith(16, 10, ['feature.fighter.remarkable-athlete']);
    const n = physicalNumbers(sheet, []);
    expect(n.longJumpRunning.value).toBe(base.longJumpRunning.value + sheet.abilities.STR.mod);
    expect(n.longJumpStanding.value).toBe(base.longJumpStanding.value);
  });

  it('triples distances under an active Jump spell', () => {
    const sheet = sheetWith(16);
    const base = physicalNumbers(sheet, []);
    const n = physicalNumbers(sheet, ['spell.jump']);
    expect(n.longJumpRunning.value).toBe(base.longJumpRunning.value * 3);
    expect(n.highJumpRunning.value).toBe(base.highJumpRunning.value * 3);
    expect(n.longJumpRunning.parts.at(-1)?.label).toBe('Jump spell (x3)');
  });

  it('shortens the run-up with the Athlete feat and reminds about Step of the Wind', () => {
    const n = physicalNumbers(
      sheetWith(10, 10, ['feature.feat.athlete', 'feature.monk.step-of-the-wind']),
      [],
    );
    expect(n.runUpFeet).toBe(5);
    expect(n.reminders.join(' ')).toContain('Step of the Wind');
  });
});
