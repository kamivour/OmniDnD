import { describe, expect, it } from 'vitest';
import {
  BackgroundDefSchema,
  ClassDefSchema,
  ConditionDefSchema,
  FeatureDefSchema,
  ItemDefSchema,
  RaceDefSchema,
  SpellDefSchema,
  SubclassDefSchema,
} from '../../src/engine/schema';
import {
  classFeatureId,
  mapBackground,
  mapClass,
  mapClassFeatures,
  mapCondition,
  mapItem,
  mapRace,
  mapSpell,
  mapSubclass,
  mapSubrace,
  mapTrait,
  parseCasting,
  parseDuration,
  parseRange,
  referencedIds,
  rollFromSlots,
  type RawFeature,
  type RawItem,
  type RawLevel,
  type RawRace,
  type RawSpell,
} from './map.ts';

// Fixtures follow the 5e-database record shapes. Text fields are placeholders, not SRD text.

const ref = (index: string) => ({ index, name: index });
const slots = (from: number, roll: (slot: number) => string) =>
  Object.fromEntries(
    Array.from({ length: 10 - from }, (_, index) => [String(from + index), roll(from + index)]),
  );

function spell(patch: Partial<RawSpell>): RawSpell {
  return {
    index: 'test-spell',
    name: 'Test Spell',
    desc: ['Does a thing.'],
    range: '60 feet',
    components: ['V'],
    ritual: false,
    duration: 'Instantaneous',
    concentration: false,
    casting_time: '1 action',
    level: 1,
    school: ref('evocation'),
    classes: [ref('bard')],
    ...patch,
  };
}

describe('spell fields', () => {
  it('shortens ranges and adds the area to Self', () => {
    expect(parseRange('60 feet')).toBe('60 ft');
    expect(parseRange('Touch')).toBe('Touch');
    expect(parseRange('Self', { type: 'cone', size: 15 })).toBe('Self (15-ft cone)');
    expect(parseRange('Self')).toBe('Self');
  });

  it('turns durations into display text and game seconds', () => {
    expect(parseDuration('Instantaneous', false)).toEqual({
      text: 'Instant',
      concentration: false,
    });
    expect(parseDuration('Up to 1 minute', true)).toEqual({
      text: '1 min',
      seconds: 60,
      concentration: true,
    });
    expect(parseDuration('8 hours', false)).toEqual({
      text: '8 h',
      seconds: 28800,
      concentration: false,
    });
    expect(parseDuration('1 round', false)).toMatchObject({ text: '1 round', seconds: 6 });
    expect(parseDuration('10 days', false)).toMatchObject({ text: '10 days', seconds: 864000 });
    expect(parseDuration('Until dispelled', false)).toEqual({
      text: 'Until dispelled',
      concentration: false,
    });
    expect(() => parseDuration('Until the next full moon', false)).toThrow(
      'Unknown spell duration',
    );
  });

  it('reads casting times', () => {
    expect(parseCasting('1 bonus action')).toEqual({ cost: 'bonus' });
    expect(parseCasting('1 reaction')).toEqual({ cost: 'reaction' });
    expect(parseCasting('10 minutes')).toEqual({ cost: 'minutes', amount: 10 });
    expect(parseCasting('1 hour')).toEqual({ cost: 'hours', amount: 1 });
    expect(() => parseCasting('2 actions')).toThrow('Unknown casting time');
  });

  it('accepts only linear slot tables that start at the spell level', () => {
    expect(
      rollFromSlots(
        slots(1, (slot) => `${slot + 2}d6`),
        1,
      ),
    ).toEqual({
      dice: '3d6',
      upcastPerLevel: '1d6',
    });
    expect(rollFromSlots({ '2': '2d8', '3': '2d8' }, 2)).toEqual({ dice: '2d8' });
    expect(
      rollFromSlots(
        slots(1, (slot) => `${slot + 2}d4 + 3`),
        1,
      ),
    ).toBeUndefined();
    expect(rollFromSlots({ '1': '70' }, 1)).toBeUndefined();
    expect(rollFromSlots({ '2': '1d6', '3': '2d6' }, 1)).toBeUndefined();
    expect(rollFromSlots({ '1': '1d6', '2': '2d6', '3': '4d6' }, 1)).toBeUndefined();
  });
});

describe('mapSpell', () => {
  it('maps a healing spell with an upcast and casting modifier', () => {
    const healingWord = mapSpell(
      spell({
        index: 'healing-word',
        name: 'Healing Word',
        higher_level: ['Heals more.'],
        casting_time: '1 bonus action',
        heal_at_slot_level: slots(1, (slot) => `${slot}d4 + MOD`),
        classes: [ref('druid'), ref('bard'), ref('cleric')],
      }),
    );
    expect(SpellDefSchema.parse(healingWord)).toEqual(healingWord);
    expect(healingWord).toMatchObject({
      id: 'spell.healing-word',
      ruleset: '5e-2014',
      source: 'PHB',
      srd: true,
      fullText: 'Does a thing.\n\nAt Higher Levels. Heals more.',
      casting: { cost: 'bonus' },
      range: '60 ft',
      components: { v: true, s: false },
      duration: { text: 'Instant', concentration: false },
      classes: ['class.bard', 'class.cleric', 'class.druid'],
      tags: ['healing'],
      heal: { dice: '1d4', addCastingMod: true, upcastPerLevel: '1d4' },
    });
    expect(healingWord.damage).toBeUndefined();
  });

  it('maps cantrip scaling and spell attacks', () => {
    const fireBolt = mapSpell(
      spell({
        index: 'fire-bolt',
        level: 0,
        attack_type: 'ranged',
        components: ['V', 'S'],
        damage: [
          {
            damage_type: ref('fire'),
            damage_at_character_level: { '1': '1d10', '5': '2d10', '11': '3d10', '17': '4d10' },
          },
        ],
      }),
    );
    expect(SpellDefSchema.parse(fireBolt)).toEqual(fireBolt);
    expect(fireBolt).toMatchObject({
      attack: 'ranged',
      tags: ['damage'],
      damage: { dice: '1d10', cantripScaling: true, type: 'fire' },
    });
  });

  it('maps saves, areas, and material components', () => {
    const burningHands = mapSpell(
      spell({
        range: 'Self',
        area_of_effect: { type: 'cone', size: 15 },
        components: ['V', 'S', 'M'],
        material: 'A pinch of something',
        dc: { dc_type: ref('dex') },
        duration: 'Up to 10 minutes',
        concentration: true,
        damage: [
          { damage_type: ref('fire'), damage_at_slot_level: slots(1, (slot) => `${slot + 2}d6`) },
        ],
      }),
    );
    expect(SpellDefSchema.parse(burningHands)).toEqual(burningHands);
    expect(burningHands).toMatchObject({
      range: 'Self (15-ft cone)',
      save: 'DEX',
      components: { v: true, s: true, m: 'A pinch of something' },
      duration: { text: '10 min', seconds: 600, concentration: true },
      damage: { dice: '3d6', upcastPerLevel: '1d6', type: 'fire' },
    });
  });

  it('leaves odd rolls for data/mechanics and says so', () => {
    const notes: string[] = [];
    const magicMissile = mapSpell(
      spell({
        name: 'Magic Missile',
        damage: [
          {
            damage_type: ref('force'),
            damage_at_slot_level: slots(1, (slot) => `${slot + 2}d4 + ${slot + 2}`),
          },
        ],
      }),
      notes,
    );
    expect(magicMissile.damage).toBeUndefined();
    expect(magicMissile.tags).toEqual(['damage']);
    expect(notes).toEqual(['Magic Missile: damage roll left for data/mechanics']);
  });

  it('does not tag Sleep as damage', () => {
    const notes: string[] = [];
    const sleep = mapSpell(
      spell({ index: 'sleep', name: 'Sleep', damage: [{ damage_at_slot_level: { '1': '5d8' } }] }),
      notes,
    );
    expect(sleep.tags).toEqual([]);
    expect(sleep.damage).toBeUndefined();
    expect(notes).toEqual(['Sleep: dice table is not damage, left for data/mechanics']);
  });

  it('adds Faerie Fire to the Bard list', () => {
    const notes: string[] = [];
    const faerieFire = mapSpell(
      spell({ index: 'faerie-fire', name: 'Faerie Fire', classes: [ref('druid')] }),
      notes,
    );
    expect(faerieFire.classes).toEqual(['class.bard', 'class.druid']);
    expect(notes).toHaveLength(1);
  });
});

describe('class features', () => {
  it('gives each feature one id across levels', () => {
    expect(classFeatureId('bardic-inspiration-d6', 'bard', 'Bardic Inspiration (d6)')).toBe(
      'feature.bard.bardic-inspiration',
    );
    expect(classFeatureId('bardic-inspiration-d12', 'bard', 'Bardic Inspiration (d12)')).toBe(
      'feature.bard.bardic-inspiration',
    );
    expect(classFeatureId('action-surge-2-uses', 'fighter', 'Action Surge (2 uses)')).toBe(
      'feature.fighter.action-surge',
    );
    expect(
      classFeatureId(
        'destroy-undead-cr-1-2-or-below',
        'cleric',
        'Destroy Undead (CR 1/2 or below)',
      ),
    ).toBe('feature.cleric.destroy-undead');
    expect(
      classFeatureId('mystic-arcanum-6th-level', 'warlock', 'Mystic Arcanum (6th level)'),
    ).toBe('feature.warlock.mystic-arcanum');
    expect(classFeatureId('bard-expertise-2', 'bard')).toBe('feature.bard.expertise');
    expect(classFeatureId('spellcasting-bard', 'bard')).toBe('feature.bard.spellcasting');
    expect(classFeatureId('bard-ability-score-improvement-1', 'bard')).toBe(
      'feature.bard.ability-score-improvement',
    );
    expect(classFeatureId('cutting-words', 'bard')).toBe('feature.bard.cutting-words');
    expect(classFeatureId('jack-of-all-trades', 'bard')).toBe('feature.bard.jack-of-all-trades');
    expect(classFeatureId('dragon-ancestor-red---fire-damage', 'sorcerer')).toBe(
      'feature.sorcerer.dragon-ancestor-red-fire-damage',
    );
  });

  const feature = (
    index: string,
    name: string,
    level: number,
    patch: Partial<RawFeature> = {},
  ) => ({
    index,
    name,
    level,
    class: ref('bard'),
    desc: [`${name} text.`],
    ...patch,
  });
  const bardFeatures: RawFeature[] = [
    feature('bardic-inspiration-d8', 'Bardic Inspiration (d8)', 5, { desc: ['Die grows.'] }),
    feature('bardic-inspiration-d6', 'Bardic Inspiration (d6)', 1, { desc: ['Inspire.'] }),
    feature('bardic-inspiration-d10', 'Bardic Inspiration (d10)', 10, { desc: ['Die grows.'] }),
    feature('jack-of-all-trades', 'Jack of All Trades', 2),
    feature('bard-expertise-1', 'Expertise', 3),
    feature('bard-expertise-2', 'Expertise', 10),
    feature('cutting-words', 'Cutting Words', 3, { subclass: ref('lore') }),
    feature('peerless-skill', 'Peerless Skill', 14, { subclass: ref('lore') }),
  ];

  it('merges levels into one entry with each description once', () => {
    const notes: string[] = [];
    const { features, idOf } = mapClassFeatures(bardFeatures, notes);
    for (const entry of features) expect(FeatureDefSchema.parse(entry)).toEqual(entry);
    const byId = new Map(features.map((entry) => [entry.id, entry]));

    expect(byId.get('feature.bard.bardic-inspiration')).toMatchObject({
      name: 'Bardic Inspiration',
      fullText: 'Inspire.\n\nDie grows.',
      origin: 'class',
      activation: 'special',
    });
    expect(byId.get('feature.bard.expertise')?.name).toBe('Expertise');
    expect(byId.get('feature.bard.cutting-words')?.origin).toBe('subclass');
    expect(features).toHaveLength(5);
    expect(idOf.get('bardic-inspiration-d10')).toBe('feature.bard.bardic-inspiration');
    expect(notes).toEqual([]);
  });

  it('builds class and subclass level tables', () => {
    const { idOf } = mapClassFeatures(bardFeatures);
    const level = (n: number, features: string[], patch: Partial<RawLevel> = {}): RawLevel => ({
      index: `bard-${n}`,
      level: n,
      class: ref('bard'),
      features: features.map(ref),
      spellcasting: { cantrips_known: n < 4 ? 2 : 3, spells_known: n + 3 },
      ...patch,
    });
    const levels: RawLevel[] = [
      ...Array.from({ length: 20 }, (_, index) => {
        const n = index + 1;
        if (n === 1) return level(n, ['bardic-inspiration-d6']);
        if (n === 2) return level(n, ['jack-of-all-trades']);
        if (n === 3) return level(n, ['bard-expertise-1']);
        if (n === 5) return level(n, ['bardic-inspiration-d8']);
        if (n === 10) return level(n, ['bardic-inspiration-d10', 'bard-expertise-2']);
        return level(n, []);
      }),
      level(3, ['cutting-words'], {
        index: 'lore-3',
        subclass: ref('lore'),
        spellcasting: undefined,
      }),
      level(14, ['peerless-skill'], {
        index: 'lore-14',
        subclass: ref('lore'),
        spellcasting: undefined,
      }),
    ];

    const bardRaw = {
      index: 'bard',
      name: 'Bard',
      hit_die: 8,
      saving_throws: [ref('dex'), ref('cha')],
      spellcasting: { spellcasting_ability: ref('cha') },
    };
    const bard = mapClass(bardRaw, levels, idOf);
    expect(ClassDefSchema.parse(bard)).toEqual(bard);
    expect(bard).toMatchObject({
      id: 'class.bard',
      hitDie: 'd8',
      saves: ['DEX', 'CHA'],
      spellcasting: { ability: 'CHA', progression: 'full', ritual: 'known' },
      subclassLevel: 3,
    });
    expect(bard.spellcasting?.cantripsKnown?.slice(0, 5)).toEqual([2, 2, 2, 3, 3]);
    expect(bard.spellcasting?.spellsKnown?.[2]).toBe(6);
    expect(bard.features).toEqual([
      { level: 1, featureId: 'feature.bard.bardic-inspiration' },
      { level: 2, featureId: 'feature.bard.jack-of-all-trades' },
      { level: 3, featureId: 'feature.bard.expertise' },
      { level: 5, featureId: 'feature.bard.bardic-inspiration' },
      { level: 10, featureId: 'feature.bard.bardic-inspiration' },
      { level: 10, featureId: 'feature.bard.expertise' },
    ]);

    const lore = mapSubclass(
      { index: 'lore', name: 'Lore', class: ref('bard'), desc: ['Knows things.'] },
      levels,
      idOf,
    );
    expect(SubclassDefSchema.parse(lore)).toEqual(lore);
    expect(lore).toMatchObject({ id: 'subclass.bard.lore', classId: 'class.bard' });
    expect(lore.features).toEqual([
      { level: 3, featureId: 'feature.bard.cutting-words' },
      { level: 14, featureId: 'feature.bard.peerless-skill' },
    ]);

    expect(() => mapClass(bardRaw, levels.slice(1), idOf)).toThrow('bard: no level 1');
  });
});

describe('races and backgrounds', () => {
  const traits = (...indexes: string[]) => indexes.map(ref);
  const halfElfRaw: RawRace = {
    index: 'half-elf',
    name: 'Half-Elf',
    speed: 30,
    size: 'Medium',
    ability_bonuses: [{ ability_score: ref('cha'), bonus: 2 }],
    ability_bonus_options: {
      choose: 2,
      from: {
        options: ['str', 'dex', 'con', 'int', 'wis'].map((index) => ({
          ability_score: ref(index),
          bonus: 1,
        })),
      },
    },
    languages: [
      { index: 'common', name: 'Common' },
      { index: 'elvish', name: 'Elvish' },
    ],
    traits: traits('darkvision', 'fey-ancestry', 'skill-versatility'),
    age: 'Age.',
    alignment: 'Alignment.',
    size_description: 'Size.',
    language_desc: 'Languages.',
  };

  it('maps fixed and chosen ability bonuses', () => {
    const halfElf = mapRace(halfElfRaw);
    expect(RaceDefSchema.parse(halfElf)).toEqual(halfElf);
    expect(halfElf).toMatchObject({
      id: 'race.half-elf',
      size: 'medium',
      speed: 30,
      darkvision: 60,
      abilityBonuses: [{ ability: 'CHA', value: 2 }],
      abilityChoices: { count: 2, value: 1, exclude: ['CHA'] },
      languages: ['Common', 'Elvish'],
      featureIds: ['feature.darkvision', 'feature.fey-ancestry', 'feature.skill-versatility'],
    });
  });

  it('makes a subrace a complete entry', () => {
    const dwarf = mapRace({
      ...halfElfRaw,
      index: 'dwarf',
      name: 'Dwarf',
      speed: 25,
      ability_bonuses: [{ ability_score: ref('con'), bonus: 2 }],
      ability_bonus_options: undefined,
      traits: traits('darkvision', 'stonecunning'),
    });
    expect(dwarf.abilityChoices).toBeUndefined();
    const hillDwarf = mapSubrace(
      {
        index: 'hill-dwarf',
        name: 'Hill Dwarf',
        race: ref('dwarf'),
        desc: 'Hardy.',
        ability_bonuses: [{ ability_score: ref('wis'), bonus: 1 }],
        racial_traits: traits('dwarven-toughness'),
      },
      dwarf,
    );
    expect(RaceDefSchema.parse(hillDwarf)).toEqual(hillDwarf);
    expect(hillDwarf).toMatchObject({
      id: 'race.hill-dwarf',
      subraceOf: 'race.dwarf',
      speed: 25,
      darkvision: 60,
      abilityBonuses: [
        { ability: 'CON', value: 2 },
        { ability: 'WIS', value: 1 },
      ],
      featureIds: ['feature.darkvision', 'feature.stonecunning', 'feature.dwarven-toughness'],
    });
    expect(hillDwarf.fullText?.startsWith('Hardy.\n\n')).toBe(true);
  });

  it('maps racial traits and conditions', () => {
    const trait = mapTrait({
      index: 'fey-ancestry',
      name: 'Fey Ancestry',
      desc: ['Resists charm.'],
    });
    expect(FeatureDefSchema.parse(trait)).toMatchObject({
      id: 'feature.fey-ancestry',
      origin: 'race',
    });
    const condition = mapCondition({
      index: 'prone',
      name: 'Prone',
      desc: ['- Lies down.', '- Crawls.'],
    });
    expect(ConditionDefSchema.parse(condition)).toMatchObject({
      id: 'condition.prone',
      fullText: '- Lies down.\n- Crawls.',
    });
  });

  it('maps a background and its feature', () => {
    const notes: string[] = [];
    const { background, feature } = mapBackground(
      {
        index: 'acolyte',
        name: 'Acolyte',
        starting_proficiencies: [ref('skill-insight'), ref('skill-religion'), ref('lute')],
        feature: { name: 'Shelter of the Faithful', desc: ['Temples help you.'] },
      },
      notes,
    );
    expect(BackgroundDefSchema.parse(background)).toMatchObject({
      id: 'background.acolyte',
      skills: ['insight', 'religion'],
      featureIds: ['feature.shelter-of-the-faithful'],
    });
    expect(FeatureDefSchema.parse(feature)).toMatchObject({ origin: 'background' });
    expect(notes).toEqual(['Acolyte: proficiencies left for data/mechanics (lute)']);
  });
});

describe('mapItem', () => {
  const item = (patch: Partial<RawItem> & Pick<RawItem, 'index'>): RawItem => ({
    name: patch.index,
    equipment_category: ref('adventuring-gear'),
    cost: { quantity: 1, unit: 'gp' },
    weight: 1,
    ...patch,
  });
  const weapon = (patch: Partial<RawItem> & Pick<RawItem, 'index'>) =>
    item({ equipment_category: ref('weapon'), weapon_category: 'Simple', ...patch });
  const map = (raw: RawItem) => {
    const entry = mapItem(raw);
    expect(entry && ItemDefSchema.parse(entry)).toEqual(entry);
    return entry;
  };

  it('maps melee weapons, thrown ranges, and versatile damage', () => {
    expect(
      map(
        weapon({
          index: 'dagger',
          weapon_range: 'Melee',
          damage: { damage_dice: '1d4', damage_type: ref('piercing') },
          range: { normal: 5 },
          throw_range: { normal: 20, long: 60 },
          properties: [ref('finesse'), ref('light'), ref('thrown'), ref('monk')],
        }),
      )?.weapon,
    ).toEqual({
      category: 'simple',
      type: 'melee',
      damage: '1d4',
      damageType: 'piercing',
      properties: ['finesse', 'light', 'thrown'],
      range: { normal: 20, long: 60 },
    });
    expect(
      map(
        weapon({
          index: 'longsword',
          weapon_category: 'Martial',
          weapon_range: 'Melee',
          damage: { damage_dice: '1d8', damage_type: ref('slashing') },
          two_handed_damage: { damage_dice: '1d10', damage_type: ref('slashing') },
          range: { normal: 5 },
          properties: [ref('versatile')],
        }),
      )?.weapon,
    ).toEqual({
      category: 'martial',
      type: 'melee',
      damage: '1d8',
      damageType: 'slashing',
      properties: ['versatile'],
      versatile: '1d10',
    });
  });

  it('maps flat and missing weapon damage', () => {
    expect(
      map(
        weapon({
          index: 'blowgun',
          weapon_range: 'Ranged',
          damage: { damage_dice: '1', damage_type: ref('piercing') },
          range: { normal: 25, long: 100 },
          properties: [ref('ammunition'), ref('loading')],
        }),
      )?.weapon,
    ).toMatchObject({ damage: 1, range: { normal: 25, long: 100 } });
    const net = map(
      weapon({
        index: 'net',
        weapon_range: 'Ranged',
        range: { normal: 5, long: 15 },
        properties: [ref('thrown'), ref('special')],
        special: ['Restrains.'],
      }),
    );
    expect(net?.weapon?.damage).toBeUndefined();
    expect(net?.fullText).toBe('Restrains.');
  });

  it('maps armor', () => {
    const armor = (index: string, category: string, base: number, strMin = 0) =>
      map(
        item({
          index,
          equipment_category: ref('armor'),
          armor_category: category,
          armor_class: { base },
          str_minimum: strMin,
          stealth_disadvantage: strMin > 0,
        }),
      )?.armor;
    expect(armor('leather-armor', 'Light', 11)).toEqual({
      category: 'light',
      baseAc: 11,
      stealthDisadvantage: false,
    });
    expect(armor('chain-mail', 'Heavy', 16, 13)).toEqual({
      category: 'heavy',
      baseAc: 16,
      strMin: 13,
      stealthDisadvantage: true,
    });
    expect(armor('shield', 'Shield', 2)?.category).toBe('shield');
  });

  it('sorts gear into tools, instruments, containers, and consumables', () => {
    const category = (patch: Partial<RawItem> & Pick<RawItem, 'index'>) =>
      map(item(patch))?.category;
    expect(
      category({
        index: 'flute',
        equipment_category: ref('tools'),
        tool_category: 'Musical Instrument',
      }),
    ).toBe('instrument');
    expect(
      category({
        index: 'thieves-tools',
        equipment_category: ref('tools'),
        tool_category: 'Other Tools',
      }),
    ).toBe('tool');
    expect(category({ index: 'disguise-kit', gear_category: ref('kits') })).toBe('tool');
    expect(category({ index: 'backpack' })).toBe('container');
    expect(category({ index: 'rations-1-day' })).toBe('consumable');
    expect(category({ index: 'candle' })).toBe('gear');
  });

  it('records ammunition bundles', () => {
    expect(
      map(item({ index: 'arrow', gear_category: ref('ammunition'), quantity: 20 })),
    ).toMatchObject({
      category: 'consumable',
      bundle: 20,
      cost: { amount: 1, unit: 'gp' },
    });
  });

  it('skips mounts and rejects unknown categories', () => {
    expect(
      mapItem(item({ index: 'camel', equipment_category: ref('mounts-and-vehicles') })),
    ).toBeUndefined();
    expect(() =>
      mapItem(item({ index: 'wand', equipment_category: ref('wondrous-items') })),
    ).toThrow('unknown equipment category');
  });
});

describe('referencedIds', () => {
  it('finds ids in values and record keys', () => {
    const found = referencedIds({
      raceId: 'race.half-elf',
      name: 'The Fool',
      spells: [{ known: ['spell.faerie-fire'] }],
      featureUsesSpent: { 'feature.bard.bardic-inspiration': 2 },
      notes: 'From the dying nobleman',
    });
    expect([...found].sort()).toEqual([
      'feature.bard.bardic-inspiration',
      'race.half-elf',
      'spell.faerie-fire',
    ]);
  });
});
