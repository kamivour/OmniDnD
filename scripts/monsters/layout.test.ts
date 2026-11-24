import { describe, expect, it } from 'vitest';
import {
  bookGutters,
  findGutter,
  groupLines,
  pageOffset,
  readingOrder,
  stripMargins,
  type Page,
  type Word,
} from './layout.ts';

const W = 600;
const H = 800;

/** Lays words out left to right from `x` on one line, 6 units per character. */
const line = (text: string, x: number, y: number, h = 9): Word[] => {
  const out: Word[] = [];
  let at = x;
  for (const s of text.split(' ')) {
    out.push({ x: at, y, w: s.length * 6, h, s });
    at += s.length * 6 + 3;
  }
  return out;
};

/** A two-column page: a large title across the top, then lines down each column. */
const twoColumns = () => [
  ...line('Made Up Beast Family', 240, 40, 20),
  ...Array.from({ length: 12 }, (_, i) => line(`left ${i} text here`, 40, 80 + i * 12)).flat(),
  ...Array.from({ length: 12 }, (_, i) => line(`right ${i} text here`, 320, 80 + i * 12)).flat(),
];

describe('findGutter', () => {
  it('finds the gap between two columns', () => {
    const gutter = findGutter(twoColumns(), W);
    expect(gutter).toBeGreaterThan(40 + 20 * 6);
    expect(gutter).toBeLessThan(320);
  });

  it('returns undefined for one column of text', () => {
    const words = Array.from({ length: 30 }, (_, i) =>
      line('a long line that runs across the whole page width', 40, 40 + i * 12),
    ).flat();
    expect(findGutter(words, W)).toBeUndefined();
  });
});

describe('groupLines', () => {
  it('joins words on one baseline in x order', () => {
    const words = [...line('Armor Class 13', 40, 100)].reverse();
    expect(groupLines(words, 0).map((l) => l.t)).toEqual(['Armor Class 13']);
  });

  it('keeps OCR fragments with no gap together', () => {
    const words: Word[] = [
      { x: 40, y: 100, w: 12, h: 9, s: 'In' },
      { x: 52, y: 100, w: 48, h: 9, s: 'telligence' },
    ];
    expect(groupLines(words, 0)[0]!.t).toBe('Intelligence');
  });
});

describe('bookGutters', () => {
  it('takes the usual gutter for odd and even pages', () => {
    expect(bookGutters([300, 290, undefined, 292, 301, 291])).toEqual([291, 301]);
  });
});

describe('readingOrder', () => {
  it('reads the title, then the left column, then the right column', () => {
    const words = twoColumns();
    const lines = readingOrder(words, findGutter(words, W));
    expect(lines[0]).toMatchObject({ t: 'Made Up Beast Family', c: 2 });
    expect(lines[1]!.t).toBe('left 0 text here');
    expect(lines[12]!.t).toBe('left 11 text here');
    expect(lines[13]).toMatchObject({ t: 'right 0 text here', c: 1 });
  });

  it('starts a new band below a full-width line', () => {
    const words = [
      ...Array.from({ length: 8 }, (_, i) => line(`top left ${i}`, 40, 80 + i * 12)).flat(),
      ...Array.from({ length: 8 }, (_, i) => line(`top right ${i}`, 320, 80 + i * 12)).flat(),
      ...line('A wide heading that crosses the middle', 120, 200, 16),
      ...Array.from({ length: 8 }, (_, i) => line(`low left ${i}`, 40, 230 + i * 12)).flat(),
      ...Array.from({ length: 8 }, (_, i) => line(`low right ${i}`, 320, 230 + i * 12)).flat(),
    ];
    const text = readingOrder(words, findGutter(words, W)).map((l) => l.t);
    expect(text.indexOf('top right 7')).toBeLessThan(
      text.indexOf('A wide heading that crosses the middle'),
    );
    expect(text.indexOf('A wide heading that crosses the middle')).toBeLessThan(
      text.indexOf('low left 0'),
    );
    expect(text.indexOf('low left 7')).toBeLessThan(text.indexOf('low right 0'));
  });

  it('keeps one-column text in order when read with a gutter', () => {
    const words = [
      ...line('a full line of text that runs across the middle of the page', 40, 100),
      ...line('short end', 40, 112),
      ...line('another full line of text that runs across the middle too', 40, 124),
    ];
    expect(readingOrder(words, 300).map((l) => l.t)).toEqual([
      'a full line of text that runs across the middle of the page',
      'short end',
      'another full line of text that runs across the middle too',
    ]);
  });
});

describe('stripMargins', () => {
  const page = (n: number, foot: string, extra: Page['lines'] = []): Page => ({
    n,
    w: W,
    h: H,
    lines: [
      { t: 'CHAPTER 1 | MADE UP', x: 40, y: 20, h: 8, c: 2 },
      { t: 'body text', x: 40, y: 300, h: 9, c: 0 },
      { t: foot, x: 290, y: 780, h: 8, c: 2 },
      ...extra,
    ],
  });

  it('drops running heads and reads printed page numbers', () => {
    const pages = stripMargins(Array.from({ length: 10 }, (_, i) => page(i + 1, String(i + 11))));
    expect(pages[0]!.lines.map((l) => l.t)).toEqual(['body text']);
    expect(pages[0]!.printed).toBe(11);
    expect(pageOffset(pages)).toBe(-10);
  });

  it('reads OCR page numbers inside a running foot', () => {
    const feet = ['I2', 'MADE UP | BEASTS 13', '14 MADE UP | BEASTS', 'MADE UP | BEASTS l5'];
    const pages = stripMargins([...feet, ...feet, ...feet].map((foot, i) => page(i + 1, foot)));
    expect(pages.slice(0, 4).map((p) => p.printed)).toEqual([12, 13, 14, 15]);
    expect(pages.every((p) => p.lines.length === 1)).toBe(true);
  });

  it('counts OCR spellings of one running head together', () => {
    const heads = ['MADE UP | BEASTS', 'MADE UP l BEASTS', 'MADE UP | BEA5TS', 'MADE UP ! BEASTS'];
    const pages = stripMargins(
      Array.from({ length: 12 }, (_, i) => ({
        n: i + 1,
        w: W,
        h: H,
        lines: [
          { t: heads[i % 4]!, x: 40, y: 20, h: 8, c: 2 as const },
          { t: 'body text', x: 40, y: 300, h: 9, c: 0 as const },
          { t: i === 5 ? 'MADE UP' : String(i + 1), x: 290, y: 780, h: 8, c: 2 as const },
        ],
      })),
    );
    expect(pages.every((p) => p.lines.length === 1)).toBe(true);
  });

  it('drops a small running head that repeats on only a few pages', () => {
    const pages = stripMargins(
      Array.from({ length: 100 }, (_, i) => ({
        n: i + 1,
        w: W,
        h: H,
        lines: [
          { t: 'body text', x: 40, y: 300, h: 9, c: 0 as const },
          ...(i % 25 === 0
            ? [{ t: 'Medium beast, unaligned', x: 40, y: 50, h: 9, c: 0 as const }]
            : []),
          ...(i < 4 ? [{ t: 'APPENDIX | MADE UP', x: 40, y: 780, h: 7, c: 2 as const }] : []),
        ],
      })),
    );
    expect(pages[0]!.lines.map((l) => l.t)).toEqual(['body text', 'Medium beast, unaligned']);
  });

  it('drops a small section name and a garbled page number at the foot', () => {
    const pages = stripMargins(
      Array.from({ length: 10 }, (_, i) =>
        page(
          i + 1,
          String(i),
          i === 4
            ? [
                { t: 'OWLBEARS', x: 50, y: 770, h: 6, c: 0 },
                { t: 'r6g', x: 560, y: 772, h: 8, c: 1 },
                { t: 'A SONG OF THE LONG ROAD, SUNG BADLY', x: 300, y: 765, h: 6, c: 1 },
              ]
            : [],
        ),
      ),
    );
    expect(pages[4]!.lines.map((l) => l.t)).toEqual([
      'body text',
      'A SONG OF THE LONG ROAD, SUNG BADLY',
    ]);
  });

  it('keeps a margin line that appears only once', () => {
    const pages = stripMargins(
      Array.from({ length: 10 }, (_, i) =>
        page(i + 1, String(i), i === 4 ? [{ t: 'Unique caption', x: 40, y: 770, h: 8, c: 2 }] : []),
      ),
    );
    expect(pages[4]!.lines.map((l) => l.t)).toContain('Unique caption');
  });
});
