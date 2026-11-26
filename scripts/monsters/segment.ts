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

/**
 * A reviewer's fix for a family heading that OCR lost, damaged or made up. `text` is the
 * heading as OCR read it, or the first words of the lore line that opens a family whose heading
 * was lost. With a `title`, the heading is renamed or the line opens a family of that name.
 * Without one, the heading line is dropped or the line opens an untitled family that no creature
 * links to. `as: 'section'` keeps the line as a section heading of the family before it (a
 * creature heading OCR set as large as a family's), and `as: 'drop'` drops any line.
 */
export interface LorePatch {
  /** Printed page of the line. */
  page: number;
  text: string;
  title?: string;
  as?: 'section' | 'drop';
}

/** Letters only, lower case: OCR splits words and drops punctuation unpredictably. */
export const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

/** True when the line starts with `keyword`, give or take an OCR slip or two. */
export function startsLike(text: string, keyword: string): boolean {
  const key = letters(keyword);
  const normalized = letters(text);
  const limit = key.length >= 9 ? 2 : 1;
  return [key.length, key.length - 1, key.length + 1].some(
    (length) =>
      normalized.length >= length && editDistance(normalized.slice(0, length), key) <= limit,
  );
}

/**
 * A property line: opens with a capital, with its number close behind. "hit points or fewer"
 * and "(2d8 + 2) hit points." are prose. OCR can read the number as letters glued to the label
 * ("Armor Classll").
 */
const property = (text: string, label: string) =>
  startsLike(text, label) &&
  /^\W{0,2}[A-Z]/.test(text) &&
  /^.{0,22}(?:\d|\s[IlOo](?:\s|[().]|$)|(?:ss|ts)[IlO]{1,2}(?=[\s(]|$))/.test(text.trim());
export const isArmorClass = (text: string) => property(text, 'Armor Class');
export const isHitPoints = (text: string) => property(text, 'Hit Points');

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
const SIZE = /^\W{0,3}(?:tiny|small|medium|large|huge|gargantuan)\b/i;
const ALIGNMENT = /\b(?:lawful|chaotic|neutral|good|evil|unaligned|alignment)\b/i;
const GLUED_TYPE =
  /^([^\p{L}]{0,3}(?:tiny|small|medium|large|huge|gargantuan))(?=aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead)/iu;
export function spaceSize(text: string): string {
  const spaced = text.replace(GLUED_TYPE, '$1 ');
  if (SIZE.test(spaced) || !spaced.includes(',')) return spaced;
  const tokens = words(spaced);
  // OCR can split or damage the size adjective. The comma and alignment constrain the context.
  if (!ALIGNMENT.test(spaced)) return spaced;
  const choices: { size: (typeof SIZES)[number]; distance: number; span: number }[] = [];
  for (const span of [1, 2, 3]) {
    if (tokens.length <= span) break;
    const read = letters(tokens.slice(0, span).join('').replace(/^11/, 'H'));
    for (const size of SIZES) {
      const distance = editDistance(size, read);
      if (distance <= 2) choices.push({ size, distance, span });
    }
  }
  const [first, second] = choices.sort((a, b) => a.distance - b.distance);
  return first && first.distance !== second?.distance
    ? `${first.size} ${tokens.slice(first.span).join(' ')}`
    : spaced;
}

/** "Medium humanoid (any race), any alignment" or "Small or Medium Humanoid, Typically ..." */
export const isTypeLine = (text: string) =>
  SIZE.test(spaceSize(text)) &&
  (text.includes(',') || ALIGNMENT.test(text)) &&
  words(text).length <= 14;

export const SECTIONS = {
  actions: 'actions',
  bonusactions: 'bonusActions',
  reactions: 'reactions',
  legendaryactions: 'legendaryActions',
  mythicactions: 'mythicActions',
  lairactions: 'lairActions',
} as const;
export type SectionKey = (typeof SECTIONS)[keyof typeof SECTIONS];

/** "ACTIONS FOR TYPE 2" heads one variant's actions; OCR can space it apart. Returns "Type 2". */
export function variantOf(text: string): string | undefined {
  const match = /^ACTIONSFOR([A-Z]+)(\d+)$/.exec(text.replace(/\s+/g, ''));
  return match ? `${match[1]![0]}${match[1]!.slice(1).toLowerCase()} ${match[2]}` : undefined;
}

/** The block section a heading line opens ("ACT IONS", "Legendary Actions"), if any. */
export function sectionOf(text: string): SectionKey | undefined {
  if (variantOf(text)) return 'actions';
  // OCR can break a capitals heading into letter pairs ("A CT IO N S").
  if (words(text).length > (isCaps(text) ? 6 : 4)) return undefined;
  const key = letters(text);
  for (const [name, section] of Object.entries(SECTIONS)) {
    if (editDistance(key, name) <= (name.length >= 12 ? 2 : 1)) return section;
  }
  return undefined;
}

/** "STR DEX CON INT WIS CHA", whole or in part. */
export function isAbilityHeader(text: string): boolean {
  const key = text.replace(/[^A-Z]/g, '');
  if (/^(?:STR|DEX|CON|INT|WIS|CHA){2,6}$/.test(key)) return true;
  if (key.length < 8 || /[a-z]/.test(text)) return false;
  const labels = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  return labels.some((_, from) =>
    labels
      .slice(from + 2)
      .some((_, k) => editDistance(key, labels.slice(from, from + k + 3).join('')) <= 1),
  );
}

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

/**
 * Art or handwriting read as a few short words among marks no stat block prints ("i - -5 # zq
 * tr: ¥4ii"). A real word of four letters or more means a text line with a junk tail
 * ("Hit Points 45 (6d8) ~ ••"). A damaged title or a contents line can look alike, so only
 * lines inside a block's span are checked.
 */
export function isNoise(text: string): boolean {
  if (/\p{L}{4}/u.test(text)) return false;
  const odd = text.match(/[#¥§~·•=<>_^*\\©®¢£€|¼½]/gu)?.length ?? 0;
  const letters = text.replace(/[^\p{L}]/gu, '').length;
  return odd >= 2 && letters < text.replace(/\s/g, '').length * 0.6;
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
  // Bold or italic runs (entry names, type lines, spell lists) set a line a little taller than
  // plain text of the same size, so they would blur the two clusters: a page holding only stat
  // blocks would split its spell lists off as lore.
  const plain = page.lines.filter(
    (line) =>
      words(line.t).length >= 3 &&
      !isTypeLine(line.t) &&
      !RUN_IN.test(line.t) &&
      !SPELL_HEAD.test(line.t) &&
      !STAT_ENTRY.test(line.t),
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
const RUN_IN = /^[A-Z][\w'’/-]*(?:\s+[\w'’/,-]+){0,5}(?:\s*\([^)]{1,40}\))?\.\s/;

// An attack's bold run-in or separate Hit line can be as tall as surrounding lore.
const STAT_ENTRY =
  /^\W{0,3}(?:Hit\s*:|(?:Multiattack|False Appearance|(?:Innate )?Spellcasting)\s*[.:])|\b(?:Melee|Ranged)\s+(?:(?:or|and)\s+Ranged\s+)?(?:Weapon|Spell)\s+Attack\s*:/i;

/**
 * The head of a spell list line, OCR forms included: "At will:", "lfday each :", "1st level (4
 * slots):". Spell names are set in italics, so a long list can read as tall as lore text.
 */
export const SPELL_HEAD =
  /^\W{0,2}(?:At will|Cantrips?\s*\(at[\s-]*wi\s*ll\s*\)|[\dlIOS]{1,2}\s*[/fjJIl|t]?\s*d\s?ay(?:\s+each)?|[\dlIOS]{1,2}\s*(?:st|nd|rd|th)(?:\s*-\s*[\dlIOS]{1,2}\s*(?:st|nd|rd|th))?\s+level\s*\.?\s*\([^)]{0,20}slots?\))\s*[:;]/i;

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

/**
 * Where a block goes on after a break: the run of lines just above the stat marker at `marker`
 * that read as block text. The run stops at junk, a title, small print, lore prose (spell lists
 * excepted), a column change or a gap wider than the space between two traits.
 */
function resumeAt(flow: readonly FlowLine[], after: number, marker: number, size: number): number {
  let at = marker;
  for (let k = marker - 1; k > after; k--) {
    const line = flow[k]!;
    const below = flow[at]!;
    if (isJunk(line.t) || line.page !== below.page || line.c !== below.c) break;
    // A section heading has more space above it than two lines of one trait.
    if (below.y - line.y > size * (at === marker ? 3 : 2.3)) break;
    // Small print (a margin quote) can sit between two lines of the block.
    if (line.h < size * 0.72 && !endsBlock(line)) continue;
    // Text right under a title is a sidebar's, so the block goes on at the marker itself.
    if (endsBlock(line)) return marker;
    if (line.h < size * 0.9) break;
    const wrapsSpell = /^[a-z(]/.test(line.t.trim()) && SPELL_HEAD.test(flow[k - 1]?.t ?? '');
    if (line.lore && !SPELL_HEAD.test(line.t) && !wrapsSpell) break;
    at = k;
  }
  return at;
}

/** A block part heading OCR broke past `sectionOf` ("A CTIO ~·"), or a lair's own heading. */
function isPartHeading(text: string): boolean {
  const key = letters(text);
  if (key === 'lairactions' || key === 'regionaleffects') return true;
  return key.length >= 4 && Object.keys(SECTIONS).some((name) => name.startsWith(key));
}

/**
 * A stat-sized title a block may go on past: small print (a margin quote or a running header),
 * a part heading or stat line OCR read as a title, or the creature's own name set as a family
 * title. `size` is the block's text height and `name` its heading.
 */
function mayResume(line: FlowLine, size: number, name: string): boolean {
  const text = line.t.trim();
  return (
    line.h < size * 0.72 ||
    isPartHeading(text) ||
    STAT_LINE.test(text) ||
    (letters(name).length >= 3 && letters(text) === letters(name))
  );
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
      lore: line.h > split && (!RUN_IN.test(line.t) || line.h >= lore * 0.99),
      big: line.h >= big,
    }));
  });
}

/**
 * Stat blocks and lore families from a run of pages. A block runs from its heading to the next
 * block or to a heading. Lore-sized lines inside that span belong to the lore: some books set a
 * block in a box that the lore text flows around.
 */
export function segment(pages: readonly Page[], patches: readonly LorePatch[] = []): Segmented {
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
    const prior = flow[j];
    const head = flow[anchor]!;
    if (prior && prior.page === head.page && isTypeLine(prior.t)) {
      typeLine = j;
      start = j;
      j--;
      skipJunk();
    } else if (prior && prior.page === head.page && isNameHeading(prior)) {
      // Some narrow stat cards put the name and size on the same baseline, in reverse PDF order.
      const before = flow[j - 1];
      if (
        before &&
        before.page === head.page &&
        before.c === prior.c &&
        Math.abs(prior.y - before.y) <= Math.max(prior.h, before.h) * 2 &&
        isTypeLine(before.t)
      ) {
        typeLine = j - 1;
        start = typeLine;
      }
    }
    // A name is never set smaller than the block itself (a quote's small-print byline is not one).
    if (j >= 0 && isNameHeading(flow[j]!) && flow[j]!.h >= flow[anchor]!.h * 0.9) {
      heading = j;
      start = Math.min(start, j);
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
    // The block's text height, from its first lines: OCR can set one of them too tall.
    const size =
      median(
        flow
          .slice(anchor, Math.min(end, anchor + 10))
          .filter((line) => !line.lore && !isJunk(line.t))
          .map((line) => line.h),
      ) || flow[anchor]!.h;
    // A spell list line, and the lines its list wraps onto, belong to the block at any height.
    let inSpells = false;
    for (let j = anchor + 1; j < end; j++) {
      const line = flow[j]!;
      if (isJunk(line.t)) {
        used.add(j);
        continue;
      }
      // Stat-sized noise is skipped but left to the lore, where a fix may name a damaged running
      // header. A damaged family title is taller and still ends the block.
      if (isNoise(line.t) && !line.lore && line.h <= size * 1.15) continue;
      const last = lines[lines.length - 1]!;
      const turned = line.page !== last.page;
      // A stat line on a later page, after the challenge, opens a card that lost its name.
      if (turned && STAT_LINE.test(line.t) && lines.some((taken) => /^Challenge\b/.test(taken.t))) {
        break;
      }
      // OCR can split a heading into two pieces on one baseline ("A CTIO ~·" and "N S").
      const beside = flow[j + 1];
      const split =
        !sectionOf(line.t) &&
        beside !== undefined &&
        j + 1 < end &&
        beside.page === line.page &&
        Math.abs(beside.y - line.y) < line.h / 2 &&
        sectionOf(`${line.t} ${beside.t}`) !== undefined;
      if (split || sectionOf(line.t)) {
        lines.push(split ? { ...line, t: `${line.t} ${beside.t}` } : line);
        used.add(j);
        if (split) used.add(++j);
        inSpells = false;
        continue;
      }
      const spells: boolean =
        SPELL_HEAD.test(line.t) ||
        (inSpells && /^[a-z(]/.test(line.t.trim()) && !/\.\s+[A-Z]/.test(line.t));
      inSpells = spells && !/\.\s*$/.test(line.t);
      // The bold first option after a list's colon ("1. Glare Ray.") can be as tall as lore.
      const option = /^\d+\.\s+[A-Z]/.test(line.t) && /:\s*$/.test(last.t);
      if (!spells && !option && !STAT_ENTRY.test(line.t)) {
        if (endsBlock(line)) {
          // Art, a family title, a margin quote or a folio can sit between two columns of the
          // same block. Only resume when the same printed page has a stat marker before the next
          // block. A stat-sized title (a variant sidebar, a template, another family) ends it.
          if (!line.lore && !mayResume(line, size, heading === undefined ? '' : flow[heading]!.t)) {
            break;
          }
          const next = flow
            .slice(j + 1, end)
            .findIndex(
              (candidate) =>
                candidate.page === line.page &&
                (sectionOf(candidate.t) ||
                  STAT_ENTRY.test(candidate.t) ||
                  (!candidate.lore && STAT_LINE.test(candidate.t))),
            );
          if (next < 0) break;
          // On the block's own page, the block goes on at the run of block lines above that
          // marker. On a later page the lines above it open the next family's sidebar.
          const marker = j + 1 + next;
          j = (line.page === flow[anchor]!.page ? resumeAt(flow, j, marker, size) : marker) - 1;
          continue;
        }
        // Small print inside a block's span is a margin quote or a running header.
        if (line.lore || line.h < size * 0.72) continue;
      }
      if (turned) {
        // On a later page the block goes on with an entry, a stat line or the rest of a
        // sentence. Anything else there is a margin note or a sidebar. An entry's name ends on a
        // capital or a usage note ("Nest in a Bag.", "Bite (Toad Form Only)."); "Or a crook." does not.
        const name = RUN_IN.exec(line.t)?.[0];
        const opens =
          STAT_ENTRY.test(line.t) ||
          STAT_LINE.test(line.t) ||
          (name !== undefined && /(?:^|\s)[A-Z]\S*\.\s$|\)\.\s$/.test(name));
        if (!opens && !spells && /[.!?:]["”’)]?\s*$/.test(last.t)) continue;
      }
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
  // A family title opens with a capital and is never a stat line ("Languages Common").
  const isTitle = (line: FlowLine) =>
    line.big &&
    isNameHeading(line) &&
    /^\P{L}*\p{Lu}/u.test(line.t) &&
    !STAT_LINE.test(line.t.trim());
  const lorePage = (line: FlowLine) => line.printed ?? line.page;
  const lore = flow.filter((line, i) => !used.has(i) && !isJunk(line.t));
  // A fix names a title when one matches it whole, else the line its words open. Matching
  // keeps capitals, so "MERFOLK~" picks the heading and not "Merfolk tribes ...".
  const key = (text: string) => text.replace(/[^A-Za-z]/g, '');
  const forTitle = new Set(
    patches.filter((patch) =>
      lore.some(
        (line) => isTitle(line) && lorePage(line) === patch.page && key(line.t) === key(patch.text),
      ),
    ),
  );
  // A fix that spells a whole line matches that line only: "EVOKER." beside "EVOKER".
  const exact = new Set(
    patches.filter((patch) =>
      lore.some((line) => lorePage(line) === patch.page && line.t.trim() === patch.text),
    ),
  );
  const matched = new Map<LorePatch, number>();
  const patchFor = (line: FlowLine, heading: boolean) => {
    const text = key(line.t);
    const patch = patches.find(
      (candidate) =>
        candidate.page === lorePage(line) &&
        forTitle.has(candidate) === heading &&
        (exact.has(candidate)
          ? line.t.trim() === candidate.text
          : heading
            ? text === key(candidate.text)
            : text.startsWith(key(candidate.text))),
    );
    if (patch) matched.set(patch, (matched.get(patch) ?? 0) + 1);
    return patch;
  };
  flow.forEach((line, i) => {
    const k = blockAt.get(i);
    if (k !== undefined) {
      family ??= open(line);
      blocks[k]!.family = families.indexOf(family);
    }
    if (used.has(i) || isJunk(line.t)) return;
    const heading = isTitle(line);
    const patch = patchFor(line, heading);
    if (patch?.as === 'drop' || (!patch && !line.big && isNoise(line.t))) return;
    if (patch?.as === 'section') {
      family ??= open(line);
      family.sections.push({ title: patch.title ?? line.t.trim(), lines: [] });
      return;
    }
    if (patch && heading) {
      if (patch.title !== undefined) family = open(line, patch.title);
      return;
    }
    if (patch) {
      const previous = family;
      family = open(line, patch.title);
      // A large or capitals line the fix names is the lost heading itself, not lore text.
      if (line.big || (isCaps(line.t) && words(line.t).length <= 8)) return;
      // A heading left with no text just above the fixed lore line belongs to the new family.
      const last = previous?.sections.at(-1);
      if (last?.title !== undefined && !last.lines.length) {
        previous!.sections.pop();
        family.sections.push(last);
      }
    } else if (heading) {
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

  for (const patch of patches) {
    const count = matched.get(patch) ?? 0;
    if (count !== 1)
      throw new Error(
        `${count ? 'More than one' : 'No'} lore line matches override ${patch.page}:${patch.text}.`,
      );
  }

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
