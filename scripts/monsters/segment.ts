/**
 * Stage 4 of the monster pipeline: cut a book's reading-order lines into stat blocks and lore.
 * Pure functions. A stat block is found by its "Armor Class" line; the size-and-type line and
 * the name heading above it are optional, because OCR loses them on some pages.
 */
import { editDistance, type Line, type Page } from './layout.ts';

const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** A line in book order, with the page it came from and its size class on that page. */
export interface FlowLine extends Line {
  page: number;
  printed?: number;
  /** Printed in the lore font: larger than stat block text on the same page. */
  lore: boolean;
  /** A heading: much larger than body text on the same page. */
  big: boolean;
}

export interface RawBlock {
  page: number;
  printed?: number;
  /** The name heading as OCR read it, when there is one. */
  heading?: string;
  /** "Large monstrosity, unaligned", when OCR kept it. */
  typeLine?: string;
  /** From the Armor Class line (or Hit Points, when that is lost) to the block's end. */
  lines: FlowLine[];
  /** Index into `Segmented.families` of the lore family the block belongs to. */
  family?: number;
}

export interface LoreSection {
  title?: string;
  lines: FlowLine[];
}

/** A family of creatures: a heading with the lore under it and the blocks that follow. */
export interface LoreFamily {
  title?: string;
  page: number;
  printed?: number;
  sections: LoreSection[];
}

export interface Segmented {
  blocks: RawBlock[];
  families: LoreFamily[];
}

/** Letters only, lower case: OCR splits words and drops punctuation unpredictably. */
export const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** True when the line starts with `keyword`, give or take an OCR slip or two. */
export function startsLike(text: string, keyword: string): boolean {
  const key = letters(keyword);
  const head = letters(text).slice(0, key.length);
  if (head.length < key.length - 1) return false;
  return editDistance(head, key) <= (key.length >= 9 ? 2 : 1);
}

/**
 * A property line: opens with a capital, with its number close behind. "hit points or fewer"
 * and "(2d8 + 2) hit points." are prose.
 */
const property = (text: string, label: string) =>
  startsLike(text, label) && /^\W{0,2}[A-Z]/.test(text) && /^.{0,22}\d/.test(text.trim());
export const isArmorClass = (text: string) => property(text, 'Armor Class');
export const isHitPoints = (text: string) => property(text, 'Hit Points');

const SIZE = /^\W{0,3}(?:tiny|small|medium|large|huge|gargantuan)\b/i;
const ALIGNMENT = /\b(?:lawful|chaotic|neutral|good|evil|unaligned|alignment)\b/i;

/** "Medium humanoid (any race), any alignment" or "Small or Medium Humanoid, Typically ..." */
export const isTypeLine = (text: string) =>
  SIZE.test(text) && (text.includes(',') || ALIGNMENT.test(text)) && words(text).length <= 14;

export const SECTIONS = {
  actions: 'actions',
  bonusactions: 'bonusActions',
  reactions: 'reactions',
  legendaryactions: 'legendaryActions',
  mythicactions: 'mythicActions',
  lairactions: 'lairActions',
} as const;
export type SectionKey = (typeof SECTIONS)[keyof typeof SECTIONS];

/** The block section a heading line opens ("ACT IONS", "Legendary Actions"), if any. */
export function sectionOf(text: string): SectionKey | undefined {
  if (words(text).length > 4) return undefined;
  const key = letters(text);
  for (const [name, section] of Object.entries(SECTIONS)) {
    if (editDistance(key, name) <= (name.length >= 12 ? 2 : 1)) return section;
  }
  return undefined;
}

/** "STR DEX CON INT WIS CHA", whole or in part. */
export const isAbilityHeader = (text: string) =>
  /^(?:STR|DEX|CON|INT|WIS|CHA){2,6}$/.test(text.replace(/[^A-Z]/g, ''));

/**
 * A line with no real text: rules, leader dots, stray marks, or art read as text ("~ I •! , ,I"):
 * no three letters in a row and at least as many odd marks as letters.
 */
export function isJunk(text: string): boolean {
  const core = text.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (core < 2) return true;
  const marks = text.replace(/[\p{L}\p{N}\s.,:;()'"+-]/gu, '').length;
  return !/[\p{L}\p{N}]{3}/u.test(text) && marks >= core;
}

/** Mostly capital letters, short: a heading or sidebar title in small caps. */
export function isCaps(text: string): boolean {
  const all = text.replace(/[^\p{L}]/gu, '');
  if (all.length < 3 || words(text).length > 8) return false;
  const upper = all.replace(/[^\p{Lu}]/gu, '').length;
  return upper / all.length >= 0.8;
}

/**
 * Text sizes on one page. Stat blocks are printed a little smaller than lore, so a page that
 * holds both shows two clusters of line heights; `split` sits between them. Scans scale pages
 * differently, so this is measured per page, never per book.
 */
export function pageLevels(page: Page): { split: number; big: number; lore: number } {
  const body = page.lines.filter((line) => words(line.t).length >= 3).map((line) => line.h);
  const all = median(body.length > 0 ? body : page.lines.map((line) => line.h));
  // Bold or italic runs (entry names, type lines) set a line a little taller than plain text of
  // the same size, so they would blur the two clusters.
  const plain = page.lines.filter(
    (line) => words(line.t).length >= 3 && !isTypeLine(line.t) && !RUN_IN.test(line.t),
  );
  const heights = plain
    .map((line) => line.h)
    .filter((h) => h < all * 1.5)
    .sort((a, b) => a - b);
  // Stat lines (Armor Class, Speed, scores, ...) are stat text by definition, so the split sits
  // above nearly all of them. OCR heights wobble, so the top few are allowed to stray.
  const stat = page.lines
    .filter((line) => STAT_LINE.test(line.t))
    .map((line) => line.h)
    .sort((a, b) => a - b);
  const statTop =
    stat.length === 0 ? 0 : stat[Math.min(stat.length - 1, Math.floor(stat.length * 0.85))]!;
  let best = { ratio: 1, at: -1 };
  for (let k = 3; k <= heights.length - 3; k++) {
    if (heights[k - 1]! < statTop) continue;
    const ratio = heights[k]! / heights[k - 1]!;
    if (ratio > best.ratio) best = { ratio, at: k };
  }
  if (best.ratio >= 1.03) {
    const stat = median(heights.slice(0, best.at));
    const lore = median(heights.slice(best.at));
    return {
      split: (heights[best.at - 1]! + heights[best.at]!) / 2,
      big: Math.max(stat * 1.3, lore * 1.15),
      lore,
    };
  }
  // One text size. A page with a stat block on it is stat text; any other page is lore.
  const hasBlock = page.lines.some((line) => isArmorClass(line.t));
  return {
    split: hasBlock ? Infinity : -Infinity,
    big: all * (hasBlock ? 1.3 : 1.2),
    lore: hasBlock ? Infinity : -Infinity,
  };
}

/** A stat block property or score line. */
const STAT_LINE =
  /^(?:Armou?r Class|Hit Points|Speed|Saving Throws|Skills|Damage|Condition|Senses|Languages|Challenge|STR\b)|^\d+\s*\(\s*[+-]/;

/** A line that opens with a bold run-in name: "Keen Sight. The hawk ...". */
const RUN_IN = /^[A-Z][\w'’-]*(?:\s+[\w'’/,-]+){0,5}(?:\s*\([^)]{1,40}\))?\.\s/;

/** A name heading: short, no closing punctuation, set large or in capitals. */
function isNameHeading(line: FlowLine): boolean {
  const text = line.t.trim();
  if (words(text).length > 7 || /[.:;,]$/.test(text) || letters(text).length < 3) return false;
  if (sectionOf(text) || isAbilityHeader(text) || isTypeLine(text) || isArmorClass(text)) {
    return false;
  }
  return line.big || isCaps(text);
}

/** Lines that end a stat block: a heading, or a capitals title (sidebars, tables, lore). */
function endsBlock(line: FlowLine): boolean {
  if (sectionOf(line.t) || isAbilityHeader(line.t)) return false;
  return line.big || isCaps(line.t);
}

/** A heading, type or Armor Class line that belongs to a stat block's head. */
function opensBlock(lines: readonly Line[], i: number): boolean {
  const text = lines[i]!.t;
  if (isArmorClass(text)) return true;
  if (sectionOf(text) || isAbilityHeader(text)) return false;
  if (!isTypeLine(text) && !isCaps(text)) return false;
  return lines.slice(i + 1, i + 4).some((line) => isArmorClass(line.t));
}

/** The first line of a stat block's head (its name, else its type, else Armor Class). */
function startsBlockAt(lines: readonly Line[], i: number): boolean {
  return opensBlock(lines, i) && !(i > 0 && opensBlock(lines, i - 1));
}

/**
 * Some pages print stat blocks in bands: block A fills the top of both columns and block B the
 * part below. Column order would read A's left half, B's left half, then A's right half. A band
 * break is a block start in the left column where the right column has a wide gap and then goes
 * on with text that is not a new block; lines are then read band by band.
 */
export function bandOrder(page: Page): Line[] {
  const left = page.lines.filter((line) => line.c === 0);
  const right = page.lines.filter((line) => line.c === 1);
  if (left.length === 0 || right.length === 0) return page.lines;
  const gap = 3 * median(page.lines.map((line) => line.h));
  const breaks: number[] = [];
  let since = -Infinity;
  left.forEach((line, i) => {
    if (!startsBlockAt(left, i)) return;
    const at = line.y - gap / 3;
    const top = since;
    since = at;
    const before = right.filter((other) => other.y < at).at(-1);
    const k = right.findIndex((other) => other.y >= at);
    if (!before || k < 0 || right[k]!.y - before.y < gap || startsBlockAt(right, k)) return;
    // A title after the gap starts a sidebar or lore, not the rest of a block.
    const next = right[k]!.t;
    if (isCaps(next) && !sectionOf(next) && !isAbilityHeader(next)) return;
    // A block that starts in the right column above the gap owns the text after it.
    if (right.some((other, r) => other.y >= top && other.y < at && startsBlockAt(right, r))) return;
    breaks.push(at);
  });
  if (breaks.length === 0) return page.lines;
  const bounds = [-Infinity, ...breaks, Infinity];
  const out: Line[] = [];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const inBand = (line: Line) => line.y >= bounds[b]! && line.y < bounds[b + 1]!;
    for (const column of [2, 0, 1] as const) {
      out.push(...page.lines.filter((line) => line.c === column && inBand(line)));
    }
  }
  return out;
}

/** Every line of the pages, in reading order, with its size class. */
export function toFlow(pages: readonly Page[]): FlowLine[] {
  return pages.flatMap((page) => {
    const { split, big, lore } = pageLevels(page);
    return bandOrder(page).map((line) => ({
      ...line,
      page: page.n,
      ...(page.printed !== undefined && { printed: page.printed }),
      // A bold run-in line counts as lore only when it is as tall as the lore text itself.
      lore: line.h > split && (!RUN_IN.test(line.t) || line.h >= lore * 0.98),
      big: line.h >= big,
    }));
  });
}

/**
 * Stat blocks and lore families from a run of pages. A block runs from its heading to the next
 * block or to a heading. Lore-sized lines inside that span belong to the lore: some books set a
 * block in a box that the lore text flows around.
 */
export function segment(pages: readonly Page[]): Segmented {
  const flow = toFlow(pages);
  const anchors: number[] = [];
  flow.forEach((line, i) => {
    if (isArmorClass(line.t)) anchors.push(i);
    else if (isHitPoints(line.t)) {
      const before = flow.slice(Math.max(0, i - 3), i);
      if (!before.some((prev) => isArmorClass(prev.t))) anchors.push(i);
    }
  });

  const starts = anchors.map((anchor) => {
    let start = anchor;
    let typeLine: number | undefined;
    let heading: number | undefined;
    let j = anchor - 1;
    const skipJunk = () => {
      while (j >= 0 && isJunk(flow[j]!.t)) j--;
    };
    skipJunk();
    if (j >= 0 && isTypeLine(flow[j]!.t)) {
      typeLine = j;
      start = j;
      j--;
      skipJunk();
    }
    // A name is never set smaller than the block itself (a quote's small-print byline is not one).
    if (j >= 0 && isNameHeading(flow[j]!) && flow[j]!.h >= flow[anchor]!.h * 0.9) {
      heading = j;
      start = j;
    }
    return { anchor, start, typeLine, heading };
  });

  const used = new Set<number>();
  const blocks: RawBlock[] = starts.map(({ anchor, typeLine, heading }, k) => {
    const end = starts[k + 1]?.start ?? flow.length;
    const lines: FlowLine[] = [flow[anchor]!];
    used.add(anchor);
    if (typeLine !== undefined) used.add(typeLine);
    if (heading !== undefined) used.add(heading);
    for (let j = anchor + 1; j < end; j++) {
      const line = flow[j]!;
      if (isJunk(line.t)) {
        used.add(j);
        continue;
      }
      if (sectionOf(line.t)) {
        lines.push(line);
        used.add(j);
        continue;
      }
      if (endsBlock(line)) break;
      if (line.lore) continue;
      lines.push(line);
      used.add(j);
    }
    const first = flow[heading ?? typeLine ?? anchor]!;
    return {
      page: first.page,
      ...(first.printed !== undefined && { printed: first.printed }),
      ...(heading !== undefined && { heading: flow[heading]!.t.trim() }),
      ...(typeLine !== undefined && { typeLine: flow[typeLine]!.t.trim() }),
      lines,
    };
  });

  // Lore: every line no block took. A large heading opens a family; the blocks after it belong
  // to that family until the next one.
  const families: LoreFamily[] = [];
  const blockAt = new Map(starts.map(({ start }, k) => [start, k]));
  let family: LoreFamily | undefined;
  const open = (line: FlowLine, title?: string): LoreFamily => {
    const next: LoreFamily = {
      ...(title !== undefined && { title }),
      page: line.page,
      ...(line.printed !== undefined && { printed: line.printed }),
      sections: [],
    };
    families.push(next);
    return next;
  };
  flow.forEach((line, i) => {
    const k = blockAt.get(i);
    if (k !== undefined) {
      family ??= open(line);
      blocks[k]!.family = families.indexOf(family);
    }
    if (used.has(i) || isJunk(line.t)) return;
    if (line.big && isNameHeading(line)) {
      family = open(line, line.t.trim());
      return;
    }
    family ??= open(line);
    const section = family.sections.at(-1);
    if (isCaps(line.t) && words(line.t).length <= 8) {
      family.sections.push({ title: line.t.trim(), lines: [] });
    } else if (section) section.lines.push(line);
    else family.sections.push({ lines: [line] });
  });

  // `family` here is only the last heading before the block. A block printed before its
  // family's heading (or in the other column) is moved by the identify step, which knows names.
  return { blocks, families: families.map(dropEmptySections) };
}

function dropEmptySections(family: LoreFamily): LoreFamily {
  const sections: LoreSection[] = [];
  for (const section of family.sections) {
    // A title with nothing under it is the heading of the next section's group: keep it as one.
    if (section.lines.length === 0 && section.title === undefined) continue;
    sections.push(section);
  }
  return { ...family, sections };
}
