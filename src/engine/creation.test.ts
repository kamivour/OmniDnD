import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { registry } from '../data/registry';
import { seedFile } from '../data/seed';
import { computeSheet } from './calc/sheet';
import { createCharacter, xpForLevel, type CreateCharacterInput } from './creation';
import { buildRegistry } from './registry';
import { ExportFileSchema, type RefEntry } from './schema';

function input(patch: Partial<CreateCharacterInput> = {}): CreateCharacterInput {
  return {
    id: 'new-character',
    name: ' New adventurer ',
    campaign: structuredClone(seedFile.campaign),
    raceId: 'race.half-elf',
    classId: 'class.bard',
    backgroundId: 'background.charlatan',
    level: 3,
    abilityBases: { STR: 11, DEX: 14, CON: 12, INT: 12, WIS: 12, CHA: 18 },
    racialChoices: ['DEX', 'CON'],
    hpRolls: [4, 4],
    ...patch,
  };
}

function withAbilityMethod(method: CreateCharacterInput['campaign']['abilityMethod']) {
  return { ...seedFile.campaign, abilityMethod: method };
}

describe('createCharacter', () => {
  it('derives Fool-like HP, racial bonuses, fixed grants and full resource pools', () => {
    const choices = input({ alignment: 'Chaotic Neutral' });
    const created = createCharacter(choices, registry);
    const sheet = computeSheet({ campaign: choices.campaign, ...created }, registry);
    expect(created.build).toMatchObject({
      id: choices.id,
      campaignId: choices.campaign.id,
      name: 'New adventurer',
      alignment: 'Chaotic Neutral',
      classes: [{ classId: 'class.bard', level: 3 }],
      proficiencies: {
        saves: ['DEX', 'CHA'],
        skills: ['deception', 'sleight-of-hand'],
        tools: ['item.disguise-kit', 'item.forgery-kit'],
        languages: ['Common', 'Elvish'],
        expertise: [],
      },
      spells: [],
      items: [],
      choices: {},
    });
    expect(created.build.abilityScores).toEqual({
      base: choices.abilityBases,
      bonuses: [
        { source: 'race.half-elf', ability: 'CHA', value: 2 },
        { source: 'race.half-elf', ability: 'DEX', value: 1 },
        { source: 'race.half-elf', ability: 'CON', value: 1 },
      ],
    });
    expect(created.build.hpEntries).toEqual([
      { classId: 'class.bard', level: 1, value: 8, method: 'max' },
      { classId: 'class.bard', level: 2, value: 4, method: 'rolled' },
      { classId: 'class.bard', level: 3, value: 4, method: 'rolled' },
    ]);
    expect(sheet.maxHp.value).toBe(19);
    expect(sheet.hitDice).toEqual([{ die: 'd8', max: 3 }]);
    expect(sheet.slots).toMatchObject({ max: [0, 4, 2, 0, 0, 0, 0, 0, 0, 0] });
    expect(
      sheet.features.find((feature) => feature.def.id === 'feature.bard.bardic-inspiration')?.uses,
    ).toEqual({ max: 5, recharge: 'long' });
    expect(created.live).toEqual({
      characterId: choices.id,
      schemaVersion: 1,
      hp: 19,
      tempHp: 0,
      deathSaves: { success: 0, fail: 0 },
      hitDiceSpent: {},
      slotsUsed: Array<number>(10).fill(0),
      featureUsesSpent: {},
      effects: [],
      conditions: [],
      exhaustion: 0,
      items: {},
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      clock: { seconds: 28800 },
    });
    expect(created.events).toEqual([]);
    expect(
      ExportFileSchema.safeParse({
        app: 'omnidnd',
        schemaVersion: 1,
        exportedAt: '2026-11-02T00:00:00Z',
        campaign: choices.campaign,
        ...created,
      }).success,
    ).toBe(true);
  });

  it('takes level 1 maximum and later averages from the selected class die', () => {
    const created = createCharacter(
      input({
        classId: 'class.fighter',
        campaign: { ...seedFile.campaign, hpMethod: 'average' },
        hpRolls: [],
      }),
      registry,
    );
    expect(created.build.hpEntries.map(({ value, method }) => ({ value, method }))).toEqual([
      { value: 10, method: 'max' },
      { value: 6, method: 'average' },
      { value: 6, method: 'average' },
    ]);
    expect(created.live.hp).toBe(25);
    expect(created.build.proficiencies.saves).toEqual(['STR', 'CON']);
    expect(createCharacter(input({ level: 1, hpRolls: undefined }), registry).live.hp).toBe(9);
  });

  it('applies the campaign floor to low HP rolls with a negative CON modifier', () => {
    const choices = input({
      abilityBases: { STR: 10, DEX: 10, CON: 3, INT: 10, WIS: 10, CHA: 10 },
      hpRolls: [1, 1],
    });
    expect(createCharacter(choices, registry).live.hp).toBe(1);
    expect(
      createCharacter(
        { ...choices, campaign: { ...choices.campaign, hpLevelFloor: 'one' } },
        registry,
      ).live.hp,
    ).toBe(7);
  });

  it('enforces all six standard-array scores exactly once, before racial bonuses', () => {
    const choices = input({
      campaign: withAbilityMethod('standard-array'),
      abilityBases: { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 13 },
    });
    expect(createCharacter(choices, registry).build.abilityScores.base).toEqual(
      choices.abilityBases,
    );
    expect(() =>
      createCharacter({ ...choices, abilityBases: { ...choices.abilityBases, WIS: 13 } }, registry),
    ).toThrow('Assign each standard-array score once');
  });

  it('accepts a 27-point purchase, including the nonlinear 14/15 costs, or unused points', () => {
    const choices = input({
      campaign: withAbilityMethod('point-buy'),
      abilityBases: { STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 },
    });
    expect(createCharacter(choices, registry).build.abilityScores.base).toEqual(
      choices.abilityBases,
    );
    expect(
      createCharacter(
        { ...choices, abilityBases: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 } },
        registry,
      ).build.abilityScores.base.STR,
    ).toBe(8);
    expect(() =>
      createCharacter({ ...choices, abilityBases: { ...choices.abilityBases, INT: 9 } }, registry),
    ).toThrow('more than 27 points');
    expect(() =>
      createCharacter({ ...choices, abilityBases: { ...choices.abilityBases, STR: 16 } }, registry),
    ).toThrow('between 8 and 15');
    expect(() =>
      createCharacter({ ...choices, abilityBases: { ...choices.abilityBases, STR: 7 } }, registry),
    ).toThrow('between 8 and 15');
  });

  it.each([2, 19, 10.5, NaN])('rejects invalid rolled base score %s', (score) => {
    const choices = input();
    choices.abilityBases.CON = score;
    expect(() => createCharacter(choices, registry)).toThrow(ZodError);
  });

  it.each([[], [4], [4, 4, 4], [0, 4], [9, 4], [4.5, 4]].map((hpRolls) => ({ hpRolls })))(
    'rejects missing or invalid HP dice $hpRolls',
    ({ hpRolls }) => {
      expect(() => createCharacter(input({ hpRolls }), registry)).toThrow(ZodError);
    },
  );

  it('accepts die endpoints and rejects rolls for an average campaign', () => {
    expect(createCharacter(input({ hpRolls: [1, 8] }), registry).live.hp).toBe(20);
    expect(() =>
      createCharacter(input({ campaign: { ...seedFile.campaign, hpMethod: 'average' } }), registry),
    ).toThrow('do not supply HP rolls');
  });

  it.each<{ racialChoices?: CreateCharacterInput['racialChoices'] }>([
    {},
    { racialChoices: ['CON'] },
    { racialChoices: ['DEX', 'DEX'] },
    { racialChoices: ['CHA', 'CON'] },
    { racialChoices: ['DEX', 'CON', 'STR'] },
  ])('requires distinct eligible racial ability choices: $racialChoices', ({ racialChoices }) => {
    expect(() => createCharacter(input({ racialChoices }), registry)).toThrow(
      'eligible racial bonus abilities',
    );
  });

  it('derives fixed bonuses without making any optional choice for a human', () => {
    const created = createCharacter(
      input({ raceId: 'race.human', racialChoices: undefined }),
      registry,
    );
    expect(created.build.abilityScores.bonuses).toHaveLength(6);
    expect(created.build.proficiencies.languages).toEqual(['Common']);
    expect(() =>
      createCharacter(input({ raceId: 'race.human', racialChoices: ['DEX'] }), registry),
    ).toThrow('Choose 0');
  });

  it('omits XP in milestone campaigns and initializes an XP campaign at the chosen level threshold', () => {
    expect(createCharacter(input(), registry).build).not.toHaveProperty('xp');
    expect(
      createCharacter(input({ campaign: { ...seedFile.campaign, leveling: 'xp' } }), registry).build
        .xp,
    ).toBe(900);
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(5)).toBe(6500);
    expect(xpForLevel(20)).toBe(355000);
    expect(() => xpForLevel(0)).toThrow(ZodError);
    expect(() => xpForLevel(21)).toThrow(ZodError);
  });

  it('starts Pact Magic unspent without assigning spells or a patron', () => {
    const choices = input({ classId: 'class.warlock' });
    const created = createCharacter(choices, registry);
    expect(created.live.pactSlotsUsed).toBe(0);
    expect(computeSheet({ campaign: choices.campaign, ...created }, registry).slots.pact).toEqual({
      count: 2,
      level: 2,
    });
    expect(created.build.classes[0]?.subclassId).toBeUndefined();
    expect(created.build.spells).toEqual([]);
  });

  it.each(['raceId', 'classId', 'backgroundId'] as const)(
    'rejects unknown and disabled %s references',
    (field) => {
      const choices = input();
      const kind = field.slice(0, -2);
      expect(() => createCharacter({ ...choices, [field]: `${kind}.missing` }, registry)).toThrow(
        `Unknown ${kind} reference`,
      );
      const entries: RefEntry[] = [...registry.entries.values()].map((entry) =>
        entry.id === choices[field] ? { ...entry, source: 'HB' } : entry,
      );
      expect(() => createCharacter(choices, buildRegistry([entries], [], []))).toThrow(
        'not enabled',
      );
    },
  );

  it('rejects the wrong reference kind and a missing fixed grant', () => {
    expect(() => createCharacter(input({ classId: 'race.half-elf' }), registry)).toThrow(ZodError);
    const entries = [...registry.entries.values()].filter(
      (entry) => entry.id !== 'feature.bard.bardic-inspiration',
    );
    expect(() => createCharacter(input(), buildRegistry([entries], [], []))).toThrow(
      'Unknown feature reference',
    );
  });

  it('isolates the saved build and live state from form inputs, registry and other characters', () => {
    const choices = input();
    const before = structuredClone(choices);
    const created = createCharacter(choices, registry);
    created.build.abilityScores.base.CON = 18;
    created.build.abilityScores.bonuses[0]!.value = 99;
    created.build.proficiencies.saves.push('STR');
    created.build.proficiencies.skills.push('athletics');
    created.live.slotsUsed[1] = 2;
    expect(choices).toEqual(before);
    expect(registry.get('class', 'class.bard').saves).toEqual(['DEX', 'CHA']);
    expect(registry.get('background', 'background.charlatan').skills).toEqual([
      'deception',
      'sleight-of-hand',
    ]);
    expect(createCharacter(choices, registry).live.slotsUsed[1]).toBe(0);
  });
});
