import { describe, expect, it } from 'vitest';
import {
  CampaignSchema,
  CharacterBuildSchema,
  FeatureDefSchema,
  ItemDefSchema,
  LiveStateSchema,
  LogEventSchema,
  RefEntrySchema,
  RefPackSchema,
  SpellDefSchema,
} from './index';

function campaign() {
  return {
    id: 'campaign-273',
    schemaVersion: 1,
    name: '#273',
    ruleset: '5e-2014',
    leveling: 'milestone',
    hpMethod: 'rolled',
    hpLevelFloor: 'none',
    abilityMethod: 'rolled',
    sources: ['PHB', 'XGE', 'TCE'],
    optionalRules: {},
  };
}

function build() {
  return {
    id: 'the-fool',
    schemaVersion: 1,
    campaignId: 'campaign-273',
    name: 'The Fool',
    raceId: 'race.half-elf',
    backgroundId: 'background.charlatan',
    classes: [{ classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 3 }],
    abilityScores: {
      base: { STR: 11, DEX: 14, CON: 12, INT: 12, WIS: 12, CHA: 18 },
      bonuses: [
        { source: 'race.half-elf', ability: 'CHA', value: 2 },
        { source: 'race.half-elf', ability: 'DEX', value: 1 },
        { source: 'race.half-elf', ability: 'CON', value: 1 },
      ],
    },
    hpEntries: [
      { level: 1, classId: 'class.bard', value: 8, method: 'max' },
      { level: 2, classId: 'class.bard', value: 4, method: 'rolled' },
      { level: 3, classId: 'class.bard', value: 4, method: 'rolled' },
    ],
    proficiencies: {
      saves: ['DEX', 'CHA'],
      skills: ['deception', 'sleight-of-hand', 'perception'],
      expertise: ['deception', 'sleight-of-hand'],
      armor: ['light'],
      weapons: ['simple', 'item.rapier'],
      tools: ['item.flute'],
      languages: ['Common', 'Elvish'],
    },
    spells: [{ classId: 'class.bard', known: ['spell.faerie-fire'] }],
    favorites: [],
    featureIds: ['feature.bard.bardic-inspiration'],
    choices: {},
    items: [{ instanceId: 'rapier-1', itemId: 'item.rapier' }],
    journal: {},
    overrides: [],
  };
}

function live() {
  return {
    characterId: 'the-fool',
    schemaVersion: 1,
    hp: 19,
    tempHp: 0,
    deathSaves: { success: 0, fail: 0 },
    hitDiceSpent: {},
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    featureUsesSpent: {},
    effects: [],
    conditions: [],
    exhaustion: 0,
    items: { 'rapier-1': { qty: 1, equipped: true, attuned: false } },
    currency: { cp: 0, sp: 5, ep: 0, gp: 49, pp: 0 },
    clock: { seconds: 8 * 3600 },
  };
}

function faerieFire() {
  return {
    kind: 'spell',
    id: 'spell.faerie-fire',
    name: 'Faerie Fire',
    ruleset: '5e-2014',
    source: 'PHB',
    srd: true,
    summary: {
      effect: '20-ft cube. Attacks vs an outlined target have advantage; it can’t be invisible.',
      fail: 'Outlined in light (dim light 10 ft).',
    },
    level: 1,
    school: 'evocation',
    casting: { cost: 'action' },
    range: '60 ft',
    components: { v: true, s: false },
    duration: { text: '1 min', seconds: 60, concentration: true },
    ritual: false,
    save: 'DEX',
    classes: ['class.bard'],
    tags: ['debuff'],
  };
}

function bardicInspiration() {
  return {
    kind: 'feature',
    id: 'feature.bard.bardic-inspiration',
    name: 'Bardic Inspiration',
    ruleset: '5e-2014',
    source: 'PHB',
    srd: true,
    origin: 'class',
    activation: 'bonus',
    uses: { max: { abilityMod: 'CHA', min: 1 }, recharge: { 1: 'long', 5: 'short' } },
    die: { 1: 'd6', 5: 'd8', 10: 'd10', 15: 'd12' },
  };
}

function rapier() {
  return {
    kind: 'item',
    id: 'item.rapier',
    name: 'Rapier',
    ruleset: '5e-2014',
    source: 'PHB',
    srd: true,
    category: 'weapon',
    weight: 2,
    cost: { amount: 25, unit: 'gp' },
    weapon: {
      category: 'martial',
      type: 'melee',
      damage: '1d8',
      damageType: 'piercing',
      properties: ['finesse'],
    },
  };
}

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('CampaignSchema', () => {
  it('accepts campaign #273', () => {
    expect(CampaignSchema.parse(campaign())).toMatchObject({ leveling: 'milestone' });
  });

  it('rejects any ruleset but 5e-2014', () => {
    expect(CampaignSchema.safeParse({ ...campaign(), ruleset: '5e-2024' }).success).toBe(false);
  });

  it('rejects an unknown HP floor and unknown keys', () => {
    expect(CampaignSchema.safeParse({ ...campaign(), hpLevelFloor: 'zero' }).success).toBe(false);
    expect(CampaignSchema.safeParse({ ...campaign(), weaponMastery: true }).success).toBe(false);
  });
});

describe('CharacterBuildSchema', () => {
  it('accepts a Bard 3 build', () => {
    expect(CharacterBuildSchema.safeParse(build()).success).toBe(true);
  });

  it('needs one HP entry per level', () => {
    const data = build();
    data.hpEntries.pop();
    expect(messages(CharacterBuildSchema.safeParse(data))).toContain(
      'Expected 3 HP entries (one per level), got 2',
    );
  });

  it('takes the max die at level 1 only', () => {
    const data = build();
    data.hpEntries[0]!.method = 'rolled';
    data.hpEntries[2]!.method = 'max';
    const result = CharacterBuildSchema.safeParse(data);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'hpEntries.0.method',
      'hpEntries.2.method',
    ]);
  });

  it('needs HP entries in level order', () => {
    const data = build();
    data.hpEntries[1]!.level = 3;
    data.hpEntries[2]!.level = 2;
    expect(CharacterBuildSchema.safeParse(data).success).toBe(false);
  });

  it('needs proficiency before expertise in a skill', () => {
    const data = build();
    data.proficiencies.expertise.push('stealth');
    expect(messages(CharacterBuildSchema.safeParse(data))).toContain(
      'Expertise in stealth needs proficiency in it',
    );
  });

  it('needs every ability score and valid ids', () => {
    const missing = build() as { abilityScores: { base: Record<string, number> } };
    delete missing.abilityScores.base.CHA;
    expect(CharacterBuildSchema.safeParse(missing).success).toBe(false);
    expect(CharacterBuildSchema.safeParse({ ...build(), raceId: 'half-elf' }).success).toBe(false);
  });
});

describe('LiveStateSchema', () => {
  it('accepts a fresh state', () => {
    expect(LiveStateSchema.safeParse(live()).success).toBe(true);
  });

  it('accepts combat and concentration with its effect on you', () => {
    const data = {
      ...live(),
      concentration: { spellId: 'spell.invisibility', slotLevel: 2, endsAt: 32406, effectId: 'e1' },
      effects: [
        {
          id: 'e1',
          name: 'Invisibility',
          sourceId: 'spell.invisibility',
          endsAt: 32406,
          concentration: true,
          conditions: ['invisible'],
          modifiers: [],
        },
      ],
      combat: {
        round: 2,
        turnActive: true,
        economy: {
          actionUsed: true,
          bonusUsed: false,
          reactionUsed: false,
          movementUsed: 0,
          objectInteractionUsed: false,
          bonusActionSpellCast: false,
          otherSpellCast: true,
        },
      },
    };
    expect(LiveStateSchema.safeParse(data).success).toBe(true);
  });

  it('rejects impossible values', () => {
    expect(LiveStateSchema.safeParse({ ...live(), hp: -1 }).success).toBe(false);
    expect(LiveStateSchema.safeParse({ ...live(), exhaustion: 7 }).success).toBe(false);
    expect(
      LiveStateSchema.safeParse({ ...live(), deathSaves: { success: 0, fail: 4 } }).success,
    ).toBe(false);
    expect(LiveStateSchema.safeParse({ ...live(), conditions: ['dazed'] }).success).toBe(false);
    expect(LiveStateSchema.safeParse({ ...live(), slotsUsed: [0, 1] }).success).toBe(false);
    expect(
      LiveStateSchema.safeParse({ ...live(), slotsUsed: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }).success,
    ).toBe(false);
  });

  it('rejects concentration that points to a missing effect', () => {
    const data = { ...live(), concentration: { spellId: 'spell.invisibility', effectId: 'gone' } };
    expect(messages(LiveStateSchema.safeParse(data))).toContain(
      'Concentration points to missing effect gone',
    );
  });
});

describe('reference entries', () => {
  it('accepts a spell, a feature, and a weapon through the union', () => {
    for (const entry of [faerieFire(), bardicInspiration(), rapier()]) {
      expect(RefEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it('keeps book text off non-SRD entries', () => {
    const data = { ...faerieFire(), srd: false, fullText: 'Copied rules text.' };
    expect(messages(SpellDefSchema.safeParse(data))).toContain(
      'fullText is only allowed on SRD entries',
    );
    expect(SpellDefSchema.safeParse({ ...data, srd: true }).success).toBe(true);
  });

  it('keeps the summary effect to 40 words', () => {
    const long = Array.from({ length: 41 }, () => 'word').join(' ');
    const data = { ...faerieFire(), summary: { effect: long } };
    expect(SpellDefSchema.safeParse(data).success).toBe(false);
  });

  it('rejects 2024 entries and wrong id prefixes', () => {
    expect(RefEntrySchema.safeParse({ ...faerieFire(), ruleset: '5e-2024' }).success).toBe(false);
    expect(SpellDefSchema.safeParse({ ...faerieFire(), id: 'feature.faerie-fire' }).success).toBe(
      false,
    );
  });

  it('rejects a feature with both its own uses and a shared pool', () => {
    const data = { ...bardicInspiration(), usesFrom: 'feature.bard.bardic-inspiration' };
    expect(FeatureDefSchema.safeParse(data).success).toBe(false);
  });

  it('ties weapon stats to the weapon category', () => {
    expect(ItemDefSchema.safeParse({ ...rapier(), category: 'gear' }).success).toBe(false);
    expect(ItemDefSchema.safeParse({ ...rapier(), weapon: undefined }).success).toBe(false);
  });

  it('allows flat or no weapon damage, but never a type without damage', () => {
    const weapon = rapier().weapon;
    const withWeapon = (patch: object) => ({ ...rapier(), weapon: { ...weapon, ...patch } });
    expect(ItemDefSchema.safeParse(withWeapon({ damage: 1 })).success).toBe(true);
    expect(
      ItemDefSchema.safeParse(withWeapon({ damage: undefined, damageType: undefined })).success,
    ).toBe(true);
    expect(messages(ItemDefSchema.safeParse(withWeapon({ damage: undefined })))).toContain(
      'Weapon damage and damage type go together',
    );
  });

  it('rejects duplicate ids in a pack', () => {
    expect(RefPackSchema.safeParse([faerieFire(), rapier()]).success).toBe(true);
    expect(messages(RefPackSchema.safeParse([faerieFire(), faerieFire()]))).toContain(
      'Duplicate id spell.faerie-fire',
    );
  });
});

describe('LogEventSchema', () => {
  it('accepts an event with Immer patches', () => {
    const event = {
      id: 'ev-1',
      characterId: 'the-fool',
      realTime: '2026-11-02T10:00:00.000Z',
      gameSeconds: 28800,
      command: 'castSpell',
      text: 'Cast Faerie Fire (L1 slot)',
      patches: [{ op: 'replace', path: ['live', 'slotsUsed', 1], value: 1 }],
      inversePatches: [{ op: 'replace', path: ['live', 'slotsUsed', 1], value: 0 }],
    };
    expect(LogEventSchema.safeParse(event).success).toBe(true);
    expect(LogEventSchema.safeParse({ ...event, realTime: 'yesterday' }).success).toBe(false);
  });
});
