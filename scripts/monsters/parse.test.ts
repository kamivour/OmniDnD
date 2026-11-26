import { describe, expect, it } from 'vitest';
import { Vocab } from './clean.ts';
import {
  armorNote,
  averageHp,
  cleanAlignment,
  cleanLine,
  cleanType,
  entryStart,
  fixSpellHead,
  parseBlock,
  parseTypeLine,
  proficiencyForCr,
  propertyOf,
  sharesWord,
  usageOf,
} from './parse.ts';
import type { FlowLine, RawBlock } from './segment.ts';

/** A made-up block: each line gets a place in one column of page 3. */
function block(lines: string[], extra: Partial<RawBlock> = {}): RawBlock {
  const flow: FlowLine[] = lines.map((t, i) => ({
    t,
    x: 40,
    y: 100 + i * 12,
    h: 9,
    c: 0,
    page: 3,
    lore: false,
    big: false,
  }));
  return { page: 3, lines: flow, ...extra };
}

describe('entryStart', () => {
  it('reads a run-in name, its usage and the text after it', () => {
    expect(entryStart('Keen Smell. The hound has advantage.')).toEqual({
      name: 'Keen Smell',
      rest: 'The hound has advantage.',
    });
    expect(entryStart('Spore Burst (Recharge 5-6). Each creature nearby chokes.')).toEqual({
      name: 'Spore Burst',
      paren: '(Recharge 5-6)',
      rest: 'Each creature nearby chokes.',
    });
  });

  it('accepts names OCR lowered, a colon for a period, or a lost period', () => {
    expect(entryStart('javelin. Melee or Ranged Weapon Attack: +4 to hit')?.name).toBe('Javelin');
    expect(entryStart('Constrict: Melee Weapon Attack: +6 to hit')?.name).toBe('Constrict');
    expect(entryStart('Wall of thorns (Recharge 6). The vines rise.')?.name).toBe('Wall of thorns');
    expect(entryStart('Smother The vine wraps one creature.')).toEqual({
      name: 'Smother',
      rest: 'The vine wraps one creature.',
    });
    expect(entryStart('.Innate Spellcasting. The toad casts')?.name).toBe('Innate Spellcasting');
  });

  it('does not take a sentence for an entry', () => {
    expect(entryStart('The stalker hides. It waits.')).toBeUndefined();
    expect(entryStart('Hit. The blow lands.')).toBeUndefined();
    expect(entryStart('heals. Then it rests.')).toBeUndefined();
  });

  it('keeps a numbered option inside the entry that lists it', () => {
    expect(entryStart('1. Glare Beam. The target blinks.')).toBeUndefined();
    expect(entryStart('10. Dust Beam. The target sneezes.')).toBeUndefined();
    // OCR reads a 5 as an S.
    expect(entryStart('S. Hush Beam. The target falls quiet.')).toBeUndefined();
  });
});

describe('small readers', () => {
  it('reads usage brackets the way the SRD data writes them', () => {
    expect(usageOf('(3/Day)')).toBe('3/day');
    expect(usageOf('(3JDay)')).toBe('3/day');
    expect(usageOf('(lfDay)')).toBe('1/day');
    expect(usageOf('(Recharge 5-6)')).toBe('Recharge 5–6');
    expect(usageOf('(Recharge 6)')).toBe('Recharge 6');
    expect(usageOf('(Recharges after a Short or Long Rest)')).toBe(
      'Recharges after a short or long rest',
    );
    expect(usageOf('(Costs 2 Actions)')).toBeUndefined();
  });

  it('repairs armor notes, but keeps a note with its own number', () => {
    expect(armorNote('r;1atura l armor')).toBe('natural armor');
    expect(armorNote('ieather armor, shie ld')).toBe('leather armor, shield');
    expect(armorNote('13 while prone')).toBe('13 while prone');
  });

  it('repairs spell list heads', () => {
    expect(fixSpellHead('lfday each : charm person')).toBe('1/day each: charm person');
    expect(fixSpellHead('lst level .(l slot): sleep')).toBe('1st level (1 slot): sleep');
    expect(fixSpellHead('Cantrips (at wi ll): light')).toBe('Cantrips (at will): light');
    expect(fixSpellHead('At will : mage hand')).toBe('At will: mage hand');
    expect(fixSpellHead('2fd ay each: fear')).toBe('2/day each: fear');
    expect(fixSpellHead('lst- Sth level (25th-level slots): blight')).toBe(
      '1st-5th level (2 5th-level slots): blight',
    );
    expect(fixSpellHead('Cantrip (at will): light')).toBe('Cantrips (at will): light');
    expect(fixSpellHead('Cantrips (at-wi ll ): light')).toBe('Cantrips (at will): light');
    expect(fixSpellHead(') 1fday: fog cloud')).toBe('1/day: fog cloud');
  });

  it('runs every in-line repair', () => {
    expect(cleanLine('Hit: l2 (2d6 4- 5) piercing damage. •', new Vocab())).toBe(
      'Hit: 12 (2d6 + 5) piercing damage.',
    );
  });

  it('reads property labels OCR split', () => {
    expect(propertyOf('Hit Point s 13 (2d8 + 4)')).toEqual({ key: 'hp', rest: '13 (2d8 + 4)' });
    expect(propertyOf('Arm or Class 15')).toEqual({ key: 'ac', rest: '15' });
    expect(propertyOf('The stalker is fast')).toBeUndefined();
  });

  it('reads type lines with one or two sizes', () => {
    expect(parseTypeLine('Large beast, unaligned')).toEqual({
      size: 'large',
      creatureType: 'beast',
      alignment: 'unaligned',
    });
    expect(parseTypeLine('Small or Medium Humanoid (any race), Typically Neutral')).toEqual({
      size: 'small',
      sizes: ['small', 'medium'],
      creatureType: 'humanoid (any race)',
      alignment: 'typically neutral',
    });
  });

  it('keeps every subtype tag when the brackets hold a comma', () => {
    expect(parseTypeLine('Large monstrosity (shapechanger, yuan -ti), neutral evil')).toEqual({
      size: 'large',
      creatureType: 'monstrosity (shapechanger, yuan-ti)',
      alignment: 'neutral evil',
    });
    expect(parseTypeLine('Medium humanoid (any ra,e); any alignment')).toMatchObject({
      creatureType: 'humanoid (any race)',
      alignment: 'any alignment',
    });
  });

  it('repairs OCR slips in the type, its tags and the alignment', () => {
    expect(cleanType('humarroid (cith)')).toBe('humanoid (gith)');
    expect(cleanType('abe rratio~ (shapechanger)')).toBe('aberration (shapechanger)');
    expect(cleanType('ciant')).toBe('giant');
    expect(cleanType('fiend (gno/1)')).toBe('fiend (gnoll)');
    expect(cleanType('humanoid (<thri-kreen)')).toBe('humanoid (thri-kreen)');
    expect(cleanType('swarm.of.tiny beasts')).toBe('swarm of tiny beasts');
    // A real tag the list does not know is kept, and a near one is not forced onto it.
    expect(cleanType('beast (mire toad)')).toBe('beast (mire toad)');
    expect(cleanType('humanoid (gnome)')).toBe('humanoid (gnome)');
    expect(cleanAlignment('urraligned')).toBe('unaligned');
    expect(cleanAlignment(", chaotic' evil")).toBe('chaotic evil');
    expect(cleanAlignment('any mn-good alignment')).toBe('any non-good alignment');
    expect(cleanAlignment('unaligi; led')).toBe('unaligned');
    expect(cleanAlignment('unaligned., ~;: r')).toBe('unaligned');
    expect(cleanAlignment('chaoticevil')).toBe('chaotic evil');
    expect(cleanAlignment("the mire toad's alignment")).toBe("the mire toad's alignment");
    expect(cleanAlignment('chaotic good (75%) or neutral evil (25%)')).toBe(
      'chaotic good (75%) or neutral evil (25%)',
    );
  });

  it('works out hit point averages and proficiency', () => {
    expect(averageHp('6d8+6')).toBe(33);
    expect(averageHp('2d6')).toBe(7);
    expect(averageHp('x')).toBeUndefined();
    expect([0, 4, 5, 17, 30].map(proficiencyForCr)).toEqual([2, 2, 3, 6, 9]);
  });

  it('matches option entries to the entry that lists them', () => {
    expect(sharesWord('Breath Weapons', 'Fire Breath')).toBe(true);
    expect(sharesWord('Breath Weapons', 'Bite')).toBe(false);
  });
});

describe('parseBlock', () => {
  const STALKER = [
    'Armor Class 14 (r;1atura l armor)',
    'Hit Points 33 (6d8 + 6)',
    'Speed 30 ft., fl y 60 ft.',
    'STR DEX CON INT WIS CHA',
    '14 (+2) 16 (.+3) 12 (+1i 4. (-3) 13 (+1) 6 (-2)',
    'Skills Intimidate +0, Perception +5, Stealth 4-5',
    'Damage Resistances cold; bludgeoning, piercing, and slashing from nonmagical attacks',
    'Condition Immunities charmed, frightened',
    'Senses darkvision 60 ft., passive Perception 14',
    "Languages understands Sylvan but can't speak Challenge 2 (450 XP)",
    'Reed Walk. The stalker ignores difficult terrain made of plants.',
    "Innate Spellcasting. The stalker's spellcasting ability is Wisdom. It can cast the following",
    'spells, needing no components:',
    'At will: druidcraft',
    'lfday each: entangle, fog cloud',
    'ACTIONS',
    'Multiattack. The stalker makes two claw attacks.',
    'Claw. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.',
    'Breath Weapons (Recharge 5-6). The stalker uses one of the following breath weapons.',
    'Spore Breath. Each creature in a 15-foot cone must make a DC 12 Constitution saving',
    'throw, taking 10 (3d6) poison damage on a failed save.',
    'Pollen Breath. Each creature in a 15-foot cone must succeed on a DC 12 Wisdom saving throw',
    'or fall asleep for 1 minute.',
    'LEGENDARY ACTIONS',
    'The stalker can take 2 legendary actions, choosing from the options below.',
    'Pounce. The stalker moves up to its speed.',
  ];
  const vocab = new Vocab();
  vocab.addTrusted(STALKER.slice(5).join(' '));
  vocab.addTrusted('natural armor');

  const stalker = parseBlock(
    block(STALKER, {
      heading: 'REED STALKER',
      typeLine: 'Medium monstrosity, unaligned',
      family: 2,
    }),
    vocab,
  );

  it('reads the properties, repairing OCR slips', () => {
    expect(stalker).toMatchObject({
      page: 3,
      family: 2,
      heading: 'REED STALKER',
      size: 'medium',
      creatureType: 'monstrosity',
      alignment: 'unaligned',
      ac: 14,
      acNote: 'natural armor',
      hp: 33,
      hpFormula: '6d8+6',
      speed: { walk: 30, fly: 60 },
      abilities: { STR: 14, DEX: 16, CON: 12, INT: 4, WIS: 13, CHA: 6 },
      skills: { intimidation: 0, perception: 5, stealth: 5 },
      resistances: ['cold', 'bludgeoning, piercing, and slashing from nonmagical attacks'],
      conditionImmunities: ['charmed', 'frightened'],
      languages: "understands Sylvan but can't speak",
      cr: 2,
      xp: 450,
      proficiencyBonus: 2,
    });
  });

  it('prefers the worked-out passive Perception over a misprint, and says so', () => {
    expect(stalker.senses).toEqual({ darkvision: 60, passivePerception: 15 });
    expect(stalker.issues).toContain('passive Perception read 14, worked out 15');
  });

  it('reads traits with spell lists, actions, option entries and section intros', () => {
    expect(stalker.traits.map((entry) => entry.name)).toEqual(['Reed Walk', 'Innate Spellcasting']);
    expect(stalker.traits[1]!.text).toBe(
      "The stalker's spellcasting ability is Wisdom. It can cast the following spells, needing no components:" +
        '\n\n- At will: druidcraft\n- 1/day each: entangle, fog cloud',
    );
    expect(stalker.actions.map((entry) => entry.name)).toEqual([
      'Multiattack',
      'Claw',
      'Breath Weapons',
    ]);
    expect(stalker.actions[1]).toMatchObject({
      attackBonus: 5,
      damage: [{ dice: '1d8+3', type: 'slashing' }],
    });
    const breath = stalker.actions[2]!;
    expect(breath.usage).toBe('Recharge 5–6');
    expect(breath.text).toContain('\nSpore Breath. Each creature in a 15-foot cone');
    expect(breath.text).toContain('\nPollen Breath. Each creature');
    expect(breath.damage).toEqual([{ dice: '3d6', type: 'poison' }]);
    expect(stalker.intros.legendaryActions).toBe(
      'The stalker can take 2 legendary actions, choosing from the options below.',
    );
    expect(stalker.legendaryActions.map((entry) => entry.name)).toEqual(['Pounce']);
    expect(stalker.issues).toEqual(['passive Perception read 14, worked out 15']);
  });

  it('splits merged spell list lines and keeps prose from beside the list out of it', () => {
    const lines = [
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'Innate Spellcasting. The wisp casts these spells, needing no components: At will: light,',
      'mage hand lfday each: fog cloud',
      '3fday: sleep (only on itself and one',
      'creature that is willing)',
      'hunters that are patient and',
      'it regains them at dawn.',
      'ACTIONS',
      'Touch. Melee Spell Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) cold damage.',
    ];
    const local = new Vocab();
    local.addTrusted(lines.join(' '));
    const wisp = parseBlock(block(lines), local);
    expect(wisp.traits[0]!.text).toBe(
      'The wisp casts these spells, needing no components:' +
        '\n\n- At will: light, mage hand\n- 1/day each: fog cloud' +
        '\n- 3/day: sleep (only on itself and one creature that is willing)' +
        '\nhunters that are patient and it regains them at dawn.',
    );
  });

  it('flags what OCR lost and keeps the printed CR and XP for review', () => {
    const toad = parseBlock(
      block([
        'Armor Class 11',
        'Hit Points 7 (2d6)',
        'Speed 20 ft., swim 30 ft.',
        '10 (+0) 12 (+1) 10 (+0) 2 (-4) 8 (-1) 4 (-3)',
        'Languages lgnan, Ore',
        'Challenge 5 (100 XP)',
        'Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 3 (1d4 + 1) piercing damage.',
        'Tongue. Melee Weapon Attack. +1 2 t0 hit, reach 10 ft., one target. Hit: 2 bludgeoning damage.',
        'Spit. Ranged Weapon Attack: +JO to hit, range 20 ft., one target. Hit: 2 acid damage.',
      ]),
      new Vocab(),
    );
    expect(toad.actions.slice(1)).toMatchObject([
      {
        attackBonus: 12,
        text: 'Melee Weapon Attack: +12 to hit, reach 10 ft., one target. Hit: 2 bludgeoning damage.',
      },
      { attackBonus: 10, text: expect.stringMatching(/^Ranged Weapon Attack: \+10 to hit,/) },
    ]);
    expect(toad).toMatchObject({
      speed: { walk: 20, swim: 30 },
      abilities: { STR: 10, DEX: 12, CON: 10, INT: 2, WIS: 8, CHA: 4 },
      languages: 'Ignan, Orc',
      cr: 5,
      xp: 100,
      senses: { passivePerception: 9 },
    });
    expect(toad.actions.map((entry) => entry.name)).toEqual(['Bite', 'Tongue', 'Spit']);
    expect(toad.issues).toEqual([
      'type line missing',
      'passive Perception worked out from Wisdom',
      'ACTIONS heading missing',
    ]);
  });

  it('mends a glued label, merged modifiers and a rating lost into its label', () => {
    const newt = parseBlock(
      block([
        'ArmorClassll',
        'Hit Points 7 (2d6)',
        'Speed 20 ft.',
        '10 (+0) ’2 H) 10 (+0) 2 H) 8 (-1) 4H)',
        'Challenges (1,800 XP)',
        'ACTIONS',
        'Bite. Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 3 (1d4 + 1) piercing damage.',
      ]),
      new Vocab(),
    );
    expect(newt).toMatchObject({
      ac: 11,
      abilities: { STR: 10, DEX: 12, CON: 10, INT: 2, WIS: 8, CHA: 4 },
      printedModifiers: { DEX: 1, INT: -4, CHA: -3 },
      cr: 5,
      xp: 1800,
    });
    expect(newt.issues).toContain('challenge rating taken from the XP: "(1,800 XP)"');
  });

  it('reads a hover note that names the trait behind it', () => {
    const kite = parseBlock(
      block([
        'Armor Class 12',
        'Hit Points 9 (2d6 + 2)',
        'Speed 10 ft., fly 40 ft. (hover, Kite Cloak), swim 20 ft.',
        '10 (+0) 12 (+1) 10 (+0) 2 (-4) 8 (-1) 4 (-3)',
        'Challenge 1/8 (25 XP)',
      ]),
      new Vocab(),
    );
    expect(kite.speed).toEqual({ walk: 10, fly: 40, hover: true, swim: 20 });
    expect(kite.issues.filter((issue) => issue.startsWith('speed'))).toEqual([]);
  });

  it('takes up an entry again when its lower-case rest follows another entry', () => {
    const lines = [
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'ACTIONS',
      'Grip. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) bludgeoning',
      'damage. If the target is Small or smaller,',
      'Mire Lore (1/Day). A sidebar entry that ends in a full stop.',
      'it is grappled (escape DC 12).',
      'Croak. The toad croaks within 5 ft.',
      'of a creature it can see.',
    ];
    const local = new Vocab();
    local.addTrusted(lines.join(' '));
    const toad = parseBlock(block(lines), local);
    expect(toad.actions.map((entry) => [entry.name, entry.text])).toEqual([
      [
        'Grip',
        'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) bludgeoning ' +
          'damage. If the target is Small or smaller, it is grappled (escape DC 12).',
      ],
      ['Mire Lore', 'A sidebar entry that ends in a full stop.'],
      ['Croak', 'The toad croaks within 5 ft. of a creature it can see.'],
    ]);
  });

  it('keeps numbered options and a sentence running onto a lower-case attack line in one entry', () => {
    const lines = [
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'ACTIONS',
      'Tinker Kit. The gnome uses one of the following options:',
      '1. Glue Pot. The gnome throws a pot of sticky',
      'glue. Ranged Weapon Attack: +4 to hit, range 5/20 ft., one target. Hit: 2 (1d4) acid damage.',
      'S. Spring Coil. The gnome bounces 10 feet.',
      'Poke. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.',
    ];
    const local = new Vocab();
    local.addTrusted(lines.join(' '));
    const gnome = parseBlock(block(lines), local);
    expect(gnome.actions.map((entry) => entry.name)).toEqual(['Tinker Kit', 'Poke']);
    expect(gnome.actions[0]!.text).toContain('1. Glue Pot.');
    expect(gnome.actions[0]!.text).toContain('sticky glue. Ranged Weapon Attack');
  });

  it("names each variant's actions after the variant", () => {
    const lines = [
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'ACTIONS FOR FORM 1',
      'Peck (Bird Form Only). Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 3 (1d4 + 1) piercing damage.',
      'ACT IONS FOR F O RM 2',
      'Kick. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.',
      'REACTIONS',
      'Hop. The pooka moves 5 feet.',
    ];
    const local = new Vocab();
    local.addTrusted(lines.join(' '));
    const pooka = parseBlock(block(lines), local);
    expect(pooka.actions.map((entry) => entry.name)).toEqual([
      'Peck (Form 1, Bird Form Only)',
      'Kick (Form 2)',
    ]);
    expect(pooka.actions[1]!.attackBonus).toBe(4);
    expect(pooka.reactions.map((entry) => entry.name)).toEqual(['Hop']);
  });

  it('reads a lost language list as none, and flags a block with no actions', () => {
    const wisp = parseBlock(
      block([
        'Armor Class 10',
        'Hit Points 1 (1d4 - 1)',
        'Speed 0 ft.',
        'Languages —',
        'Challenge 0 (0 XP)',
      ]),
      new Vocab(),
    );
    expect(wisp).toMatchObject({ languages: '', cr: 0, xp: 0 });
    expect(wisp.issues).toContain('no actions');
    expect(wisp.issues).toContain('ability scores: only 0 of 6 read');
  });
});
