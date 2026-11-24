/**
 * Stage 5 of the monster pipeline: undo OCR damage in context. Pure functions. Number fixes run
 * only where a number must be (dice, bonuses, scores); word fixes only touch words that are not
 * known and have exactly one close known spelling.
 */

const WORD = /(?<![a-z\d])[a-z]+(?:'[a-z]+)?/g;
const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Known words. `trusted` words come from clean text (the SRD import and our own content);
 * `book` words come from the OCR'd books, so they include OCR's mistakes: a word only counts
 * as known from the books when it shows up often.
 */
export class Vocab {
  readonly trusted = new Map<string, number>();
  readonly book = new Map<string, number>();
  /** Word pairs seen side by side in trusted text ("and one"), keyed "first second". */
  readonly pairs = new Map<string, number>();
  /** Every candidate word with one letter deleted, for finding a word one OCR slip away. */
  private deletes?: Map<string, string[]>;

  addTrusted(text: string): void {
    this.addTo(this.trusted, text);
    for (const run of text
      .toLowerCase()
      .replace(/[’]/g, "'")
      .split(/[^a-z' ]+/)) {
      const words = run.split(' ').filter(Boolean);
      for (let i = 1; i < words.length; i++) {
        const pair = `${words[i - 1]} ${words[i]}`;
        this.pairs.set(pair, (this.pairs.get(pair) ?? 0) + 1);
      }
    }
  }

  /** How often two words stand side by side in trusted text. */
  pairCount(first: string, second: string): number {
    return this.pairs.get(`${first.toLowerCase()} ${second.toLowerCase()}`) ?? 0;
  }

  trustedCount(word: string): number {
    return this.trusted.get(word.toLowerCase()) ?? 0;
  }

  /** Add trusted text first: a book word that is two known words glued ("ofthe") is skipped. */
  addBook(text: string): void {
    this.addTo(this.book, text, (word) => glueSplit(word, this) === undefined);
  }

  private addTo(map: Map<string, number>, text: string, keep?: (word: string) => boolean) {
    for (const word of text.toLowerCase().replace(/[’]/g, "'").match(WORD) ?? []) {
      if (keep && !map.has(word) && !keep(word)) continue;
      map.set(word, (map.get(word) ?? 0) + 1);
    }
    this.deletes = undefined;
  }

  /** Known from clean text. Single letters other than "a" and "I" are never words. */
  isTrusted(word: string): boolean {
    const lower = word.toLowerCase();
    if (lower.length === 1) return lower === 'a' || lower === 'i';
    return this.trusted.has(lower);
  }

  /** Known from clean text, or common enough in the books to be real. */
  isWord(word: string): boolean {
    return (
      this.isTrusted(word) || (word.length > 1 && (this.book.get(word.toLowerCase()) ?? 0) >= 3)
    );
  }

  private weight(word: string): number {
    return (this.trusted.get(word) ?? 0) * 3 + (this.book.get(word) ?? 0);
  }

  /** The one known word a single edit away from `word`, when the choice is clear. */
  nearest(word: string): string | undefined {
    const lower = word.toLowerCase();
    if (!this.deletes) {
      this.deletes = new Map();
      const candidates = new Set([
        ...this.trusted.keys(),
        ...[...this.book].filter(([, count]) => count >= 8).map(([known]) => known),
      ]);
      for (const known of candidates) {
        if (known.length < 4) continue;
        for (const variant of [known, ...deletions(known)]) {
          const list = this.deletes.get(variant);
          if (list) list.push(known);
          else this.deletes.set(variant, [known]);
        }
      }
    }
    const found = new Set<string>();
    // Deleting one letter from both sides covers one substitution, insertion or deletion.
    for (const variant of [lower, ...deletions(lower)]) {
      for (const known of this.deletes.get(variant) ?? []) found.add(known);
    }
    const ranked = [...found]
      .filter((known) => oneEditApart(lower, known))
      .sort((a, b) => this.weight(b) - this.weight(a));
    const [first, second] = ranked;
    if (!first) return undefined;
    if (second && this.weight(second) * 3 > this.weight(first)) return undefined;
    return first;
  }
}

function deletions(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) out.push(word.slice(0, i) + word.slice(i + 1));
  return out;
}

function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** OCR reads of digits: l, I and | for 1, O and o for 0, S for 5, B and & for 8. */
const DIGIT: Record<string, string> = {
  l: '1',
  I: '1',
  '|': '1',
  i: '1',
  O: '0',
  o: '0',
  S: '5',
  s: '5',
  B: '8',
  '&': '8',
};

/** A number OCR may have spelled with letters: "l5", "IO", "S". */
export function toNumber(token: string): number | undefined {
  const fixed = token.replace(/\s/g, '').replace(/[lI|iOoSsB&]/g, (char) => DIGIT[char] ?? char);
  return /^\d+$/.test(fixed) ? Number(fixed) : undefined;
}

const DIGITISH = '[\\dlI|OoSB&]';

/**
 * Dice in a parenthesis, as in a hit point or damage formula: "(8dl O+ 40)" becomes
 * "(8d10 + 40)", "{ld6 - 1}" becomes "(1d6 - 1)". MPMM reads a plus as "4-" ("5d8 4- 5").
 */
export function fixDice(text: string): string {
  // The die size stops before a "4-" so "8 4- 5" reads as d8 plus 5, not d84 minus 5.
  const paren = new RegExp(
    `[({]\\s*((?:${DIGITISH}\\s?){1,3})d\\s?(${DIGITISH}(?:\\s?(?!4\\s?-)${DIGITISH}){0,2})` +
      `(?:\\s*(4-|[+\\-–—−])\\s*((?:${DIGITISH}\\s?){1,3}))?\\s*[)}]`,
    'g',
  );
  return text.replace(
    paren,
    (whole, count: string, sides: string, sign?: string, bonus?: string) => {
      const n = toNumber(count);
      const d = toNumber(sides);
      if (n === undefined || d === undefined) return whole;
      if (!sign || !bonus) return `(${n}d${d})`;
      const b = toNumber(bonus);
      if (b === undefined) return whole;
      return `(${n}d${d} ${sign === '4-' || sign === '+' ? '+' : '-'} ${b})`;
    },
  );
}

const DIE_SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);

/**
 * Numbers spelled with letters where the wording says a number must stand: "+l to hit",
 * "DC l5", the average before a dice formula ("l2 (2d6 + 3)"), bare dice ("ld6"), distances
 * ("S ft.", "lO feet", "range 8O/32O ft."). Run after `fixDice`. MPMM reads "+7" as "4-7".
 */
export function fixNumbers(text: string): string {
  const num = `${DIGITISH}{1,3}`;
  const free = '(?<![A-Za-z\\d])';
  const number = (whole: string, token: string, make: (n: number) => string) => {
    const value = toNumber(token);
    return value === undefined ? whole : make(value);
  };
  return (
    text
      .replace(
        new RegExp(`(Attack:\\s*)4-\\s?(${num})(?=\\s*to\\s+hit)`, 'g'),
        (w, head: string, n: string) => number(w, n, (v) => `${head}+${v}`),
      )
      .replace(
        new RegExp(`([+\\-–—−])\\s?(${num})(?=\\s*to\\s+hit)`, 'g'),
        (w, sign: string, n: string) => number(w, n, (v) => `${sign === '+' ? '+' : '-'}${v}`),
      )
      .replace(new RegExp(`\\bDC\\s?(${num})(?![A-Za-z\\d])`, 'g'), (w, n: string) =>
        number(w, n, (v) => `DC ${v}`),
      )
      .replace(
        new RegExp(`${free}(${num})(\\s?)(?=\\(\\d+d\\d+)`, 'g'),
        (w, n: string, gap: string) => number(w, n, (v) => `${v}${gap || ' '}`),
      )
      .replace(
        new RegExp(`${free}([\\dlI]{1,2})d(${num})(?![A-Za-z\\d])`, 'g'),
        (w, count: string, sides: string) => {
          const n = toNumber(count);
          const d = toNumber(sides);
          return n === undefined || d === undefined || !DIE_SIDES.has(d) ? w : `${n}d${d}`;
        },
      )
      // OCR reads the slash as f or J ("range 80f320") and can repeat the unit ("80 ft. /320").
      .replace(/\brange\s(\d+)\s?ft\.\s?\/\s?(\d+)(?=\s?ft\b)/g, 'range $1/$2')
      .replace(
        new RegExp(`\\brange\\s(${num})\\s?[/fJj]\\s?(${num})`, 'g'),
        (w, a: string, b: string) => {
          const near = toNumber(a);
          const far = toNumber(b);
          return near === undefined || far === undefined ? w : `range ${near}/${far}`;
        },
      )
      .replace(
        new RegExp(`${free}(${num})(\\s?)(?=(?:ft\\b|feet\\b|-foot\\b))`, 'g'),
        (w, n: string, gap: string) => number(w, n, (v) => `${v}${gap}`),
      )
  );
}

/** Short words OCR glues to the next or previous one: "ofthe", "Acreature". */
const GLUE = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'for',
  'has',
  'if',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'to',
]);

/** Where to split a glued word ("ofthe" at 2), or undefined. */
export function glueSplit(word: string, vocab: Vocab): number | undefined {
  const lower = word.toLowerCase();
  if (vocab.isTrusted(lower) || lower.length < 4) return undefined;
  for (let cut = 1; cut < lower.length; cut++) {
    const head = lower.slice(0, cut);
    const tail = lower.slice(cut);
    if (GLUE.has(head) && tail.length >= 2 && vocab.isTrusted(tail)) return cut;
    if (GLUE.has(tail) && head.length >= 3 && vocab.isTrusted(head)) return cut;
  }
  return undefined;
}

/**
 * Word-level repairs on running text: rejoins words OCR split ("Mele e", "slash ing"), splits
 * words it glued ("ofthe"), and corrects single-letter slips ("exbales") when only one known
 * word is that close. Spelling fixes skip capitalized words: they are often names.
 */
export function fixWords(text: string, vocab: Vocab): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const joinAt = (at: number) => {
    for (const span of [4, 3, 2]) {
      if (at + span > tokens.length) continue;
      const joined = joinPieces(tokens.slice(at, at + span), vocab);
      if (joined !== undefined) return { joined, span };
    }
    return undefined;
  };
  for (let i = 0; i < tokens.length; i++) {
    const shifted =
      i + 1 < tokens.length ? shiftPair(tokens[i]!, tokens[i + 1]!, vocab) : undefined;
    if (shifted) [tokens[i], tokens[i + 1]] = shifted;
    let token = tokens[i]!;
    const join = joinAt(i);
    // "the re ga ins": a known word followed by pieces that join on their own stays apart,
    // unless clean text backs the other reading ("an d one" is "and one", not "an done") or,
    // with no backing either way, the other reading mends more pieces at once.
    const next = join && vocab.isTrusted(letters(token)) ? joinAt(i + 1) : undefined;
    const joinedPair =
      next && vocab.pairCount(letters(join!.joined), letters(tokens[i + join!.span] ?? ''));
    const keptPair = next && vocab.pairCount(letters(token), letters(next.joined));
    const keepFirst =
      next !== undefined &&
      (joinedPair! < keptPair! || (joinedPair === keptPair && next.span >= join!.span));
    if (join && !keepFirst) {
      token = join.joined;
      i += join.span - 1;
    }
    const match = /^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/.exec(token);
    out.push(match ? match[1]! + repairWord(match[2]!, vocab) + match[3]! : token);
  }
  return out.join(' ');
}

/** "(Perce" "ption)" -> "(Perception)", when the pieces are not all words and the whole is. */
function joinPieces(pieces: string[], vocab: Vocab): string | undefined {
  if (pieces.length < 2) return undefined;
  const first = /^([^A-Za-z]*)([A-Za-z]+)$/.exec(pieces[0]!);
  const last = /^([A-Za-z]+)((?:'s)?[^A-Za-z]*)$/.exec(pieces.at(-1)!);
  const middle = pieces.slice(1, -1);
  if (!first || !last || !middle.every((piece) => /^[a-z]+$/.test(piece))) return undefined;
  if (/^[A-Z]/.test(last[1]!)) return undefined;
  const parts = [first[2]!, ...middle, last[1]!];
  const whole = parts.join('');
  if (!vocab.isWord(whole)) return undefined;
  // Two real words join only when clean text almost never puts them side by side and often has
  // the whole word: "non magical", "arm or", but not "in to". One sighting of the pair can be a
  // typo in the clean text itself ("motion less").
  if (parts.every((part) => vocab.isTrusted(part))) {
    const [a, b] = parts as [string, string];
    const seen = vocab.pairCount(a, b);
    const rare = parts.length === 2 && a.length > 1 && b.length > 1 && seen <= 1;
    if (!rare || vocab.trustedCount(whole) < (seen ? 10 : 3)) return undefined;
  }
  return first[1]! + whole + last[2]!;
}

/**
 * OCR can move a word break by one letter: "an done" is "and one", "fail sa" is "fails a".
 * Moves it when clean text never has the pair as read and often has the moved one.
 */
function shiftPair(first: string, second: string, vocab: Vocab): [string, string] | undefined {
  const a = /^([^A-Za-z]*)([a-z]+)$/.exec(first);
  const b = /^([a-z]+)([^A-Za-z]*)$/.exec(second);
  if (!a || !b) return undefined;
  const [, lead, x] = a as unknown as [string, string, string];
  const [, y, trail] = b as unknown as [string, string, string];
  if (vocab.pairCount(x, y) > 0) return undefined;
  const options: [string, string][] = [
    [x + y.charAt(0), y.slice(1)],
    [x.slice(0, -1), x.slice(-1) + y],
  ];
  for (const [p, q] of options) {
    if (!p || !q || !vocab.isTrusted(p) || !vocab.isTrusted(q)) continue;
    if (vocab.pairCount(p, q) >= 3) return [lead + p, q + trail];
  }
  return undefined;
}

function repairWord(word: string, vocab: Vocab): string {
  if (vocab.isTrusted(word)) return word;
  const cut = glueSplit(word, vocab);
  if (cut !== undefined) return `${word.slice(0, cut)} ${word.slice(cut)}`;
  if (/^[A-Z]/.test(word) || word.length < 5 || vocab.isWord(word)) return word;
  return vocab.nearest(word) ?? word;
}

/**
 * Joins the lines of one paragraph. A hyphen at a line end is dropped when the halves make a
 * known word ("bar-" "ghests") and kept when they do not ("soul-" "devouring"). MPMM's text
 * layer drops those hyphens, so a known word split across lines is joined too ("win" "dow").
 */
export function joinLines(lines: readonly string[], vocab: Vocab): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    const tail = /([A-Za-z]+)(-?)$/.exec(out);
    const head = /^([a-z]+)/.exec(line);
    if (tail && head) {
      const [, before, hyphen] = tail as unknown as [string, string, string];
      const [, after] = head as unknown as [string, string];
      const whole = before + after;
      if (hyphen) {
        out = vocab.isWord(whole) ? out.slice(0, -1) + line : out + line;
        continue;
      }
      if (vocab.isWord(whole) && !(vocab.isTrusted(before) && vocab.isTrusted(after))) {
        out += line;
        continue;
      }
    }
    out += ` ${line}`;
  }
  return out;
}

/** Spacing and punctuation tidy-up: "40ft.," -> "40 ft.,", "( natural" -> "(natural". */
export function tidy(text: string): string {
  return text
    .replace(/[{]/g, '(')
    .replace(/[}]/g, ')')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(?<=[a-z])[·•](?=[a-z])/g, '-')
    .replace(/([A-Za-z])\s+(n?'t)\b/g, '$1$2')
    .replace(/([a-z]{3,})(\d)/g, '$1 $2')
    .replace(/(\d)\s*ft\b/g, '$1 ft')
    .replace(/(\d)feet\b/g, '$1 feet')
    .replace(/\bft\s*\.\s*/g, 'ft. ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])(?=[A-Za-z(])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .replace(/ft\. ([,;:)])/g, 'ft.$1')
    .trim();
}

/** Stray marks OCR leaves at a line end: bullets, tildes, quote marks, scraps of rules. */
export function stripTrailingJunk(text: string): string {
  return text
    .replace(/\s+([.,;:!?])(?=\s|$)/g, '$1')
    .replace(/(?:\s+[^\p{L}\p{N}()]{1,6})+$/u, '')
    .replace(/\s+[•·~]+(?=\s|$)/gu, '')
    .trim();
}
