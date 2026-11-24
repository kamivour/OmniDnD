/**
 * Stage 6 of the monster pipeline: one raw stat block to a creature record. Pure functions.
 * OCR loses lines and letters, so every field is optional and each gap or doubtful value is
 * written to `issues` for the review step instead of being guessed.
 */
import { ABILITIES, type Ability } from '../../src/engine/calc/abilities.ts';
import { CONDITIONS, DAMAGE_TYPES, SKILLS, type Skill } from '../../src/engine/rules2014.ts';
import {
  fixDice,
  fixNumbers,
  fixWords,
  joinLines,
  stripTrailingJunk,
  tidy,
  toNumber,
  type Vocab,
} from './clean.ts';
import { editDistance } from './layout.ts';
import {
  isAbilityHeader,
  isTypeLine,
  letters,
  sectionOf,
  type RawBlock,
  type SectionKey,
} from './segment.ts';

export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type Size = (typeof SIZES)[number];

export interface ParsedEntry {
  name: string;
  text: string;
  usage?: string;
  attackBonus?: number;
  damage?: { dice: string; type: string }[];
}

export type EntryList = 'traits' | SectionKey;
export const ENTRY_LISTS: readonly EntryList[] = [
  'traits',
  'actions',
  'bonusActions',
  'reactions',
  'legendaryActions',
  'mythicActions',
  'lairActions',
];

export interface Speed {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  hover?: boolean;
}

export interface Senses {
  darkvision?: number;
  blindsight?: number;
  truesight?: number;
  tremorsense?: number;
  passivePerception?: number;
}

export interface ParsedCreature extends Record<EntryList, ParsedEntry[]> {
  page: number;
  printed?: number;
  /** The block's own heading, cleaned up; the identify step settles the name. */
  heading?: string;
  family?: number;
  size?: Size;
  /** "Small or Medium": every size the type line allows. */
  sizes?: Size[];
  creatureType?: string;
  alignment?: string;
  ac?: number;
  acNote?: string;
  hp?: number;
  hpFormula?: string;
  speed: Speed;
  abilities: Partial<Record<Ability, number>>;
  saves: Partial<Record<Ability, number>>;
  skills: Partial<Record<Skill, number>>;
  vulnerabilities: string[];
  resistances: string[];
  immunities: string[];
  conditionImmunities: string[];
  senses: Senses;
  languages?: string;
  cr?: number;
  xp?: number;
  proficiencyBonus?: number;
  /** The paragraph under a section heading before its first entry. */
  intros: Partial<Record<SectionKey, string>>;
  issues: string[];
}

/** XP by challenge rating (2014 Monster Manual table). */
export const XP_BY_CR = new Map<number, number>([
  [0, 10],
  [0.125, 25],
  [0.25, 50],
  [0.5, 100],
  [1, 200],
  [2, 450],
  [3, 700],
  [4, 1100],
  [5, 1800],
  [6, 2300],
  [7, 2900],
  [8, 3900],
  [9, 5000],
  [10, 5900],
  [11, 7200],
  [12, 8400],
  [13, 10000],
  [14, 11500],
  [15, 13000],
  [16, 15000],
  [17, 18000],
  [18, 20000],
  [19, 22000],
  [20, 25000],
  [21, 33000],
  [22, 41000],
  [23, 50000],
  [24, 62000],
  [25, 75000],
  [26, 90000],
  [27, 105000],
  [28, 120000],
  [29, 135000],
  [30, 155000],
]);

/** Proficiency bonus by challenge rating: +2 up to CR 4, then +1 every 4 CRs. */
export const proficiencyForCr = (cr: number) => Math.max(2, Math.floor((cr - 1) / 4) + 2);

const PROPERTIES = [
  ['Armor Class', 'ac'],
  ['Hit Points', 'hp'],
  ['Speed', 'speed'],
  ['Saving Throws', 'saves'],
  ['Skills', 'skills'],
  ['Damage Vulnerabilities', 'vulnerabilities'],
  ['Damage Resistances', 'resistances'],
  ['Damage Immunities', 'immunities'],
  ['Condition Immunities', 'conditionImmunities'],
  ['Senses', 'senses'],
  ['Languages', 'languages'],
  ['Challenge', 'challenge'],
  ['Proficiency Bonus', 'pb'],
] as const;
type PropertyKey = (typeof PROPERTIES)[number][1];

/** The stat block property a line opens, and the text after its label. */
export function propertyOf(text: string): { key: PropertyKey; rest: string } | undefined {
  const tokens = text.trim().split(/\s+/);
  for (const [label, key] of PROPERTIES) {
    const target = letters(label);
    let taken = '';
    let count = 0;
    while (count < tokens.length && taken.length < target.length - 1) {
      const token = tokens[count]!;
      if (/\d/.test(token)) break;
      taken += letters(token);
      count++;
    }
    if (count === 0 || taken.length > target.length + 1) continue;
    // "Hit Point s 13": a split-off end of the label belongs to it, not to the value.
    while (count < tokens.length && /^[a-z]+$/i.test(tokens[count]!)) {
      const longer = taken + letters(tokens[count]!);
      if (editDistance(longer, target) >= editDistance(taken, target)) break;
      taken = longer;
      count++;
    }
    if (editDistance(taken, target) <= (target.length >= 9 ? 2 : 1)) {
      return { key, rest: tokens.slice(count).join(' ') };
    }
  }
  return undefined;
}

/**
 * "15 (+2)" as OCR reads it: a stray mark after the score ("2. (-4)", "8, (~1)"), a period
 * before the sign ("(.+3)"), an opening parenthesis read as "r", and a closing one read as a
 * letter ("(+4i") or lost. A modifier is one digit or 10. A score OCR garbled ("W(+O)") still
 * takes its place, so the scores after it keep their abilities.
 */
const SCORE =
  /([^\s(){}.,]{1,2})[.,]?\s*(?:[({]|r(?=\s*[+\-–—−~]))[\s.,·]*([+\-–—−~]?)[\s.,·]*(1[0O]|[\dlIOoSs])\s*(?:[)}]|[iIl|](?=\s|$)|(?=\s+[^\s(){}.,]{1,2}[.,]?\s*[({]|\s*$))/g;

/** A line of ability scores ("21 (+5) 9 (-1) ..."), perhaps with the STR... labels. */
function isScoreLine(text: string): boolean {
  const rest = text.replace(SCORE, ' ').replace(/\b(?:STR|DEX|CON|INT|WIS|CHA)\b/g, ' ');
  return rest !== text && rest.replace(/[^A-Za-z]/g, '').length < 3;
}

const CONNECTIVE = 'of|the|and|or|in|to|a|an|with|from|on|for|at|by|into|vs';
const ENTRY_NAME = new RegExp(
  `^((?:[A-Z][A-Za-z'’-]*|\\d+)(?:\\s+(?:[A-Z][A-Za-z'’-]*|${CONNECTIVE}|\\d+)){0,6})` +
    `\\s*(\\([^()]{1,40}\\))?\\s*\\.(?:\\s+(.*))?$`,
);
/**
 * OCR sometimes drops the capital of an attack's name ("javelin. Melee or Ranged ..."), lowers
 * a later word of a name with a usage ("Wall of ice (Recharge 6).") or reads its period as a
 * colon ("Constrict: Melee ...").
 */
const LOWER_NAME =
  /^([A-Za-z][a-z'-]+(?:\s+[A-Za-z][a-z'-]*){0,3})\s*(\([^()]{1,40}\))?\s*[.:]\s+(.*)$/;
/** A name whose period OCR lost, before the sentence that opens its text: "Engulf The cube". */
const NO_PERIOD =
  /^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,2})\s+((?:The|A|An|Each|If|When|While)\s+[a-z].*)$/;
const NOT_NAME = /^(?:Hit|DC|The|A|An|If|On|When|While|Each|It|Its|Any|As|In|At|This|That)$/;

/** "Tail Swipe. The aboleth ..." -> name, its parenthesis and the rest of the line. */
export function entryStart(
  line: string,
): { name: string; paren?: string; rest: string } | undefined {
  // A run-in name can follow a stray mark from the line above (".Innate Spellcasting.").
  const text = line.replace(/^[.,'•·\s]+(?=[A-Z])/, '');
  let match = ENTRY_NAME.exec(text);
  if (!match) {
    const loose = LOWER_NAME.exec(text);
    const attack = loose && /^(?:Melee|Ranged)\b/.test(loose[3]!);
    const usage =
      loose?.[2] !== undefined && usageOf(loose[2]) !== undefined && /^[A-Z]/.test(text);
    if (loose && (attack || usage)) match = loose;
  }
  if (!match) {
    const bare = NO_PERIOD.exec(text);
    if (bare && !bare[1]!.split(/\s+/).some((word) => NOT_NAME.test(word))) {
      return { name: bare[1]!, rest: bare[2]! };
    }
    return undefined;
  }
  const [, name, paren, rest = ''] = match as unknown as [string, string, string?, string?];
  if (/^[a-z]/.test(name)) {
    if (!/^(?:Melee|Ranged)\b/.test(rest)) return undefined;
  }
  if (NOT_NAME.test(name)) return undefined;
  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    ...(paren && { paren }),
    rest,
  };
}

/** A run-in start no sentence would hold: a usage in brackets, or an attack after the name. */
function isStrongStart(start: { paren?: string; rest: string }): boolean {
  return (
    (start.paren !== undefined && usageOf(start.paren) !== undefined) ||
    /^(?:Melee|Ranged)\s+(?:or\s+Ranged\s+)?(?:Weapon|Spell)\s+Attack\b/.test(start.rest)
  );
}

/** "(3/Day)" -> "3/day"; "(Recharge 5-6)" -> "Recharge 5–6", as the SRD data writes them. */
export function usageOf(paren: string): string | undefined {
  const inner = paren.replace(/^\(|\)$/g, '').trim();
  // OCR reads the slash as J, I, l, f, t or loses it: "3JDay", "3fDay".
  const day = /^(\S{1,2}?)\s*[^\s\w]?[A-Za-z]?\s*day$/i.exec(inner);
  if (day) {
    const n = toNumber(day[1]!);
    return n === undefined ? undefined : `${n}/day`;
  }
  const recharge = /^recharge\s*(\S)(?:\s*[-–—~]\s*(\S))?$/i.exec(inner);
  if (recharge) {
    const from = toNumber(recharge[1]!);
    const to = recharge[2] === undefined ? undefined : toNumber(recharge[2]);
    if (from === undefined) return undefined;
    return to === undefined ? `Recharge ${from}` : `Recharge ${from}–${to}`;
  }
  const rest = /^recharges after a (short or long|long) rest$/i.exec(inner);
  if (rest) return `Recharges after a ${rest[1]!.toLowerCase()} rest`;
  return undefined;
}

/** What an armor class note names, for repairing an OCR'd note ("r;1atura l armor"). */
const ARMOR = [
  'natural armor',
  'padded armor',
  'leather armor',
  'studded leather',
  'studded leather armor',
  'hide armor',
  'chain shirt',
  'scale mail',
  'breastplate',
  'half plate',
  'ring mail',
  'chain mail',
  'splint',
  'plate',
  'plate armor',
  'shield',
  'mage armor',
  'barding',
];

/** Each digit-free part of a note becomes the armor it is one or two OCR slips from. */
export function armorNote(note: string): string {
  return note
    .replace(/(\d) (?=\d)/g, '$1')
    .split(/(?<=[,;])\s+/)
    .map((part) => {
      const [, body = part, stop = ''] = /^(.*?)([,;]?)$/.exec(part) ?? [];
      // A number in its own right ("11 while prone"), not a letter OCR read as one ("1;1atural").
      if (/(?<![\w;])\d+(?![\w;])/.test(body)) return part;
      const key = letters(body);
      const near = ARMOR.map((armor) => ({ armor, d: editDistance(key, letters(armor)) }))
        .filter(({ armor, d }) => d <= Math.max(1, Math.floor(letters(armor).length / 5)))
        .sort((a, b) => a.d - b.d)[0];
      return near ? near.armor + stop : part;
    })
    .join(' ');
}

const SPELL_LIST =
  /^(?:Cantrips\s*\(at will\)|\d+(?:st|nd|rd|th)\s+level\s*\(\d+\s+slots?\)|At will|\d+\/day(?:\s+each)?)\s*:/i;

const digits = (text: string) => text.replace(/[lI]/g, '1').replace(/O/g, '0');

/** OCR forms of a spell list head: "lfday each :", "lst level .(l slot):", "Cantrips (at wi ll)". */
export function fixSpellHead(text: string): string {
  let match = /^([\dlI])\s*[/fjJIl|]\s*day(\s+each)?\s*:\s*/.exec(text);
  if (match)
    return `${digits(match[1]!)}/day${match[2] ? ' each' : ''}: ${text.slice(match[0].length)}`;
  match = /^([\dlIO]{1,2})(st|nd|rd|th)\s+level\s*\.?\s*\(([\dlIO]{1,2})\s+(slots?)\)\s*:\s*/i.exec(
    text,
  );
  if (match) {
    const [whole, level, suffix, slots, word] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    return `${digits(level)}${suffix.toLowerCase()} level (${digits(slots)} ${word}): ${text.slice(whole.length)}`;
  }
  match = /^(?:Cantrips\s*\(at[\s-]*wi\s*ll\)|At will)\s*:\s*/i.exec(text);
  if (match) {
    const head = /^Cantrips/i.test(match[0]) ? 'Cantrips (at will)' : 'At will';
    return `${head}: ${text.slice(match[0].length)}`;
  }
  return text;
}

/** One line through every cleaning step that works inside a line. */
export function cleanLine(text: string, vocab: Vocab): string {
  return fixWords(tidy(fixNumbers(fixDice(fixSpellHead(stripTrailingJunk(text))))), vocab);
}

/** Entry text from its cleaned lines: prose joined, spell lists as "- " items. */
function entryText(lines: readonly string[], vocab: Vocab): string {
  const prose: string[] = [];
  const items: string[][] = [];
  const after: string[] = [];
  for (const line of lines) {
    if (SPELL_LIST.test(line)) items.push([line]);
    else if (items.length > 0 && /^[a-z,]/.test(line)) items.at(-1)!.push(line);
    else if (items.length > 0) after.push(line);
    else prose.push(line);
  }
  let text = joinLines(prose, vocab);
  items.forEach((item, k) => {
    text += `${k === 0 ? '\n\n' : '\n'}- ${joinLines(item, vocab)}`;
  });
  if (after.length > 0) text += `\n${joinLines(after, vocab)}`;
  return text;
}

const OPTIONS_FOLLOW = /\b(?:the following|detailed below|options below)\b/i;
const NAME_SMALL = new Set(CONNECTIVE.split('|'));
const nameStems = (name: string) =>
  name
    .split(/[\s()-]+/)
    .map((word) => letters(word).replace(/(?:es|s)$/, ''))
    .filter((word) => word.length > 2 && !NAME_SMALL.has(word));

/** "Breath Weapons" and "Fire Breath" share "breath". */
export const sharesWord = (a: string, b: string) => {
  const stems = new Set(nameStems(a));
  return nameStems(b).some((word) => stems.has(word));
};

const DAMAGE = /(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z]+)\s+damage/g;
const FLAT_DAMAGE = /Hit:\s*(\d+)\s+([a-z]+)\s+damage/;

function entryOf(name: string, paren: string | undefined, text: string): ParsedEntry {
  const usage = paren ? usageOf(paren) : undefined;
  const entry: ParsedEntry = {
    name: paren && !usage ? `${name} ${paren}` : name,
    text,
    ...(usage && { usage }),
  };
  const attack = /Attack:\s*([+-])\s*(\d+)\s*to\s*hit/.exec(text);
  if (attack) entry.attackBonus = Number(attack[2]) * (attack[1] === '-' ? -1 : 1);
  const damage: { dice: string; type: string }[] = [];
  for (const [, , dice, type] of text.matchAll(DAMAGE)) {
    if (!(DAMAGE_TYPES as readonly string[]).includes(type!)) continue;
    const clean = dice!.replace(/\s/g, '');
    if (!damage.some((d) => d.dice === clean && d.type === type)) {
      damage.push({ dice: clean, type: type! });
    }
  }
  const flat = FLAT_DAMAGE.exec(text);
  if (damage.length === 0 && flat && (DAMAGE_TYPES as readonly string[]).includes(flat[2]!)) {
    damage.push({ dice: flat[1]!, type: flat[2]! });
  }
  if (damage.length > 0) entry.damage = damage;
  return entry;
}

/** "Large aberration, lawful evil" and "Small or Medium Humanoid, Typically Neutral". */
export function parseTypeLine(
  text: string,
): Pick<ParsedCreature, 'size' | 'sizes' | 'creatureType' | 'alignment'> {
  const sizeWord = `(${SIZES.join('|')})`;
  const match = new RegExp(
    `^\\W*${sizeWord}(?:\\s*(?:or|,)\\s*${sizeWord})?\\s+(.+?)\\s*,\\s*(.+)$`,
    'i',
  ).exec(text.trim());
  if (!match) return {};
  const first = match[1]!.toLowerCase() as Size;
  const second = match[2]?.toLowerCase() as Size | undefined;
  return {
    size: first,
    ...(second && { sizes: [first, second] }),
    creatureType: match[3]!.toLowerCase(),
    alignment: match[4]!.toLowerCase().replace(/[.\s]+$/, ''),
  };
}

const closest = <T extends string>(word: string, options: readonly T[], tolerance: number) => {
  let best: { option: T; distance: number } | undefined;
  for (const option of options) {
    const distance = editDistance(word, option.replace(/-/g, ''));
    if (distance <= tolerance && (!best || distance < best.distance)) best = { option, distance };
  }
  return best?.option;
};

/** "+6", "+l2", "- 1" -> a signed number. */
function signed(text: string): number | undefined {
  const match = /([+\-–—−])?\s*([\dlIOoS]{1,2})/.exec(text);
  if (!match) return undefined;
  const value = toNumber(match[2]!);
  if (value === undefined) return undefined;
  return match[1] && match[1] !== '+' ? -value : value;
}

/** "Con +6, lnt +8" -> { CON: 6, INT: 8 }. */
function parseSaves(text: string, issues: string[]) {
  const saves: Partial<Record<Ability, number>> = {};
  for (const part of text.split(/[,;]/)) {
    const match = /^\s*([A-Za-z\s]+?)\s*([+\-–—−]\s*\S+)\s*$/.exec(part);
    const ability = match
      ? closest(
          letters(match[1]!).slice(0, 3),
          ABILITIES.map((a) => a.toLowerCase()),
          1,
        )
      : undefined;
    const value = match ? signed(match[2]!) : undefined;
    if (!ability || value === undefined) {
      if (part.trim()) issues.push(`save not read: "${part.trim()}"`);
      continue;
    }
    saves[ability.toUpperCase() as Ability] = value;
  }
  return saves;
}

function parseSkills(text: string, issues: string[]) {
  const skills: Partial<Record<Skill, number>> = {};
  for (const part of text.split(/[,;]/)) {
    const match = /^\s*([A-Za-z\s'’]+?)\s*([+\-–—−]\s*\S+)\s*$/.exec(part);
    const skill = match ? closest(letters(match[1]!), SKILLS, 2) : undefined;
    const value = match ? signed(match[2]!) : undefined;
    if (!skill || value === undefined) {
      if (part.trim()) issues.push(`skill not read: "${part.trim()}"`);
      continue;
    }
    skills[skill] = value;
  }
  return skills;
}

/** "cold; bludgeoning, piercing, and slashing from nonmagical attacks" -> two entries. */
export function parseDamageList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(';')) {
    const clean = part.trim().toLowerCase().replace(/\.$/, '');
    if (!clean) continue;
    if (/\b(?:from|that|except|while|when|in)\b/.test(clean)) out.push(clean);
    else {
      out.push(
        ...clean
          .split(/,|\band\b/)
          .map((word) => word.trim())
          .filter(Boolean),
      );
    }
  }
  return out;
}

const CONDITION_NAMES = [...CONDITIONS, 'exhaustion'] as const;

function parseConditions(text: string, issues: string[]): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/,|\band\b|;/)) {
    const key = letters(word);
    if (!key) continue;
    const condition = closest(key, CONDITION_NAMES, 2);
    if (condition) out.push(condition);
    else issues.push(`condition not read: "${word.trim()}"`);
  }
  return out;
}

function parseSpeed(text: string, issues: string[]): Speed {
  const speed: Speed = {};
  for (const part of text.split(/[,;]/)) {
    // OCR splits the mode word ("fl y 90 ft.").
    const match =
      /^\s*((?:[A-Za-z]+\s?)*?)\s*([\dlIOoS]{1,3})\s*ft\s*\.?\s*(\(\s*hover\s*\))?/.exec(part);
    if (!match) {
      if (part.trim()) issues.push(`speed not read: "${part.trim()}"`);
      continue;
    }
    const value = toNumber(match[2]!);
    const mode = match[1]
      ? closest(letters(match[1]), ['fly', 'swim', 'climb', 'burrow', 'walk'], 1)
      : 'walk';
    if (value === undefined || !mode) {
      issues.push(`speed not read: "${part.trim()}"`);
      continue;
    }
    if (speed[mode] === undefined) speed[mode] = value;
    if (match[3]) speed.hover = true;
  }
  return speed;
}

const SENSES = ['darkvision', 'blindsight', 'truesight', 'tremorsense'] as const;

function parseSenses(text: string, issues: string[]): Senses {
  const senses: Senses = {};
  for (const part of text.split(/[,;]/)) {
    const passive = /passiveperception([\dlIOoS]{1,2})/i.exec(part.replace(/\s+/g, ''));
    if (passive) {
      const value = toNumber(passive[1]!);
      if (value !== undefined) senses.passivePerception = value;
      continue;
    }
    const match = /^\s*([A-Za-z\s]+?)\s*([\dlIOoS]{1,3})\s*ft/.exec(part);
    const sense = match ? closest(letters(match[1]!), SENSES, 2) : undefined;
    const value = match ? toNumber(match[2]!) : undefined;
    if (sense && value !== undefined) senses[sense] = value;
    else if (letters(part).length > 0 && !/^\s*\(/.test(part)) {
      issues.push(`sense not read: "${part.trim()}"`);
    }
  }
  return senses;
}

function parseCr(token: string): number | undefined {
  const [top, bottom] = token.split('/');
  const a = toNumber(top ?? '');
  if (bottom === undefined) return a;
  const b = toNumber(bottom);
  return a === undefined || b === undefined || b === 0 ? undefined : a / b;
}

/** The average of a hit dice formula: 18d10+36 -> 135. */
export function averageHp(formula: string): number | undefined {
  const match = /^(\d+)d(\d+)(?:([+-])(\d+))?$/.exec(formula);
  if (!match) return undefined;
  const bonus = Number(match[4] ?? 0) * (match[3] === '-' ? -1 : 1);
  return Math.floor((Number(match[1]) * (Number(match[2]) + 1)) / 2) + bonus;
}

const modifier = (score: number) => Math.floor((score - 10) / 2);

/** Ability scores from the score lines; the header says which abilities OCR kept. */
function parseAbilities(lines: readonly string[], issues: string[]) {
  const abilities: Partial<Record<Ability, number>> = {};
  const header = lines
    .filter(isAbilityHeader)
    .flatMap(
      (line) => line.replace(/[^A-Z]/g, '').match(/STR|DEX|CON|INT|WIS|CHA/g) ?? [],
    ) as Ability[];
  const scores: { score?: number; mod?: number }[] = [];
  for (const line of lines) {
    for (const [, score, sign, mod] of line.matchAll(SCORE)) {
      const s = toNumber(score!);
      const m = toNumber(mod!);
      scores.push({
        ...(s !== undefined && { score: s }),
        ...(m !== undefined && { mod: sign && sign !== '+' ? -m : m }),
      });
    }
  }
  let order: readonly Ability[] = ABILITIES;
  if (scores.length < 6) {
    if (header.length === scores.length) order = header;
    issues.push(`ability scores: only ${scores.length} of 6 read`);
  }
  scores.slice(0, 6).forEach(({ score, mod }, k) => {
    const ability = order[k]!;
    if (score === undefined || score < 1 || score > 30) {
      issues.push(`${ability} score not read`);
      return;
    }
    if (mod !== undefined && modifier(score) !== mod) {
      issues.push(`${ability} ${score} does not match modifier ${mod}`);
    }
    abilities[ability] = score;
  });
  return abilities;
}

/** Parses one stat block. Fields OCR lost stay empty and are listed in `issues`. */
export function parseBlock(block: RawBlock, vocab: Vocab): ParsedCreature {
  const issues: string[] = [];
  const creature: ParsedCreature = {
    page: block.page,
    ...(block.printed !== undefined && { printed: block.printed }),
    ...(block.family !== undefined && { family: block.family }),
    speed: {},
    abilities: {},
    saves: {},
    skills: {},
    vulnerabilities: [],
    resistances: [],
    immunities: [],
    conditionImmunities: [],
    senses: {},
    intros: {},
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    mythicActions: [],
    lairActions: [],
    issues,
  };
  if (block.heading) creature.heading = tidy(fixWords(block.heading, vocab));

  if (block.typeLine && isTypeLine(block.typeLine)) {
    Object.assign(creature, parseTypeLine(cleanLine(block.typeLine, vocab)));
  }
  if (!creature.creatureType) issues.push('type line missing');

  // Properties: labelled lines up to Challenge (and Proficiency Bonus), with wrapped values.
  const raw = block.lines.map((line) => line.t.trim());
  const values = new Map<PropertyKey, string[]>();
  const abilityLines: string[] = [];
  let current: PropertyKey | undefined;
  let i = 0;
  for (; i < raw.length; i++) {
    const text = raw[i]!;
    if (sectionOf(text)) break;
    const property = propertyOf(text);
    if (property) {
      current = property.key;
      values.set(current, [property.rest]);
      continue;
    }
    if (isAbilityHeader(text) || isScoreLine(text)) {
      abilityLines.push(text);
      current = undefined;
      continue;
    }
    if (current === 'challenge' || current === 'pb') break;
    if (entryStart(cleanLine(text, vocab))) break;
    if (current) values.get(current)!.push(text);
    else issues.push(`line not placed: "${text}"`);
  }
  const value = (key: PropertyKey) => {
    const lines = values.get(key);
    return lines
      ? tidy(fixNumbers(fixDice(joinLines(lines.map(stripTrailingJunk), vocab))))
      : undefined;
  };
  const words = (key: PropertyKey) => {
    const text = value(key);
    return text === undefined ? undefined : fixWords(text, vocab);
  };

  const ac = value('ac');
  if (ac !== undefined) {
    const match = /^([^\s(]+)\s*(?:\((.+?)\))?\s*(.*)$/.exec(ac);
    const number = match ? toNumber(match[1]!) : undefined;
    if (number === undefined) issues.push(`armor class not read: "${ac}"`);
    else creature.ac = number;
    const note = [match?.[2], match?.[3]].filter(Boolean).join(' ').trim();
    if (note) creature.acNote = fixWords(armorNote(note.toLowerCase()), vocab);
  } else issues.push('armor class missing');

  const hp = value('hp');
  if (hp !== undefined) {
    const match = /^(\S+?)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/.exec(hp);
    const number = toNumber(match?.[1] ?? hp.split(' ')[0] ?? '');
    if (number === undefined) issues.push(`hit points not read: "${hp}"`);
    else creature.hp = number;
    if (match) {
      creature.hpFormula = match[2]!.replace(/\s/g, '');
      if (number !== undefined && averageHp(creature.hpFormula) !== number) {
        issues.push(`hit points ${number} do not match ${creature.hpFormula}`);
      }
    }
  } else issues.push('hit points missing');

  const speed = value('speed');
  if (speed !== undefined) creature.speed = parseSpeed(speed, issues);
  else issues.push('speed missing');

  creature.abilities = parseAbilities(abilityLines, issues);

  const saves = value('saves');
  if (saves !== undefined) creature.saves = parseSaves(saves, issues);
  const skills = value('skills');
  if (skills !== undefined) creature.skills = parseSkills(skills, issues);
  for (const key of ['vulnerabilities', 'resistances', 'immunities'] as const) {
    const text = words(key);
    if (text !== undefined) creature[key] = parseDamageList(text);
  }
  const conditions = words('conditionImmunities');
  if (conditions !== undefined) creature.conditionImmunities = parseConditions(conditions, issues);
  const senses = value('senses');
  if (senses !== undefined) creature.senses = parseSenses(senses, issues);
  let languages = words('languages');
  // OCR can run the challenge line into the languages line.
  const runOn = languages === undefined ? null : /\s*\bChallenge\s+(\S+\s*\(.*)$/.exec(languages);
  if (languages !== undefined && runOn) languages = languages.slice(0, runOn.index);
  if (languages !== undefined) {
    creature.languages = /^[-—–~\s]*$/.test(languages)
      ? ''
      : languages.replace(/\bl(?=gnan\b)/g, 'I').replace(/\bOre\b/g, 'Orc');
  } else issues.push('languages missing');

  const challenge = [
    value('challenge') ?? runOn?.[1],
    value('pb') && `Proficiency Bonus ${value('pb')}`,
  ]
    .filter(Boolean)
    .join(' ');
  // "21 (33,000 XP)"; later books add "or 41,000 XP when encountered in lair" inside the brackets.
  const cr = /^(\S+)\s*\(([\d,.\s]+)\s*XP\b[^)]*\)/i.exec(challenge);
  if (cr) {
    // CR and XP check each other. When they disagree, an XP figure that is in the table names
    // the CR (OCR reads "1/2" as "5" more often than it garbles five digits into a valid XP).
    // A CR 0 creature with no attacks is worth 0 XP.
    let rating = parseCr(cr[1]!);
    const xp = Number(cr[2]!.replace(/\D/g, ''));
    const fromXp = xp === 0 ? 0 : [...XP_BY_CR].find(([, value]) => value === xp)?.[0];
    const fits = (r: number) => XP_BY_CR.get(r) === xp || (r === 0 && xp === 0);
    if (rating !== undefined && XP_BY_CR.has(rating) && !fits(rating)) {
      issues.push(`XP ${xp} does not match CR ${cr[1]}`);
      if (fromXp !== undefined) rating = fromXp;
    }
    if (rating === undefined || !XP_BY_CR.has(rating)) rating = fromXp;
    if (rating === undefined) issues.push(`challenge not read: "${challenge}"`);
    else {
      creature.cr = rating;
      creature.xp = rating === 0 && xp === 0 ? 0 : XP_BY_CR.get(rating)!;
    }
  } else issues.push(challenge ? `challenge not read: "${challenge}"` : 'challenge missing');
  const pb = /Proficiency Bonus\s*\+?\s*([\dlIOoS])/i.exec(challenge);
  if (pb) creature.proficiencyBonus = toNumber(pb[1]!);
  if (creature.cr !== undefined) {
    creature.xp ??= XP_BY_CR.get(creature.cr);
    creature.proficiencyBonus ??= proficiencyForCr(creature.cr);
  }
  // Passive Perception follows from Wisdom and the Perception skill. Early printings misprint
  // it now and then (later errata fix them), so the worked-out value wins, flagged for review.
  if (creature.abilities.WIS !== undefined) {
    const read = creature.senses.passivePerception;
    const worked = 10 + (creature.skills.perception ?? modifier(creature.abilities.WIS));
    if (read !== worked) {
      creature.senses.passivePerception = worked;
      issues.push(
        read === undefined
          ? 'passive Perception worked out from Wisdom'
          : `passive Perception read ${read}, worked out ${worked}`,
      );
    }
  }

  // Entries: traits until the first section heading, then each section's entries.
  let list: EntryList = 'traits';
  let entry: { name: string; paren?: string; lines: string[] } | undefined;
  let intro: string[] | undefined;
  // An entry that lists options ("uses one of the following breath weapons") takes the entries
  // after it that share a word of its name ("Fire Breath") into its own text.
  let parent: { name: string; paren?: string; text: string } | undefined;
  const flush = () => {
    if (entry) {
      const text = entryText(entry.lines, vocab);
      const label = entry.paren ? `${entry.name} ${entry.paren}` : entry.name;
      if (parent && sharesWord(parent.name, entry.name)) {
        parent.text += `\n${label}. ${text}`;
        creature[list][creature[list].length - 1] = entryOf(parent.name, parent.paren, parent.text);
      } else {
        creature[list].push(entryOf(entry.name, entry.paren, text));
        // "can cast the following spells" lists spells, not entries.
        parent =
          OPTIONS_FOLLOW.test(text) && !/spellcasting/i.test(entry.name)
            ? { name: entry.name, ...(entry.paren && { paren: entry.paren }), text }
            : undefined;
      }
    }
    entry = undefined;
  };
  const flushIntro = () => {
    if (intro && intro.length > 0 && list !== 'traits') {
      creature.intros[list] = joinLines(intro, vocab);
    }
    intro = undefined;
  };
  let sentenceDone = true;
  // Inside a spell list, a line can end without a stop and the next entry still begins after it.
  let inSpellList = false;
  for (; i < raw.length; i++) {
    const section = sectionOf(raw[i]!);
    if (section) {
      flush();
      flushIntro();
      parent = undefined;
      list = section;
      intro = [];
      sentenceDone = true;
      inSpellList = false;
      continue;
    }
    const text = cleanLine(raw[i]!, vocab);
    if (!text) continue;
    const found = entryStart(text);
    const start: ReturnType<typeof entryStart> =
      found && (sentenceDone || isStrongStart(found)) ? found : undefined;
    if (start) {
      flush();
      flushIntro();
      // OCR lost the ACTIONS heading: the first attack or Multiattack opens the actions.
      if (
        list === 'traits' &&
        (start.name === 'Multiattack' || /^(?:Melee|Ranged)\b/.test(start.rest))
      ) {
        list = 'actions';
        issues.push('ACTIONS heading missing');
      }
      entry = { name: start.name, ...(start.paren && { paren: start.paren }), lines: [start.rest] };
    } else if (entry) entry.lines.push(text);
    else if (intro) intro.push(text);
    else {
      issues.push(`text before the first entry: "${text}"`);
      entry = { name: '', lines: [text] };
    }
    inSpellList = !start && (SPELL_LIST.test(text) || (inSpellList && /^[a-z,]/.test(text)));
    sentenceDone = inSpellList || /[.:)!?]["'’”]?$/.test(text);
  }
  flush();
  flushIntro();
  if (creature.actions.length === 0) issues.push('no actions');
  return creature;
}
