import { describe, expect, it } from 'vitest';
import type { Column, Line, Page } from './layout.ts';
import {
  bandOrder,
  isAbilityHeader,
  isArmorClass,
  isCaps,
  isHitPoints,
  isJunk,
  isTypeLine,
  sectionOf,
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
