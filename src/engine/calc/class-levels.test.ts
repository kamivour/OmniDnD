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

describe('passive feature numbers', () => {
  const withSubclass = (
    classId: string,
    subclassId: string,
    level: number,
    gear: string[] = [],
  ) => {
    const state = at(classId, level, gear);
    state.build.classes = [{ classId, subclassId, level }];
    return state;
  };

  it('Draconic Resilience adds 1 HP per sorcerer level and sets unarmored AC to 13 + DEX', () => {
    const plain = computeSheet(at('class.sorcerer', 3), registry);
    const dragon = computeSheet(
      withSubclass('class.sorcerer', 'subclass.sorcerer.draconic', 3),
      registry,
    );
    expect(dragon.maxHp.value - plain.maxHp.value).toBe(3);
    expect(dragon.ac.value).toBe(15);
    expect(dragon.ac.parts).toContainEqual({ label: 'Draconic Resilience', value: 13 });
    const armored = computeSheet(
      withSubclass('class.sorcerer', 'subclass.sorcerer.draconic', 3, ['item.leather-armor']),
      registry,
    );
    expect(armored.ac.value).toBe(13);
  });

  it('Hill Dwarf adds 1 HP per character level', () => {
    const state = at('class.fighter', 4);
    state.build.raceId = 'race.dwarf';
    state.build.subraceId = 'race.hill-dwarf';
    const before = computeSheet(at('class.fighter', 4), registry).maxHp.value;
    const sheet = computeSheet(state, registry);
    expect(sheet.maxHp.parts).toContainEqual({ label: 'Dwarven Toughness', value: 4 });
    expect(sheet.maxHp.value).toBe(before + 4);
  });

  it('Fast Movement needs no heavy armor; Unarmored Movement needs no armor or shield', () => {
    const speed = (classId: string, level: number, gear: string[] = []) =>
      sheetAt(classId, level, gear).speed.value;
    const base = speed('class.fighter', 5);
    expect(speed('class.barbarian', 5)).toBe(base + 10);
    expect(speed('class.barbarian', 5, ['item.chain-mail'])).toBeLessThanOrEqual(base);
    expect(speed('class.monk', 2)).toBe(base + 10);
    expect(speed('class.monk', 2, ['item.shield'])).toBe(base);
    expect(speed('class.monk', 5)).toBe(base + 15);
  });

  it('Diamond Soul gives proficiency in every save; Slippery Mind gives WIS', () => {
    const monk = sheetAt('class.monk', 14).saves;
    expect(Object.values(monk).every((save) => save.proficient)).toBe(true);
    expect(sheetAt('class.rogue', 15).saves.WIS.proficient).toBe(true);
    expect(sheetAt('class.rogue', 14).saves.WIS.proficient).toBe(false);
  });

  it('Aura of Protection adds CHA to every save', () => {
    const before = sheetAt('class.paladin', 5).saves.STR.value;
    const after = sheetAt('class.paladin', 6).saves.STR;
    expect(after.parts).toContainEqual({ label: 'Aura of Protection', value: 5 });
    expect(after.value).toBe(before + 5);
  });

  it('Defense style adds 1 AC in armor, and Medium Armor Master raises the DEX cap to 3', () => {
    const state = at('class.fighter', 1, ['item.scale-mail']);
    state.build.abilityScores = {
      ...state.build.abilityScores,
      base: { ...state.build.abilityScores.base, DEX: 16 },
    };
    const ac = () => computeSheet(state, registry).ac.value;
    const plain = ac();
    state.build.featureIds = ['feature.fighter.fighting-style-defense'];
    expect(ac()).toBe(plain + 1);
    state.build.featureIds = ['feature.feat.medium-armor-master'];
    expect(ac()).toBe(plain + 1);
  });
});

const FULL_CASTERS = ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'];

describe.each(FULL_CASTERS)('%s levels 1–20', (name) => {
  it('computes a sheet at every level', () => {
    for (let level = 1; level <= 20; level++) {
      const sheet = sheetAt(`class.${name}`, level);
      expect(sheet.level).toBe(level);
      expect(sheet.maxHp.value).toBeGreaterThan(0);
    }
  });
});

describe('full caster slots and pools', () => {
  const slots = (classId: string, level: number) => sheetAt(classId, level).slots.max.slice(1, 10);

  it.each(['class.bard', 'class.cleric', 'class.druid', 'class.sorcerer', 'class.wizard'])(
    '%s follows the full-caster table',
    (classId) => {
      expect(slots(classId, 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(slots(classId, 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
      expect(slots(classId, 11)).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
      expect(slots(classId, 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    },
  );

  it('Warlock uses Pact Magic slots, not the shared table', () => {
    const pact = (level: number) => sheetAt('class.warlock', level).slots.pact;
    expect(pact(1)).toEqual({ count: 1, level: 1 });
    expect(pact(2)).toEqual({ count: 2, level: 1 });
    expect(pact(5)).toEqual({ count: 2, level: 3 });
    expect(pact(11)).toEqual({ count: 3, level: 5 });
    expect(pact(17)).toEqual({ count: 4, level: 5 });
    expect(slots('class.warlock', 11)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('Sorcery Points, Channel Divinity and Wild Shape follow the class', () => {
    const uses = (classId: string, level: number, id: string) =>
      feature(classId, level, id)?.uses?.max;
    expect([2, 10, 20].map((l) => uses('class.sorcerer', l, 'sorcerer.font-of-magic'))).toEqual([
      2, 10, 20,
    ]);
    expect([2, 6, 18].map((l) => uses('class.cleric', l, 'cleric.channel-divinity'))).toEqual([
      1, 2, 3,
    ]);
    expect(feature('class.cleric', 10, 'cleric.divine-intervention')?.uses?.max).toBe(1);
    expect(uses('class.druid', 2, 'druid.wild-shape')).toBe(2);
  });

  it('Mystic Arcanum and Signature Spell are limited pools', () => {
    const arcanum = [10, 11, 13, 15, 17].map(
      (l) => feature('class.warlock', l, 'warlock.mystic-arcanum')?.uses?.max,
    );
    expect(arcanum).toEqual([undefined, 1, 2, 3, 4]);
    expect(feature('class.wizard', 20, 'wizard.signature-spell')?.uses).toEqual({
      max: 2,
      recharge: 'short',
    });
  });
});
