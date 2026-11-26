import { describe, expect, it } from 'vitest';
import type { Column, Line, Page } from './layout.ts';
import {
  bandOrder,
  isAbilityHeader,
  isArmorClass,
  isCaps,
  isHitPoints,
  isJunk,
  isNoise,
  isTypeLine,
  sectionOf,
  variantOf,
  segment,
  startsLike,
} from './segment.ts';

/** Made-up lines down one column, 12 points apart; a number before the text sets its height. */
function column(c: Column, top: number, rows: (string | [string, number])[]): Line[] {
  return rows.map((row, i) => {
    const [t, h] = typeof row === 'string' ? [row, 9] : row;
    return { t, x: 40 + c * 300, y: top + i * 12, h, c };
  });
}

const page = (n: number, lines: Line[]): Page => ({ n, w: 600, h: 800, lines });

describe('line tests', () => {
  it('matches keywords through small OCR slips', () => {
    expect(startsLike('Armer C lass 15', 'Armor Class')).toBe(true);
    expect(startsLike('Speed 30 ft.', 'Armor Class')).toBe(false);
  });

  it('tells property lines from prose', () => {
    expect(isArmorClass('Armor Class 13 (hide armor)')).toBe(true);
    expect(isArmorClass('armor class 13 against the blast')).toBe(false);
    expect(isArmorClass('ArmorClassll (hide armor)')).toBe(true);
    expect(isArmorClass('Armor Classes differ by armor')).toBe(false);
    expect(isHitPoints('Hit Points 22 (4d8 + 4)')).toBe(true);
    expect(isHitPoints('hit points or fewer')).toBe(false);
    expect(isHitPoints('(2d8 + 2) hit points.')).toBe(false);
  });

  it('finds size-and-type lines', () => {
    expect(isTypeLine('Large beast, unaligned')).toBe(true);
    expect(isTypeLine('Small or Medium Humanoid, Typically Neutral')).toBe(true);
    expect(isTypeLine('Large enough to swallow a cart whole')).toBe(false);
  });

  it('reads section headings through split words', () => {
    expect(sectionOf('ACT IONS')).toBe('actions');
    expect(sectionOf('Legendary Act ions')).toBe('legendaryActions');
    expect(sectionOf('Bonus Actions')).toBe('bonusActions');
    expect(sectionOf('Reactions')).toBe('reactions');
    expect(sectionOf('ACT IONS FOR T Y PE 2')).toBe('actions');
    expect(variantOf('ACTIONS FOR TYP E 3')).toBe('Type 3');
    expect(variantOf('ACTIONS')).toBeUndefined();
    expect(sectionOf('A CT IO N S')).toBe('actions');
    expect(sectionOf('The toad acts first each round')).toBeUndefined();
  });

  it('finds the ability header, whole or split', () => {
    expect(isAbilityHeader('STR DEX CON INT WIS CHA')).toBe(true);
    expect(isAbilityHeader('S TR DEX CON')).toBe(true);
    expect(isAbilityHeader('STRONG')).toBe(false);
  });

  it('flags lines with no real text', () => {
    expect(isJunk('~ I •! , ,I')).toBe(true);
    expect(isJunk('...........')).toBe(true);
    expect(isJunk('it.')).toBe(false);
    expect(isJunk('8 (-1) 14 (+2) 12 (+1)')).toBe(false);
  });

  it('flags marks read from art inside a block', () => {
    expect(isNoise('i - --7 # qzz tr: -· g>--ee: ¥4ii')).toBe(true);
    expect(isNoise('1 · ·: · 2~ er ---;-a R')).toBe(true);
    expect(isNoise('the toad croaks ~ and the frog • sings')).toBe(false);
    expect(isNoise('Hit: 5 (1d6 + 2) piercing damage.')).toBe(false);
    expect(isNoise('Hit Points 45 (6d8 + 18) ~ ••')).toBe(false);
  });

  it('finds short capitals titles', () => {
    expect(isCaps('BOG LORE')).toBe(true);
    expect(isCaps('Bog Lore')).toBe(false);
  });
});

describe('segment', () => {
  it('cuts a block from its heading to the next title, and keeps the lore around it', () => {
    const lines = column(0, 100, [
      ['TOADS', 16],
      'Toads of the mire are slow and patient hunters.',
      ['MIRE TOAD', 16],
      'Small beast, unaligned',
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'Speed 20 ft., swim 40 ft.',
      'STR DEX CON INT WIS CHA',
      '8 (-1) 14 (+2) 12 (+1) 2 (-4) 10 (+0) 3 (-4)',
      'Senses passive Perception 10',
      'Challenge 1/4 (50 XP)',
      'Amphibious. The toad can breathe air and water.',
      'ACTIONS',
      'Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
      '~ I •! , ,I',
      'BOG LORE',
      'Mire toads sing at dusk in the reeds.',
    ]);
    const { blocks, families } = segment([page(7, lines)]);
    expect(blocks).toHaveLength(1);
    const [block] = blocks;
    expect(block!.heading).toBe('MIRE TOAD');
    expect(block!.typeLine).toBe('Small beast, unaligned');
    expect(block!.page).toBe(7);
    expect(block!.lines.map((line) => line.t)).toEqual(lines.slice(4, 14).map((line) => line.t));
    expect(block!.family).toBe(0);
    expect(families).toHaveLength(1);
    expect(families[0]!.title).toBe('TOADS');
    expect(families[0]!.sections.map((s) => [s.title, s.lines.map((line) => line.t)])).toEqual([
      [undefined, ['Toads of the mire are slow and patient hunters.']],
      ['BOG LORE', ['Mire toads sing at dusk in the reeds.']],
    ]);
  });

  it('applies reviewer fixes to lore headings and lets only capitalised lines open families', () => {
    const lines = column(0, 100, [
      ['GLOOMBATS', 16],
      'Gloombats roost under bridges.',
      ['paralyzed, poisoned', 16],
      ['Languages Common', 16],
      ['Ma rsh Wisps', 16],
      'Marsh wisps lure travellers into the bog.',
      'Reed hounds hunt the wisps by smell.',
      'MOSS CREEP ER~ ;',
      'Moss creepers climb old walls.',
      ['STRAY LANTERN', 16],
      'A different chapter begins here.',
    ]);
    const { families } = segment(
      [page(3, lines)],
      [
        { page: 3, text: 'Ma rsh Wisps', title: 'Marsh Wisps' },
        { page: 3, text: 'Reed hounds hunt', title: 'Reed Hounds' },
        { page: 3, text: 'MOSS CREEP ER', title: 'Moss Creepers' },
        { page: 3, text: 'STRAY LANTERN' },
        { page: 3, text: 'A different chapter' },
      ],
    );
    expect(
      families.map((f) => [f.title, f.sections.flatMap((s) => s.lines.map((l) => l.t))]),
    ).toEqual([
      ['GLOOMBATS', ['Gloombats roost under bridges.', 'paralyzed, poisoned', 'Languages Common']],
      ['Marsh Wisps', ['Marsh wisps lure travellers into the bog.']],
      ['Reed Hounds', ['Reed hounds hunt the wisps by smell.']],
      ['Moss Creepers', ['Moss creepers climb old walls.']],
      [undefined, ['A different chapter begins here.']],
    ]);
    // The damaged capitals heading is consumed, not kept as a section title.
    expect(families[3]!.sections.map((s) => s.title)).toEqual([undefined]);
  });

  it('demotes, drops and matches whole lines, and gives a bare heading to the family a fix opens', () => {
    const lines = column(0, 100, [
      ['REEDFOLK', 16],
      'Reedfolk weave homes from rushes.',
      ['REED ELDER', 16],
      'The eldest reedfolk speak for the village.',
      'MUD OTTER',
      'Mud otters are kept as pets.',
      'Otter pelt, 2 gp',
      'BOG HARE.',
      'BOG HARE',
      'Bog hares dig under the dykes.',
    ]);
    const { families } = segment(
      [page(3, lines)],
      [
        { page: 3, text: 'REED ELDER', as: 'section' },
        { page: 3, text: 'Mud otters are', title: 'Mud Otters' },
        { page: 3, text: 'Otter pelt, 2 gp', as: 'drop' },
        { page: 3, text: 'BOG HARE.', title: 'Bog Hares' },
        { page: 3, text: 'BOG HARE', as: 'drop' },
      ],
    );
    expect(
      families.map((f) => [f.title, f.sections.map((s) => [s.title, s.lines.map((l) => l.t)])]),
    ).toEqual([
      [
        'REEDFOLK',
        [
          [undefined, ['Reedfolk weave homes from rushes.']],
          ['REED ELDER', ['The eldest reedfolk speak for the village.']],
        ],
      ],
      ['Mud Otters', [['MUD OTTER', ['Mud otters are kept as pets.']]]],
      ['Bog Hares', [[undefined, ['Bog hares dig under the dykes.']]]],
    ]);
  });

  it('rejects a lore fix that matches no line', () => {
    const lines = column(0, 100, [['GLOOMBATS', 16], 'Gloombats roost under bridges.']);
    expect(() => segment([page(3, lines)], [{ page: 4, text: 'GLOOMBATS' }])).toThrow(
      'No lore line matches override 4:GLOOMBATS.',
    );
  });

  it('keeps a spell list set as tall as lore text, and its wrapped line, in the block', () => {
    const lines = column(0, 100, [
      ['WISPS', 16],
      ['Wisps drift over the bog at night.', 11],
      ['Travellers follow them into the mud.', 11],
      ['Few of those travellers come back.', 11],
      ['BOG WISP', 16],
      'Tiny undead, chaotic evil',
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'Speed 0 ft., fly 40 ft.',
      'STR DEX CON INT WIS CHA',
      '1 (-5) 14 (+2) 12 (+1) 6 (-2) 10 (+0) 12 (+1)',
      'Senses passive Perception 10',
      'Challenge 1 (200 XP)',
      'Innate Spellcasting. The wisp casts these spells, needing no components:',
      ['At will: dancing lights, mage hand, minor illusion,', 11],
      ['silent image', 11],
      'ACTIONS',
      'Touch. Melee Spell Attack: +4 to hit, reach 5 ft., one target.',
    ]);
    const { blocks, families } = segment([page(5, lines)]);
    const wrapped = blocks[0]!.lines.find((line) => line.t === 'silent image');
    expect(wrapped?.lore).toBe(true);
    expect(blocks[0]!.lines.map((line) => line.t)).toContain(
      'At will: dancing lights, mage hand, minor illusion,',
    );
    expect(families[0]!.sections.flatMap((s) => s.lines.map((line) => line.t))).toEqual([
      'Wisps drift over the bog at night.',
      'Travellers follow them into the mud.',
      'Few of those travellers come back.',
    ]);
  });

  it('keeps a bold numbered option and a bold run-in as tall as lore in the block', () => {
    const lines = column(0, 100, [
      ['WISPS', 16],
      ['Wisps drift over the bog at night.', 11],
      ['Travellers follow them into the mud.', 11],
      ['Few of those travellers come back.', 11],
      ['BOG WISP', 16],
      'Tiny undead, chaotic evil',
      'Armor Class 12',
      'Hit Points 9 (2d6 + 2)',
      'Speed 0 ft., fly 40 ft.',
      'STR DEX CON INT WIS CHA',
      '1 (-5) 14 (+2) 12 (+1) 6 (-2) 10 (+0) 12 (+1)',
      'Senses passive Perception 10',
      'Challenge 1 (200 XP)',
      ['Glow Sense. The wisp knows where each light within', 10.8],
      '60 feet of it is.',
      'ACTIONS',
      'Flicker. The wisp shines one of these lights at a creature:',
      ['1. Pale Light. The creature must succeed on', 12],
      'a DC 11 Wisdom saving throw or be dazzled.',
    ]);
    const { blocks } = segment([page(5, lines)]);
    const texts = blocks[0]!.lines.map((line) => line.t);
    expect(texts).toContain('Glow Sense. The wisp knows where each light within');
    expect(texts).toContain('1. Pale Light. The creature must succeed on');
  });

  /** A made-up block head and its first trait, down the left column. */
  const toadHead = [
    ['TOADS', 16],
    ['Toads of the mire are slow and patient hunters.', 11],
    ['They wait in the reeds for days at a time.', 11],
    ['Villagers leave them alone for good luck.', 11],
    ['MIRE TOAD', 16],
    'Small beast, unaligned',
    'Armor Class 12',
    'Hit Points 9 (2d6 + 2)',
    'Speed 20 ft., swim 40 ft.',
    'STR DEX CON INT WIS CHA',
    '8 (-1) 14 (+2) 12 (+1) 2 (-4) 10 (+0) 3 (-4)',
    'Senses passive Perception 10',
    'Challenge 1/4 (50 XP)',
    'Amphibious. The toad can breathe air and water.',
  ] satisfies (string | [string, number])[];

  it('goes on past a small margin quote and drops small print between its columns', () => {
    const right = column(1, 100, [
      ['THE TOAD SINGS AND THE MIRE LISTENS', 6],
      'Keen Smell. The toad has advantage on smell checks.',
      ['a footnote set in the margin', 6],
      'ACTIONS',
      'Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
    ]);
    const { blocks, families } = segment([page(5, [...column(0, 100, toadHead), ...right])]);
    const texts = blocks[0]!.lines.map((line) => line.t);
    expect(texts.slice(-4)).toEqual([
      'Amphibious. The toad can breathe air and water.',
      'Keen Smell. The toad has advantage on smell checks.',
      'ACTIONS',
      'Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
    ]);
    expect(texts).not.toContain('a footnote set in the margin');
    expect(families[0]!.sections.flatMap((s) => [s.title, ...s.lines.map((l) => l.t)])).toContain(
      'THE TOAD SINGS AND THE MIRE LISTENS',
    );
  });

  it('ends at a variant sidebar title set as small as the block', () => {
    const right = column(1, 100, [
      'VARIANT: TOAD KING',
      'Some mire toads grow fat and rule a pond.',
      'Multiattack. The king makes two bite attacks.',
    ]);
    const { blocks } = segment([page(5, [...column(0, 100, toadHead), ...right])]);
    expect(blocks[0]!.lines.at(-1)!.t).toBe('Amphibious. The toad can breathe air and water.');
  });

  it('on a later page goes on only with an entry, and stops at a card that lost its name', () => {
    const tail = [
      'ACTIONS',
      'Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target.',
      'Hit: 4 (1d4 + 2) piercing damage.',
    ];
    const note = column(0, 100, [
      'Or a frog. or just a toad. Ask',
      'remember to feed the toads at dusk',
      'or they sing all night long.',
      'Tongue. Melee Weapon Attack: +4 to hit, reach 10 ft., one target.',
    ]);
    // Lore prose in the other column sets the page's text sizes.
    const lore = column(1, 100, [
      ['Mire toads gather in the shallows each spring.', 11],
      ['Their song carries for miles over the water.', 11],
      ['Herons and snakes follow the sound to feed.', 11],
    ]);
    const head = page(5, column(0, 100, [...toadHead, ...tail]));
    const noted = segment([head, page(6, [...note, ...lore])]);
    const texts = noted.blocks[0]!.lines.map((line) => line.t);
    expect(texts.at(-1)).toBe('Tongue. Melee Weapon Attack: +4 to hit, reach 10 ft., one target.');
    expect(texts).not.toContain('or they sing all night long.');
    expect(texts).not.toContain('Or a frog. or just a toad. Ask');

    const headless = column(0, 100, [
      'Saving Throws Dex +4',
      'Challenge 1 (200 XP)',
      'Slam. Melee Weapon Attack: +5 to hit, reach 5 ft., one target.',
    ]);
    const cut = segment([head, page(6, [...headless, ...lore])]);
    expect(cut.blocks[0]!.lines.at(-1)!.t).toBe('Hit: 4 (1d4 + 2) piercing damage.');
  });

  it('starts a block at Hit Points when OCR lost Armor Class', () => {
    const lines = column(0, 100, [
      'Armor Class 11',
      'Hit Points 5 (1d8 + 1)',
      'Speed 30 ft.',
      'Challenge 0 (10 XP)',
      'Hit Points 7 (2d6)',
      'Speed 40 ft.',
    ]);
    const { blocks } = segment([page(1, lines)]);
    expect(blocks.map((block) => block.lines.map((line) => line.t))).toEqual([
      ['Armor Class 11', 'Hit Points 5 (1d8 + 1)', 'Speed 30 ft.', 'Challenge 0 (10 XP)'],
      ['Hit Points 7 (2d6)', 'Speed 40 ft.'],
    ]);
  });
});

describe('bandOrder', () => {
  const left = column(0, 100, [
    'MIRE TOAD',
    'Small beast, unaligned',
    'Armor Class 12',
    'Hit Points 9 (2d6 + 2)',
  ]).concat(
    column(0, 300, [
      'BOG HOUND',
      'Medium beast, unaligned',
      'Armor Class 13',
      'Hit Points 11 (2d8 + 2)',
    ]),
  );
  const rightTop = column(1, 100, [
    'Amphibious. The toad breathes air and water.',
    'ACTIONS',
    'Bite. Melee Weapon Attack: +4 to hit.',
  ]);

  it('reads a page band by band when a second block starts under the first', () => {
    const rightLow = column(1, 330, ['Keen Smell. The hound has advantage.', 'ACTIONS']);
    const ordered = bandOrder(page(1, [...left, ...rightTop, ...rightLow]));
    expect(ordered.map((line) => line.t)).toEqual(
      [...left.slice(0, 4), ...rightTop, ...left.slice(4), ...rightLow].map((line) => line.t),
    );
  });

  it('keeps column order when the text after the gap is a sidebar', () => {
    const sidebar = column(1, 330, ['HOUND TRAINING', 'Hounds learn fast from patient handlers.']);
    const lines = [...left, ...rightTop, ...sidebar];
    expect(bandOrder(page(1, lines))).toEqual(lines);
  });
});
