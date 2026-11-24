import { describe, expect, it } from 'vitest';
import type { Page } from './layout.ts';
import { expectedNames, parseIndexLine, type BookConfig } from './names.ts';

describe('parseIndexLine', () => {
  it('reads comma and dot leader entries', () => {
    expect(parseIndexLine('Mire Toad, 41')).toEqual([{ name: 'Mire Toad', page: 41 }]);
    expect(parseIndexLine('Dust Wisp ..............·....... 120')).toEqual([
      { name: 'Dust Wisp', page: 120 },
    ]);
  });

  it('reads several entries on one line', () => {
    expect(parseIndexLine('Bog Hound ....... 52 Glass Moth (larva) ......,•.... 61')).toEqual([
      { name: 'Bog Hound', page: 52 },
      { name: 'Glass Moth (larva)', page: 61 },
    ]);
  });

  it('reads OCR page numbers', () => {
    expect(parseIndexLine('Ash Imp, Il')).toEqual([{ name: 'Ash Imp', page: 11 }]);
    expect(parseIndexLine('Stone-eel, 32 1')).toEqual([{ name: 'Stone-eel', page: 321 }]);
    expect(parseIndexLine('Reed Elk .........IO5')).toEqual([{ name: 'Reed Elk', page: 105 }]);
  });

  it('reads a hyphen OCR set as a middle dot, and slashes in a name', () => {
    expect(parseIndexLine('Mud·hopper, 44')).toEqual([{ name: 'Mud-hopper', page: 44 }]);
    expect(parseIndexLine('Owl/Bat Hybrid ........ 70')).toEqual([
      { name: 'Owl/Bat Hybrid', page: 70 },
    ]);
  });

  it('keeps an entry whose page number OCR lost', () => {
    expect(parseIndexLine('Bog Hound ................ Illusory Owl ........ 61')).toEqual([
      { name: 'Bog Hound' },
      { name: 'Illusory Owl', page: 61 },
    ]);
  });

  it('skips cross references and contents headings', () => {
    expect(parseIndexLine('Herald. See Envoy.')).toEqual([]);
    expect(parseIndexLine('Part 2: Made Up Beasts ........ 37')).toEqual([]);
  });
});

describe('expectedNames', () => {
  const page = (n: number, lines: string[]): Page => ({
    n,
    w: 600,
    h: 800,
    lines: lines.map((t, i) => ({ t, x: 40, y: 100 + i * 12, h: 9, c: 0 })),
  });

  it('keeps entries on index pages that point into stat block chapters, once each', () => {
    const pages = [
      page(1, ['Mire Toad, 41']),
      page(2, ['Mire Toad, 41', 'Rules Primer, 5', 'Bog Hound, 52', 'Mire T oad, 41']),
    ];
    const names = expectedNames(pages, { offset: 1, index: [2], statBlocks: [[40, 60]] });
    expect(names).toEqual([
      { name: 'Mire Toad', page: 41 },
      { name: 'Bog Hound', page: 52 },
    ]);
  });

  it('reads only below the index heading when contents share the page', () => {
    const pages = [
      page(3, ['Part 3 Beasts ......... 45', 'INDEX OF BEASTS', 'Bog Hound ......... 52']),
    ];
    const config: BookConfig = {
      offset: 1,
      index: [3],
      indexHeading: 'Index of Beasts',
      statBlocks: [[40, 60]],
    };
    expect(expectedNames(pages, config)).toEqual([{ name: 'Bog Hound', page: 52 }]);
  });
});
