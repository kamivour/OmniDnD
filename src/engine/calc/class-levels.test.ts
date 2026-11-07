import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { ExportFileSchema } from '../schema';
import { computeSheet, type CharacterState } from './sheet';

const fool = ExportFileSchema.parse(seed);

/** The Fool's abilities with one class at one level, nothing equipped except what the test adds. */
function at(classId: string, level: number, gear: string[] = []): CharacterState {
  const items = Object.fromEntries(
    Object.entries(fool.live.items).map(([id, item]) => [id, { ...item, equipped: false }]),
  );
  for (const itemId of gear) items[`${itemId}-t`] = { qty: 1, equipped: true, attuned: false };
  const die = registry.get('class', classId).hitDie;
  return {
    campaign: fool.campaign,
    build: {
      ...fool.build,
      classes: [{ classId, level }],
      hpEntries: Array.from({ length: level }, (_, index) => ({
        level: index + 1,
        classId,
        value: Number(die.slice(1)),
        method: 'max' as const,
      })),
      spells: [],
      items: gear.map((itemId) => ({ instanceId: `${itemId}-t`, itemId })),
    },
    live: { ...fool.live, items },
  };
}

const sheetAt = (classId: string, level: number, gear?: string[]) =>
  computeSheet(at(classId, level, gear), registry);
const feature = (classId: string, level: number, id: string) =>
  sheetAt(classId, level).features.find(({ def }) => def.id === `feature.${id}`);

const MARTIAL = ['barbarian', 'fighter', 'monk', 'paladin', 'ranger', 'rogue'];

describe.each(MARTIAL)('%s levels 1–20', (name) => {
  const classId = `class.${name}`;
  it('computes a sheet with every class feature up to the level', () => {
    const rows = registry.get('class', classId).features;
    for (let level = 1; level <= 20; level++) {
      const sheet = sheetAt(classId, level);
      expect(sheet.level).toBe(level);
      const ids = new Set(sheet.features.map(({ def }) => def.id));
      for (const id of new Set(rows.map((row) => row.featureId)))
        expect(ids.has(id)).toBe(rows.some((row) => row.featureId === id && row.level <= level));
      expect(sheet.maxHp.value).toBeGreaterThan(0);
    }
  });
});

describe('martial resources and scaling', () => {
  it('Barbarian rage uses and damage follow the class table', () => {
    const uses = [1, 3, 6, 12, 17].map(
      (l) => feature('class.barbarian', l, 'barbarian.rage')?.uses?.max,
    );
    expect(uses).toEqual([2, 3, 4, 5, 6]);
    const damage = [1, 8, 9, 15, 16, 20].map(
      (l) => feature('class.barbarian', l, 'barbarian.rage')?.bonus,
    );
    expect(damage).toEqual([2, 2, 3, 3, 4, 4]);
  });

  it('Fighter Action Surge and Indomitable scale', () => {
    const surge = (l: number) => feature('class.fighter', l, 'fighter.action-surge')?.uses?.max;
    expect([surge(1), surge(2), surge(16), surge(17)]).toEqual([undefined, 1, 1, 2]);
    const indomitable = (l: number) =>
      feature('class.fighter', l, 'fighter.indomitable')?.uses?.max;
    expect([indomitable(8), indomitable(9), indomitable(13), indomitable(17)]).toEqual([
      undefined,
      1,
      2,
      3,
    ]);
  });

  it('Monk martial arts die, ki and movement scale', () => {
    const die = [1, 4, 5, 10, 11, 17].map(
      (l) => feature('class.monk', l, 'monk.martial-arts')?.die,
    );
    expect(die).toEqual(['d4', 'd4', 'd6', 'd6', 'd8', 'd10']);
    expect([2, 9, 20].map((l) => feature('class.monk', l, 'monk.ki')?.uses?.max)).toEqual([
      2, 9, 20,
    ]);
    const move = [2, 5, 9, 13, 17].map(
      (l) => feature('class.monk', l, 'monk.unarmored-movement')?.bonus,
    );
    expect(move).toEqual([10, 15, 20, 25, 30]);
  });

  it('Rogue sneak attack adds a d6 every two levels', () => {
    const dice = [1, 2, 3, 5, 11, 19, 20].map(
      (l) => feature('class.rogue', l, 'rogue.sneak-attack')?.dice,
    );
    expect(dice).toEqual(['1d6', '1d6', '2d6', '3d6', '6d6', '10d6', '10d6']);
  });

  it('Paladin pools follow level and Charisma', () => {
    expect(feature('class.paladin', 1, 'paladin.lay-on-hands')?.uses?.max).toBe(5);
    expect(feature('class.paladin', 20, 'paladin.lay-on-hands')?.uses?.max).toBe(100);
    // The Fool's CHA is 20 (+5): Divine Sense is 1 + CHA.
    expect(feature('class.paladin', 1, 'paladin.divine-sense')?.uses?.max).toBe(6);
  });
});

describe('half-caster spell slots', () => {
  const slots = (classId: string, level: number) => sheetAt(classId, level).slots.max.slice(1, 6);
  it.each(['class.paladin', 'class.ranger'])('%s follows the half-caster table', (classId) => {
    expect(slots(classId, 1)).toEqual([0, 0, 0, 0, 0]);
    expect(slots(classId, 2)).toEqual([2, 0, 0, 0, 0]);
    expect(slots(classId, 5)).toEqual([4, 2, 0, 0, 0]);
    expect(slots(classId, 9)).toEqual([4, 3, 2, 0, 0]);
    expect(slots(classId, 13)).toEqual([4, 3, 3, 1, 0]);
    expect(slots(classId, 17)).toEqual([4, 3, 3, 3, 1]);
    expect(slots(classId, 20)).toEqual([4, 3, 3, 3, 2]);
  });
});

describe('Unarmored Defense', () => {
  // The Fool's scores: DEX 15 (+2), CON 13 (+1), WIS 12 (+1).
  const strong = (classId: string, gear: string[] = []) => {
    const state = at(classId, 1, gear);
    state.build.abilityScores = {
      ...state.build.abilityScores,
      base: { STR: 11, DEX: 14, CON: 16, INT: 12, WIS: 16, CHA: 18 },
    };
    return computeSheet(state, registry).ac;
  };

  it('Barbarian adds CON, with or without a shield, but not in armor', () => {
    expect(strong('class.barbarian').value).toBe(15);
    expect(strong('class.barbarian', ['item.shield']).value).toBe(17);
    expect(strong('class.barbarian').parts).toContainEqual({
      label: 'Unarmored Defense (CON)',
      value: 3,
    });
    expect(strong('class.barbarian', ['item.leather-armor']).value).toBe(13);
  });

  it('Monk adds WIS only with no armor and no shield', () => {
    expect(strong('class.monk').value).toBe(15);
    expect(strong('class.monk', ['item.shield']).value).toBe(14);
    expect(strong('class.fighter').value).toBe(12);
  });
});
