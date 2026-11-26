/**
 * Lore text for the pack: each family's lines cleaned, minus what OCR picked up around the prose.
 * Margin quotes, artists' credits, page headers and stray stat lines sit on the same pages as the
 * lore and come through as junk lines, odd section titles or short sections.
 */
import { joinLines, type Vocab } from './clean.ts';
import type { PackLoreFamily } from './pack.ts';
import { repairTitle } from './identify.ts';
import { cleanLine } from './parse.ts';
import { isAbilityHeader, isCaps, type FlowLine, type LoreFamily } from './segment.ts';

const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');
const wordsOf = (text: string) => text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A stat block property, a score row or a size-and-type line that ended up in the lore. */
const STAT_FRAGMENT =
  /^(?:Armou?r Class\s+[\dlIS]{1,2}\b|Hit Points\s+\d|Speed\s+\d|Challenge\s+[\d/lI]+\s*\(|Proficiency Bonus\s*\+|Saving Throws\s+(?:Str|Dex|Con|Int|Wis|Cha)\b|Skills\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*\+|Senses\s+(?:darkvision|blindsight|tremorsense|truesight|passive)|Damage\s+(?:Immunities|Resistances|Vulnerabilities)\b|Condition\s+Immunities\b|Languages\b(?!\s*\.)|\d{1,2}\s*\(\s*[-+–]\s*\d)/;
const TYPE_LINE =
  /^(?:tiny|small|medium|large|huge|gargantuan)\b[^,]{0,40},\s*(?:any|unaligned|lawful|chaotic|neutral|typically)\b/i;

export function isStatFragment(text: string): boolean {
  const line = text.trim();
  return (
    STAT_FRAGMENT.test(line) ||
    isAbilityHeader(line) ||
    (TYPE_LINE.test(line) && line.split(/\s+/).length <= 8)
  );
}

/** The share of words the vocabulary knows. Single letters other than "a" and "I" count as unknown. */
export function knownShare(text: string, vocab: Vocab): number {
  const words = wordsOf(text);
  if (words.length === 0) return 0;
  return words.filter((word) => vocab.isWord(word)).length / words.length;
}

/** Marks OCR read from rules, art and leader dots, taken out of a line. */
export function stripInlineJunk(text: string): string {
  return text
    .replace(/[~=_]{3,}-?/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        !/^[^\p{L}\p{N}]+$/u.test(token) ||
        token === '...' ||
        token === '…' ||
        (token.length < 3 && /^["'()\-—–.,;:!?]+$/.test(token)),
    )
    .join(' ');
}

/**
 * Title repairs: a 0 for an O and a 1 for an apostrophe in capitals, a middle dot for a hyphen,
 * "VARIANT!" for "VARIANT:", marks at either end.
 */
export function tidyTitle(title: string): string {
  return title
    .replace(/(?<=[A-Z])1(?=S\b|[A-Z])/g, "'")
    .replace(/(?<=[A-Z])0|0(?=[A-Z])/g, 'O')
    .replace(/(?<=[A-Z])(?:[-·] |·)(?=[A-Z])/g, '-')
    .replace(/^VARIANT[!;](?= )/, 'VARIANT:')
    .replace(/(?<=[A-Z]) (?=['’]S\b)/g, '')
    .replace(/^[^\p{L}\p{N}"(]+/u, '')
    .replace(/[\s.,;:~_=\-—–•·'"]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Capitals titles with OCR slips: a mark or a small l inside a word ("ElEM.ENTALS"), a misread
 * letter, and words split in pieces ("ACT IONS FOR T Y PE"). The split chosen leaves the fewest
 * unknown pieces; on a tie, words stay apart ("IN TO" is not "INTO").
 */
export function mendCapsTitle(title: string, vocab: Vocab): string {
  if (!isCaps(title)) return title;
  /** A token's marks before, its word, and a possessive 's or marks after. */
  const split = (token: string) => {
    const [, lead = '', core = '', tail = ''] =
      /^([^\p{L}]*)(.*?)((?:['’][sS])?[^\p{L}]*)$/u.exec(token) ?? [];
    return { lead, core, tail: tail.toUpperCase() };
  };
  const tokens = title.split(' ').map((token) => {
    const { lead, core, tail } = split(token);
    if (!/[^\p{Lu}'’-]/u.test(core)) return lead + core + tail;
    const plain = core.replace(/[^\p{L}]/gu, '');
    // A small l among capitals is a capital I ("lLNEVAL"), unless that spells a known word.
    if (/^[\p{Lu}l'’-]+$/u.test(core) && !vocab.isTrusted(plain))
      return lead + core.replace(/l/g, 'I') + tail;
    const form = [plain, plain.replace(/l/g, 'I')].find((word) => vocab.isWord(word));
    return form ? lead + form.toUpperCase() + tail : token;
  });
  /**
   * A group of tokens read as one word, with its cost, or undefined when they cannot join. A word
   * known only from the books costs a little: OCR glues words there ("OFLOLTH", "AG OLD"). A lone
   * word one letter off a known word ("DkAGON", "MAKINC") costs the same, so it is mended only
   * when it is not a piece of a longer word.
   */
  const read = (group: readonly string[]): { cost: number; text: string } | undefined => {
    if (group.length === 1) {
      const { lead, core, tail } = split(group[0]!);
      const plain = core.replace(/[^\p{L}]/gu, '');
      if (plain === '' || vocab.isTrusted(core.replace(/[^\p{L}']/gu, '')))
        return { cost: 0, text: group[0]! };
      // A plural the vocabulary lacks ("TALISMANS") and a hyphenated name are not slips.
      const slip =
        plain.length >= 6 &&
        !core.includes('-') &&
        !vocab.isWord(plain) &&
        !vocab.isWord(plain.replace(/e?s$/i, ''));
      const near = slip ? vocab.nearest(plain) : undefined;
      if (near) return { cost: 0.5, text: lead + near.toUpperCase() + tail };
      return { cost: 1, text: group[0]! };
    }
    const last = /^(\p{Lu}+)\W*$/u.exec(group.at(-1)!);
    if (!last || !group.slice(0, -1).every((piece) => /^\p{Lu}+$/u.test(piece))) return undefined;
    const text = group.join('');
    const word = group.slice(0, -1).join('') + last[1]!;
    if (vocab.isTrusted(word)) return { cost: 0, text };
    const glued = group[0]!.length <= 3 && vocab.isTrusted(group[0]!);
    return vocab.isWord(word) && !glued ? { cost: 0.5, text } : undefined;
  };
  // best[i]: the cheapest reading of the first i tokens, then the one with the most groups.
  const best: { cost: number; groups: string[] }[] = [{ cost: 0, groups: [] }];
  for (let i = 1; i <= tokens.length; i++) {
    for (let k = 1; k <= Math.min(4, i); k++) {
      const step = read(tokens.slice(i - k, i));
      if (step === undefined) continue;
      const total = best[i - k]!.cost + step.cost;
      const groups = [...best[i - k]!.groups, step.text];
      const now = best[i];
      if (!now || total < now.cost || (total === now.cost && groups.length > now.groups.length))
        best[i] = { cost: total, groups };
    }
  }
  return best[tokens.length]!.groups.join(' ');
}

/**
 * A title ending in a creature's name, with that name repaired: "DROW I NQU I SITOR",
 * "MADNESS OF ZU CCTMOY". Only a name repair is taken from repairTitle, which also drops a
 * trailing number ("TYPE 1").
 */
function nameTitle(
  title: string,
  creatures: readonly string[],
  names: ReadonlyMap<string, string>,
  vocab: Vocab,
): string {
  const parts = title.split(' ');
  for (let from = 0; from < parts.length; from++) {
    const tail = parts.slice(from).join(' ');
    if (from > 0 && letters(tail).length < 6) break;
    const repaired = names.get(letters(tail)) ?? repairTitle(tail, creatures, vocab);
    if (repaired === tail) continue;
    if (!names.has(letters(repaired)) && letters(repaired) === letters(tail)) continue;
    // "OF GRAZ'ZT" is not a slip for "Graz'zt": a known first word must stay in the repair.
    const first = letters(parts[from]!);
    if (vocab.isTrusted(first) && !letters(repaired).startsWith(first)) continue;
    const name = isCaps(title) ? repaired.toUpperCase() : repaired;
    return [...parts.slice(0, from), name].join(' ');
  }
  return title;
}

/** What a section's text and the book know about its title. */
interface TitleContext {
  raw: string;
  text: string;
  family: string;
  vocab: Vocab;
  /** Creature names and their plurals, keyed by their bare letters. */
  names: ReadonlyMap<string, string>;
}

/**
 * Whether a section keeps its title. Page headers start with a page number and quote bylines
 * with a dash. An artist's credit is one capitals word the text under it never mentions; a
 * one-word title stays when it is a creature's name or a known word with nothing trailing it.
 */
function keepsTitle(title: string, { raw, text, family, vocab, names }: TitleContext) {
  if (letters(title).length < 3 || /^\W*[-—–]/.test(raw)) return false;
  if (/\d/.test(title.split(' ')[0]!) || /\bCHAPTER\b/i.test(title)) return false;
  if (letters(title) === letters(family)) return false;
  if (/[~<>\\¥§£#■|]/.test(title)) return false;
  if (/\s/.test(title)) return knownShare(title, vocab) >= 0.6;
  if (letters(text).includes(letters(title).slice(0, 5))) return true;
  const trimmed = raw.trim();
  const trailing = trimmed.length - trimmed.replace(/[\s.,;:~_=\-—–•·'"]+$/u, '').length;
  return trailing <= 1 && (names.has(letters(title)) || vocab.isTrusted(title));
}

/** Stat block text: an attack, a challenge line, a spell list or a recharging trait. */
const STAT_TEXT =
  /(?:Weapon|Spell) Attack|^Challenge\s|Cantrips \(at will\)|^Innate Spellcasting|\(Recharges? /;

/**
 * Whether a section's text is real prose, not a quote fragment, scraps, garble or a piece of a
 * stat block. A short text needs most of its words from the clean data: OCR repeats its slips
 * often enough for the books to know them.
 */
function isProse(text: string, vocab: Vocab): boolean {
  const words = wordsOf(text);
  if (words.length < 4 || knownShare(text, vocab) < 0.5) return false;
  if (words.length < 15) {
    if (words.filter((word) => vocab.isTrusted(word)).length / words.length < 0.65) return false;
  }
  if (text.length < 200 && STAT_TEXT.test(text)) return false;
  const all = text.replace(/[^\p{L}]/gu, '');
  return all.replace(/[^\p{Lu}]/gu, '').length / all.length < 0.8;
}

/**
 * One family's lore. A capitals line set smaller than the lore (a margin quote) or mostly made of
 * unknown words goes, as do stray stat lines; sections left with no real prose go too.
 */
function cleanFamily(
  family: LoreFamily,
  vocab: Vocab,
  creatures: readonly string[],
  names: ReadonlyMap<string, string>,
): PackLoreFamily {
  const all = family.sections.flatMap((section) => section.lines);
  const size = median(all.filter((line) => wordsOf(line.t).length >= 3).map((line) => line.h));
  const keepLine = (line: FlowLine) => {
    const text = line.t.trim();
    if (isStatFragment(text)) return false;
    if (!isCaps(text)) return true;
    return line.h >= size * 0.8 && knownShare(text, vocab) >= 0.6;
  };
  const sections: PackLoreFamily['sections'] = [];
  for (const section of family.sections) {
    const raw = section.title ?? '';
    if (raw && isStatFragment(raw)) continue;
    const text = joinLines(
      section.lines.filter(keepLine).map((line) => cleanLine(stripInlineJunk(line.t), vocab)),
      vocab,
    );
    if (!isProse(text, vocab)) continue;
    const mended = mendCapsTitle(tidyTitle(raw), vocab);
    // A title can be a creature's name OCR damaged ("STEGOSAURl!S"); the index names repair it.
    const title = nameTitle(mended, creatures, names, vocab);
    const context = { raw, text, family: family.title ?? '', vocab, names };
    sections.push({ ...(raw && keepsTitle(title, context) && { title }), text });
  }
  return {
    ...(family.title !== undefined && { title: family.title }),
    page: family.page,
    sections,
  };
}

/**
 * The pack's lore, one family for each family found: a family's index is part of its id.
 * `creatures` are the book's creature names, used to repair and keep section titles.
 */
export function buildLore(
  families: readonly LoreFamily[],
  vocab: Vocab,
  creatures: readonly string[] = [],
): PackLoreFamily[] {
  const names = new Map(
    creatures.flatMap((name) => [`${name}s`, name].map((form) => [letters(form), form] as const)),
  );
  return families.map((family) => cleanFamily(family, vocab, creatures, names));
}
