import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { ExportFileSchema, type ActiveEffect } from '../schema';
import { computeSheet, type CharacterState } from './sheet';

const fool = ExportFileSchema.parse(seed);
const state: CharacterState = { campaign: fool.campaign, build: fool.build, live: fool.live };
const sheet = computeSheet(state, registry);

/** The Fool with extra items equipped and every other armor taken off. */
function wearing(...itemIds: string[]): CharacterState {
  const items = Object.fromEntries(
    Object.entries(state.live.items).map(([id, item]) => [
      id,
      { ...item, equipped: item.equipped && !id.includes('armor') },
    ]),
  );
  for (const itemId of itemIds) {
    items[`${itemId}-test`] = { qty: 1, equipped: true, attuned: false };
  }
  return {
    ...state,
    build: {
      ...state.build,
      items: [
        ...state.build.items,
        ...itemIds.map((itemId) => ({ instanceId: `${itemId}-test`, itemId })),
      ],
    },
    live: { ...state.live, items },
  };
}

const effect = (fields: Partial<ActiveEffect>): ActiveEffect => ({
  id: 'effect-1',
  name: 'Test effect',
  concentration: false,
  conditions: [],
  modifiers: [],
  ...fields,
});

describe('computeSheet: The Fool (TEST_CHARACTER §4)', () => {
  it('computes ability scores, modifiers, and proficiency', () => {
    expect(sheet.level).toBe(3);
    expect(sheet.proficiency).toBe(2);
    expect(Object.values(sheet.abilities).map(({ mod }) => mod)).toEqual([0, 2, 1, 1, 1, 5]);
    expect(sheet.abilities.CHA.score).toEqual({
      value: 20,
      parts: [
        { label: 'Base', value: 18 },
        { label: 'Half-Elf', value: 2 },
      ],
    });
  });

  it('computes saving throws', () => {
    const values = Object.fromEntries(
      Object.entries(sheet.saves).map(([ability, save]) => [ability, save.value]),
    );
    expect(values).toEqual({ STR: 0, DEX: 4, CON: 1, INT: 1, WIS: 1, CHA: 7 });
    expect(sheet.saves.DEX.proficient).toBe(true);
    expect(sheet.saves.STR.proficient).toBe(false);
  });

  it('computes all 18 skills, with expertise and Jack of All Trades', () => {
    const values = Object.fromEntries(
      Object.entries(sheet.skills).map(([skill, stat]) => [skill, stat.value]),
    );
    expect(values).toEqual({
      acrobatics: 4,
      'animal-handling': 2,
      arcana: 2,
      athletics: 1,
      deception: 9,
      history: 2,
      insight: 3,
      intimidation: 7,
      investigation: 3,
      medicine: 2,
      nature: 2,
      perception: 3,
      performance: 7,
      persuasion: 7,
      religion: 2,
      'sleight-of-hand': 6,
      stealth: 4,
      survival: 2,
    });
    expect(sheet.skills.deception.proficiency).toBe('expertise');
    expect(sheet.skills.stealth.proficiency).toBe('proficient');
    expect(sheet.skills.athletics).toEqual({
      value: 1,
      proficiency: 'none',
      parts: [
        { label: 'STR', value: 0 },
        { label: 'Jack of All Trades', value: 1 },
      ],
    });
  });

  it('computes passives and initiative (JoAT adds to initiative, D51)', () => {
    expect(sheet.passives.perception.value).toBe(13);
    expect(sheet.passives.investigation.value).toBe(13);
    expect(sheet.passives.insight.value).toBe(13);
    expect(sheet.initiative).toEqual({
      value: 3,
      parts: [
        { label: 'DEX', value: 2 },
        { label: 'Jack of All Trades', value: 1 },
      ],
    });
  });

  it('computes AC, speed, darkvision, and carrying capacity', () => {
    expect(sheet.ac).toEqual({
      value: 13,
      parts: [
        { label: 'Leather Armor', value: 11 },
        { label: 'DEX', value: 2 },
      ],
    });
    expect(sheet.speed.value).toBe(30);
    expect(sheet.darkvision).toBe(60);
    expect(sheet.carryingCapacity).toBe(165);
  });

  it('computes max HP per level and the Hit Dice pool', () => {
    expect(sheet.maxHp).toEqual({
      value: 19,
      parts: [
        { label: 'Level 1', value: 9 },
        { label: 'Level 2', value: 5 },
        { label: 'Level 3', value: 5 },
      ],
    });
    expect(sheet.hitDice).toEqual([{ die: 'd8', max: 3 }]);
  });

  it('computes spellcasting, known counts, and slots', () => {
    expect(sheet.spellcasting).toEqual([
      expect.objectContaining({
        classId: 'class.bard',
        ability: 'CHA',
        saveDc: expect.objectContaining({ value: 15 }),
        attack: expect.objectContaining({ value: 7 }),
        cantripsKnown: 2,
        spellsKnown: 6,
      }),
    ]);
    expect(sheet.slots.max).toEqual([0, 4, 2, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('computes weapon attacks for equipped weapons', () => {
    expect(sheet.attacks).toEqual([
      expect.objectContaining({
        name: 'Rapier',
        ability: 'DEX',
        proficient: true,
        toHit: expect.objectContaining({ value: 4 }),
        damage: { dice: '1d8', bonus: 2, type: 'piercing' },
      }),
      expect.objectContaining({
        name: 'Dagger',
        toHit: expect.objectContaining({ value: 4 }),
        damage: { dice: '1d4', bonus: 2, type: 'piercing' },
        range: { normal: 20, long: 60 },
      }),
    ]);
  });

  it('lists features with resolved uses', () => {
    const inspiration = sheet.features.find(
      ({ def }) => def.id === 'feature.bard.bardic-inspiration',
    );
    expect(inspiration).toMatchObject({ uses: { max: 5, recharge: 'long' }, die: 'd6' });
    const song = sheet.features.find(({ def }) => def.id === 'feature.bard.song-of-rest');
    expect(song).toMatchObject({ die: 'd6' });
  });
});

describe('computeSheet: changes', () => {
  it('applies a CON change to every level of max HP', () => {
    const con14 = computeSheet(
      {
        ...state,
        build: {
          ...state.build,
          abilityScores: {
            ...state.build.abilityScores,
            base: { ...state.build.abilityScores.base, CON: 13 },
          },
        },
      },
      registry,
    );
    expect(con14.maxHp.value).toBe(22);
  });

  it('adds one HP entry and one Hit Die on level-up to 4', () => {
    const bard4 = computeSheet(
      {
        ...state,
        build: {
          ...state.build,
          classes: state.build.classes.map((entry) => ({ ...entry, level: 4 })),
          hpEntries: [
            ...state.build.hpEntries,
            { level: 4, classId: 'class.bard', value: 5, method: 'rolled' },
          ],
        },
      },
      registry,
    );
    expect(bard4.maxHp.value).toBe(25);
    expect(bard4.hitDice).toEqual([{ die: 'd8', max: 4 }]);
  });

  it('applies exhaustion to speed and max HP', () => {
    const at = (exhaustion: number) =>
      computeSheet({ ...state, live: { ...state.live, exhaustion } }, registry);
    expect(at(1).speed.value).toBe(30);
    expect(at(2).speed.value).toBe(15);
    expect(at(3).maxHp.value).toBe(19);
    expect(at(4).maxHp.value).toBe(9);
    expect(at(5).speed.value).toBe(0);
  });

  it('sets speed to 0 for a condition from live state or an effect', () => {
    const grappled = computeSheet(
      { ...state, live: { ...state.live, conditions: ['grappled'] } },
      registry,
    );
    expect(grappled.speed.value).toBe(0);
    expect(grappled.speed.parts.at(-1)).toEqual({ label: 'grappled', value: -30 });

    const webbed = computeSheet(
      { ...state, live: { ...state.live, effects: [effect({ conditions: ['restrained'] })] } },
      registry,
    );
    expect(webbed.speed.value).toBe(0);
    expect(webbed.conditions).toEqual(['restrained']);
  });

  it('adds effect modifiers with the effect name as the label', () => {
    const shielded = computeSheet(
      {
        ...state,
        live: {
          ...state.live,
          effects: [effect({ name: 'Shield of Faith', modifiers: [{ target: 'ac', value: 2 }] })],
        },
      },
      registry,
    );
    expect(shielded.ac.value).toBe(15);
    expect(shielded.ac.parts.at(-1)).toEqual({ label: 'Shield of Faith', value: 2 });
  });

  it('uses 10 + DEX without armor and adds a shield', () => {
    expect(computeSheet(wearing(), registry).ac.value).toBe(12);
    expect(computeSheet(wearing('item.shield'), registry).ac.value).toBe(14);
  });

  it('caps DEX for medium armor and ignores it for heavy armor', () => {
    const dex18 = (character: CharacterState): CharacterState => ({
      ...character,
      build: {
        ...character.build,
        abilityScores: {
          ...character.build.abilityScores,
          base: { ...character.build.abilityScores.base, DEX: 18 },
        },
      },
    });
    // DEX 19 (+4): hide armor 12 + 2.
    expect(computeSheet(dex18(wearing('item.hide-armor')), registry).ac.value).toBe(14);
    expect(computeSheet(dex18(wearing('item.chain-mail')), registry).ac.value).toBe(16);
  });

  it('slows a wearer of heavy armor below its STR requirement', () => {
    // STR 11 < 13 for chain mail.
    const speed = computeSheet(wearing('item.chain-mail'), registry).speed;
    expect(speed.value).toBe(20);
    expect(speed.parts.at(-1)).toEqual({ label: 'Chain Mail (STR 13)', value: -10 });
  });

  it('handles ranged, unproficient, and flat-damage weapons', () => {
    const blowgun = computeSheet(wearing('item.blowgun'), registry).attacks.find(
      (attack) => attack.itemId === 'item.blowgun',
    );
    // Martial ranged weapon: DEX, not proficient, flat 1 damage + DEX.
    expect(blowgun).toMatchObject({
      ability: 'DEX',
      proficient: false,
      toHit: { value: 2 },
      damage: { bonus: 3, type: 'piercing' },
    });
    expect(blowgun?.damage?.dice).toBeUndefined();
  });
});
