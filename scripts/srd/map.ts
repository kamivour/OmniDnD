/**
 * Maps 5e-database SRD records (`src/2014/en/5e-SRD-*.json`) to our reference entries
 * (DATA.md §4). Pure functions only: `scripts/import-srd.ts` fetches the files and writes
 * `data/srd/`. Facts the SRD data does not carry are small tables here (D50).
 *
 * Mappers throw on formats they do not know, so a changed upstream file fails the import
 * instead of writing wrong data. Anything skipped on purpose is pushed to `notes`.
 */
import { ABILITIES, type Ability } from '../../src/engine/calc/abilities.ts';
import type {
  BackgroundDef,
  ClassDef,
  ConditionDef,
  FeatureDef,
  ItemCharges,
  ItemDef,
  ItemRarity,
  RaceDef,
  RefEntry,
  SpellDef,
  SubclassDef,
} from '../../src/engine/schema';

interface ApiRef {
  index: string;
  name: string;
}

interface AbilityBonus {
  ability_score: ApiRef;
  bonus: number;
}

export interface RawSpell {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  level: number;
  attack_type?: string;
  damage?: {
    damage_type?: ApiRef;
    damage_at_slot_level?: Record<string, string>;
    damage_at_character_level?: Record<string, string>;
  }[];
  heal_at_slot_level?: Record<string, string>;
  dc?: { dc_type: ApiRef };
  area_of_effect?: { type: string; size: number };
  school: ApiRef;
  classes: ApiRef[];
}

export interface RawFeature {
  index: string;
  name: string;
  level: number;
  class: ApiRef;
  subclass?: ApiRef;
  desc: string[];
}

export interface RawLevel {
  index: string;
  level: number;
  class: ApiRef;
  subclass?: ApiRef;
  features?: ApiRef[];
  spellcasting?: { cantrips_known?: number; spells_known?: number };
}

export interface RawClass {
  index: string;
  name: string;
  hit_die: number;
  saving_throws: ApiRef[];
  spellcasting?: { spellcasting_ability: ApiRef };
}

export interface RawSubclass {
  index: string;
  name: string;
  class: ApiRef;
  desc: string[];
}

export interface RawRace {
  index: string;
  name: string;
  speed: number;
  size: string;
  ability_bonuses: AbilityBonus[];
  ability_bonus_options?: { choose: number; from: { options: AbilityBonus[] } };
  languages: ApiRef[];
  traits: ApiRef[];
  age: string;
  alignment: string;
  size_description: string;
  language_desc: string;
}

export interface RawSubrace {
  index: string;
  name: string;
  race: ApiRef;
  desc: string;
  ability_bonuses: AbilityBonus[];
  racial_traits: ApiRef[];
}

export interface RawTrait {
  index: string;
  name: string;
  desc: string[];
}

export interface RawBackground {
  index: string;
  name: string;
  starting_proficiencies: ApiRef[];
  feature: { name: string; desc: string[] };
}

export interface RawItem {
  index: string;
  name: string;
  equipment_category: ApiRef;
  gear_category?: ApiRef;
  tool_category?: string;
  desc?: string[];
  special?: string[];
  cost?: { quantity: number; unit: string };
  weight?: number;
  quantity?: number;
  weapon_category?: string;
  weapon_range?: string;
  damage?: { damage_dice: string; damage_type: ApiRef };
  two_handed_damage?: { damage_dice: string; damage_type: ApiRef };
  range?: { normal: number; long?: number };
  throw_range?: { normal: number; long?: number };
  properties?: ApiRef[];
  armor_category?: string;
  armor_class?: { base: number };
  str_minimum?: number;
  stealth_disadvantage?: boolean;
}

export interface RawMagicItem {
  index: string;
  name: string;
  equipment_category: ApiRef;
  rarity: { name: string };
  variants: ApiRef[];
  variant: boolean;
  desc: string[];
}

export interface RawCondition {
  index: string;
  name: string;
  desc: string[];
}

const SRD = { ruleset: '5e-2014', source: 'PHB', srd: true } as const;

const paragraphs = (lines: readonly string[]) => lines.join('\n\n');
const toAbility = (index: string) => index.toUpperCase() as Ability;
const lower = <T extends string>(text: string) => text.toLowerCase() as T;
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Spells

/** Class-list entries missing from the SRD data but present in the SRD 5.1 spell lists. */
const CLASS_LIST_FIXES: Record<string, string[]> = { 'faerie-fire': ['bard'] };

/** Dice tables in the `damage` field that are not damage (Sleep rolls hit points affected). */
const NOT_DAMAGE = new Set(['sleep']);

export function parseRange(raw: string, area?: RawSpell['area_of_effect']): string {
  const text = raw.replace(/^(\d+) feet$/, '$1 ft');
  return text === 'Self' && area ? `Self (${area.size}-ft ${area.type})` : text;
}

const DURATION_UNITS = {
  round: { seconds: 6, text: (n: number) => `${n} round${n > 1 ? 's' : ''}` },
  minute: { seconds: 60, text: (n: number) => `${n} min` },
  hour: { seconds: 3600, text: (n: number) => `${n} h` },
  day: { seconds: 86400, text: (n: number) => `${n} day${n > 1 ? 's' : ''}` },
} as const;

/** "Up to 1 minute" → 60 s with concentration. Instant, "Until dispelled" and "Special" have no seconds. */
export function parseDuration(raw: string, concentration: boolean): SpellDef['duration'] {
  if (raw === 'Instantaneous') return { text: 'Instant', concentration };
  if (raw === 'Until dispelled' || raw === 'Special') return { text: raw, concentration };
  const match = /^(?:Up to )?(\d+) (round|minute|hour|day)s?$/.exec(raw);
  if (!match) throw new Error(`Unknown spell duration "${raw}"`);
  const amount = Number(match[1]);
  const unit = DURATION_UNITS[match[2] as keyof typeof DURATION_UNITS];
  return { text: unit.text(amount), seconds: amount * unit.seconds, concentration };
}

export function parseCasting(raw: string): SpellDef['casting'] {
  if (raw === '1 action') return { cost: 'action' };
  if (raw === '1 bonus action') return { cost: 'bonus' };
  if (raw === '1 reaction') return { cost: 'reaction' };
  const match = /^(\d+) (minute|hour)s?$/.exec(raw);
  if (!match) throw new Error(`Unknown casting time "${raw}"`);
  return { cost: match[2] === 'minute' ? 'minutes' : 'hours', amount: Number(match[1]) };
}

type SpellRoll = NonNullable<SpellDef['heal']>;

interface ParsedRoll {
  count: number;
  die: number;
  mod: boolean;
}

function parseRoll(text: string | undefined): ParsedRoll | undefined {
  const match = /^(\d+)d(\d+)( \+ MOD)?$/.exec(text ?? '');
  if (!match) return undefined;
  return { count: Number(match[1]), die: Number(match[2]), mod: match[3] !== undefined };
}

function toRoll(base: ParsedRoll, extra: Partial<SpellRoll>): SpellRoll {
  return { dice: `${base.count}d${base.die}`, ...(base.mod && { addCastingMod: true }), ...extra };
}

/**
 * A by-slot table that is base dice plus the same dice per slot level above the spell's level.
 * Anything else (Magic Missile's "3d4 + 3", Heal's flat 70) returns undefined and is left for
 * `data/mechanics/`.
 */
export function rollFromSlots(
  table: Record<string, string>,
  spellLevel: number,
): SpellRoll | undefined {
  const rows = Object.entries(table)
    .map(([slot, text]) => ({ slot: Number(slot), roll: parseRoll(text) }))
    .sort((a, b) => a.slot - b.slot);
  const base = rows[0]?.roll;
  if (!base || rows[0]?.slot !== spellLevel) return undefined;
  const step = (rows[1]?.roll?.count ?? base.count) - base.count;
  const linear = rows.every(
    ({ slot, roll }) =>
      roll !== undefined &&
      roll.die === base.die &&
      roll.mod === base.mod &&
      roll.count === base.count + step * (slot - spellLevel),
  );
  if (!linear || step < 0) return undefined;
  return toRoll(base, step > 0 ? { upcastPerLevel: `${step}d${base.die}` } : {});
}

/** Cantrip table: dice count ×1 / ×2 / ×3 / ×4 at character level 1 / 5 / 11 / 17. */
export function rollFromCharacterLevels(table: Record<string, string>): SpellRoll | undefined {
  const levels = [1, 5, 11, 17];
  const base = parseRoll(table['1']);
  if (!base || Object.keys(table).length !== levels.length) return undefined;
  const scales = levels.every((level, index) => {
    const roll = parseRoll(table[String(level)]);
    return (
      roll?.die === base.die && roll.mod === base.mod && roll.count === base.count * (index + 1)
    );
  });
  return scales ? toRoll(base, { cantripScaling: true }) : undefined;
}

export function mapSpell(raw: RawSpell, notes: string[] = []): SpellDef {
  const classes = new Set(raw.classes.map((ref) => ref.index));
  for (const classIndex of CLASS_LIST_FIXES[raw.index] ?? []) {
    if (classes.has(classIndex)) continue;
    classes.add(classIndex);
    notes.push(`${raw.name}: added to the ${classIndex} list (SRD 5.1 has it; the data does not)`);
  }

  const damage = NOT_DAMAGE.has(raw.index) ? [] : (raw.damage ?? []);
  if (NOT_DAMAGE.has(raw.index)) {
    notes.push(`${raw.name}: dice table is not damage, left for data/mechanics`);
  }
  const spell: SpellDef = {
    kind: 'spell',
    id: `spell.${raw.index}`,
    name: raw.name,
    ...SRD,
    fullText: paragraphs([
      ...raw.desc,
      ...(raw.higher_level?.length ? [`At Higher Levels. ${paragraphs(raw.higher_level)}`] : []),
    ]),
    level: raw.level,
    school: lower(raw.school.index),
    casting: parseCasting(raw.casting_time),
    range: parseRange(raw.range, raw.area_of_effect),
    components: {
      v: raw.components.includes('V'),
      s: raw.components.includes('S'),
      ...(raw.components.includes('M') && { m: raw.material ?? 'A material component' }),
    },
    duration: parseDuration(raw.duration, raw.concentration),
    ritual: raw.ritual,
    ...(raw.dc && { save: toAbility(raw.dc.dc_type.index) }),
    ...(raw.attack_type && { attack: lower(raw.attack_type) }),
    classes: [...classes].sort().map((index) => `class.${index}`),
    tags: [
      ...(damage.length > 0 ? (['damage'] as const) : []),
      ...(raw.heal_at_slot_level ? (['healing'] as const) : []),
    ],
  };

  const [first] = damage;
  if (damage.length > 1) {
    notes.push(`${raw.name}: ${damage.length} damage rolls, left for data/mechanics`);
  } else if (first) {
    const roll = first.damage_at_slot_level
      ? rollFromSlots(first.damage_at_slot_level, raw.level)
      : first.damage_at_character_level && rollFromCharacterLevels(first.damage_at_character_level);
    if (roll && first.damage_type) spell.damage = { ...roll, type: lower(first.damage_type.index) };
    else notes.push(`${raw.name}: damage roll left for data/mechanics`);
  }
  if (raw.heal_at_slot_level) {
    const roll = rollFromSlots(raw.heal_at_slot_level, raw.level);
    if (roll) spell.heal = roll;
    else notes.push(`${raw.name}: healing roll left for data/mechanics`);
  }
  return spell;
}

// ---------------------------------------------------------------------------
// Features, classes, subclasses

/** "Bardic Inspiration (d6)" → "d6": the part of a feature name that changes by level. */
const levelPart = (name: string) => / \(([^)]*)\)$/.exec(name)?.[1];

/**
 * One id per feature across levels. The SRD gives each level its own index, either numbered
 * (`bard-expertise-1`, `-2`) or named after the `(…)` part of the name (`bardic-inspiration-d6`
 * for "Bardic Inspiration (d6)", `action-surge-2-uses`). Both become one entry
 * (`feature.bard.expertise`, `feature.bard.bardic-inspiration`). Runs of dashes
 * (`dragon-ancestor-red---fire-damage`) collapse to one.
 */
export function classFeatureId(index: string, classIndex: string, name = ''): string {
  const part = levelPart(name);
  const key = index
    .replace(/-{2,}/g, '-')
    .replace(part ? new RegExp(`-${slug(part)}$`) : /$^/, '')
    .replace(/-\d+$/, '')
    .replace(new RegExp(`^${classIndex}-`), '')
    .replace(new RegExp(`-${classIndex}$`), '');
  return `feature.${classIndex}.${key}`;
}

export interface FeatureMap {
  features: FeatureDef[];
  /** SRD feature index → our feature id. */
  idOf: Map<string, string>;
}

/** Groups class and subclass features by id, keeping each distinct description once. */
export function mapClassFeatures(raws: RawFeature[], notes: string[] = []): FeatureMap {
  const groups = new Map<string, RawFeature[]>();
  const idOf = new Map<string, string>();
  for (const raw of [...raws].sort((a, b) => a.level - b.level)) {
    const id = classFeatureId(raw.index, raw.class.index, raw.name);
    idOf.set(raw.index, id);
    groups.set(id, [...(groups.get(id) ?? []), raw]);
  }

  const features = [...groups].map(([id, group]): FeatureDef => {
    const [first] = group as [RawFeature, ...RawFeature[]];
    // "Bardic Inspiration (d6)" → "Bardic Inspiration" once the levels are merged.
    const names = new Set(group.map((raw) => raw.name.replace(/ \([^)]*\)$/, '')));
    if (group.length > 1 && names.size > 1) {
      notes.push(`${id}: merged differently named features (${[...names].join(', ')})`);
    }
    return {
      kind: 'feature',
      id,
      name: group.length > 1 ? (names.values().next().value ?? first.name) : first.name,
      ...SRD,
      fullText: paragraphs([...new Set(group.flatMap((raw) => raw.desc))]),
      origin: first.subclass ? 'subclass' : 'class',
      activation: 'special',
    };
  });
  return { features, idOf };
}

function featureTable(levels: RawLevel[], idOf: Map<string, string>) {
  const seen = new Set<string>();
  const table: ClassDef['features'] = [];
  for (const entry of [...levels].sort((a, b) => a.level - b.level)) {
    for (const ref of entry.features ?? []) {
      const featureId = idOf.get(ref.index);
      if (!featureId) throw new Error(`${entry.index}: unknown feature ${ref.index}`);
      const key = `${entry.level}:${featureId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      table.push({ level: entry.level, featureId });
    }
  }
  return table;
}

/** Slot progression and ritual casting are rules text, not data fields, in the SRD files. */
const PROGRESSION: Record<string, 'full' | 'half' | 'third' | 'pact'> = {
  bard: 'full',
  cleric: 'full',
  druid: 'full',
  sorcerer: 'full',
  wizard: 'full',
  paladin: 'half',
  ranger: 'half',
  warlock: 'pact',
};
const RITUAL: Record<string, 'known' | 'prepared'> = {
  bard: 'known',
  wizard: 'known',
  cleric: 'prepared',
  druid: 'prepared',
};

function byClassLevel(levels: RawLevel[], pick: (level: RawLevel) => number | undefined) {
  const values = Array.from({ length: 20 }, (_, index) => {
    const entry = levels.find((level) => level.level === index + 1);
    if (!entry) throw new Error(`${levels[0]?.class.index}: no level ${index + 1}`);
    return pick(entry) ?? 0;
  });
  return values.some((value) => value > 0) ? values : undefined;
}

export function mapClass(raw: RawClass, allLevels: RawLevel[], idOf: Map<string, string>) {
  const own = allLevels.filter((level) => level.class.index === raw.index);
  const levels = own.filter((level) => !level.subclass);
  const subclassLevels = own.filter((level) => level.subclass).map((level) => level.level);
  const progression = PROGRESSION[raw.index];
  if (raw.spellcasting && !progression) throw new Error(`${raw.index}: no slot progression`);

  const cantripsKnown = byClassLevel(levels, (level) => level.spellcasting?.cantrips_known);
  const spellsKnown = byClassLevel(levels, (level) => level.spellcasting?.spells_known);
  const entry: ClassDef = {
    kind: 'class',
    id: `class.${raw.index}`,
    name: raw.name,
    ...SRD,
    hitDie: `d${raw.hit_die}` as ClassDef['hitDie'],
    saves: raw.saving_throws.map((ref) => toAbility(ref.index)),
    ...(raw.spellcasting &&
      progression && {
        spellcasting: {
          ability: toAbility(raw.spellcasting.spellcasting_ability.index),
          progression,
          ...(cantripsKnown && { cantripsKnown }),
          ...(spellsKnown && { spellsKnown }),
          ritual: RITUAL[raw.index] ?? 'none',
        },
      }),
    // The first level with subclass features is the level you pick the subclass.
    subclassLevel: subclassLevels.length > 0 ? Math.min(...subclassLevels) : 3,
    features: featureTable(levels, idOf),
  };
  return entry;
}

export function mapSubclass(
  raw: RawSubclass,
  allLevels: RawLevel[],
  idOf: Map<string, string>,
): SubclassDef {
  return {
    kind: 'subclass',
    id: `subclass.${raw.class.index}.${raw.index}`,
    name: raw.name,
    ...SRD,
    fullText: paragraphs(raw.desc),
    classId: `class.${raw.class.index}`,
    features: featureTable(
      allLevels.filter((level) => level.subclass?.index === raw.index),
      idOf,
    ),
  };
}

// ---------------------------------------------------------------------------
// Races, traits, backgrounds

export function mapTrait(raw: RawTrait): FeatureDef {
  return {
    kind: 'feature',
    id: `feature.${raw.index}`,
    name: raw.name,
    ...SRD,
    fullText: paragraphs(raw.desc),
    origin: 'race',
    activation: 'special',
  };
}

const bonuses = (raws: AbilityBonus[]) =>
  raws.map((raw) => ({ ability: toAbility(raw.ability_score.index), value: raw.bonus }));

/** SRD darkvision is 60 ft for every race that has it. */
const DARKVISION_FEET = 60;

export function mapRace(raw: RawRace): RaceDef {
  const size = lower<RaceDef['size']>(raw.size);
  if (size !== 'small' && size !== 'medium') throw new Error(`${raw.index}: size ${raw.size}`);
  const options = raw.ability_bonus_options;
  const offered = new Set(options?.from.options.map((option) => option.ability_score.index));
  const values = new Set(options?.from.options.map((option) => option.bonus));
  if (values.size > 1) throw new Error(`${raw.index}: ability choices with mixed values`);
  const exclude = ABILITIES.filter((ability) => !offered.has(ability.toLowerCase()));

  return {
    kind: 'race',
    id: `race.${raw.index}`,
    name: raw.name,
    ...SRD,
    fullText: paragraphs([raw.age, raw.alignment, raw.size_description, raw.language_desc]),
    size,
    speed: raw.speed,
    ...(raw.traits.some((trait) => trait.index === 'darkvision') && {
      darkvision: DARKVISION_FEET,
    }),
    abilityBonuses: bonuses(raw.ability_bonuses),
    ...(options && {
      abilityChoices: {
        count: options.choose,
        value: [...values][0] ?? 1,
        ...(exclude.length > 0 && { exclude }),
      },
    }),
    languages: raw.languages.map((ref) => ref.name),
    featureIds: raw.traits.map((ref) => `feature.${ref.index}`),
  };
}

/** Parent stats plus the subrace's own bonuses and traits, so a build needs only one race id. */
export function mapSubrace(raw: RawSubrace, parent: RaceDef): RaceDef {
  return {
    ...parent,
    id: `race.${raw.index}`,
    name: raw.name,
    fullText: paragraphs([raw.desc, parent.fullText ?? ''].filter(Boolean)),
    subraceOf: parent.id,
    abilityBonuses: [...parent.abilityBonuses, ...bonuses(raw.ability_bonuses)],
    featureIds: [...parent.featureIds, ...raw.racial_traits.map((ref) => `feature.${ref.index}`)],
  };
}

export function mapBackground(raw: RawBackground, notes: string[] = []) {
  const skills = raw.starting_proficiencies
    .filter((ref) => ref.index.startsWith('skill-'))
    .map((ref) => ref.index.slice('skill-'.length) as BackgroundDef['skills'][number]);
  const others = raw.starting_proficiencies.filter((ref) => !ref.index.startsWith('skill-'));
  if (others.length > 0) {
    notes.push(
      `${raw.name}: proficiencies left for data/mechanics (${others.map((ref) => ref.index).join(', ')})`,
    );
  }
  const feature: FeatureDef = {
    kind: 'feature',
    id: `feature.${slug(raw.feature.name)}`,
    name: raw.feature.name,
    ...SRD,
    fullText: paragraphs(raw.feature.desc),
    origin: 'background',
    activation: 'special',
  };
  const background: BackgroundDef = {
    kind: 'background',
    id: `background.${raw.index}`,
    name: raw.name,
    ...SRD,
    skills,
    tools: [],
    featureIds: [feature.id],
  };
  return { background, feature };
}

// ---------------------------------------------------------------------------
// Items and conditions

/** Kits on the PHB tool table that the SRD data files under adventuring gear. */
const TOOL_KITS = new Set(['disguise-kit', 'forgery-kit', 'herbalism-kit', 'poisoners-kit']);
const CONTAINERS = new Set([
  'backpack',
  'barrel',
  'basket',
  'bucket',
  'case-crossbow-bolt',
  'case-map-or-scroll',
  'chest',
  'pouch',
  'quiver',
  'sack',
]);
const CONSUMABLES = new Set([
  'acid-vial',
  'alchemists-fire-flask',
  'antitoxin-vial',
  'holy-water-flask',
  'oil-flask',
  'poison-basic-vial',
  'rations-1-day',
]);

function itemCategory(raw: RawItem): ItemDef['category'] | undefined {
  switch (raw.equipment_category.index) {
    case 'weapon':
      return 'weapon';
    case 'armor':
      return 'armor';
    case 'tools':
      return raw.tool_category === 'Musical Instrument' ? 'instrument' : 'tool';
    case 'adventuring-gear':
      if (TOOL_KITS.has(raw.index)) return 'tool';
      if (raw.gear_category?.index === 'ammunition' || CONSUMABLES.has(raw.index)) {
        return 'consumable';
      }
      return CONTAINERS.has(raw.index) ? 'container' : 'gear';
    case 'mounts-and-vehicles':
      return undefined;
    default:
      throw new Error(`${raw.index}: unknown equipment category ${raw.equipment_category.index}`);
  }
}

function mapWeapon(raw: RawItem): NonNullable<ItemDef['weapon']> {
  const dice = raw.damage?.damage_dice;
  // Thrown melee weapons keep their throw range; a melee `range` is only reach.
  const range = raw.weapon_range === 'Ranged' ? raw.range : raw.throw_range;
  return {
    category: lower(raw.weapon_category ?? ''),
    type: lower(raw.weapon_range ?? ''),
    ...(raw.damage &&
      dice && {
        damage: /^\d+$/.test(dice) ? Number(dice) : dice,
        damageType: lower(raw.damage.damage_type.index),
      }),
    // "Monk" marks monk weapons in the data; it is not a 2014 weapon property.
    properties: (raw.properties ?? [])
      .map((ref) => ref.index)
      .filter((index) => index !== 'monk')
      .map((index) => lower(index)),
    ...(range?.long && { range: { normal: range.normal, long: range.long } }),
    ...(raw.two_handed_damage && { versatile: raw.two_handed_damage.damage_dice }),
  };
}

/** Returns undefined for mounts and vehicles, which are not carried items. */
export function mapItem(raw: RawItem): ItemDef | undefined {
  const category = itemCategory(raw);
  if (!category) return undefined;
  const text = [...(raw.desc ?? []), ...(raw.special ?? [])];
  return {
    kind: 'item',
    id: `item.${raw.index}`,
    name: raw.name,
    ...SRD,
    ...(text.length > 0 && { fullText: paragraphs(text) }),
    category,
    ...(raw.weight !== undefined && { weight: raw.weight }),
    ...(raw.cost && { cost: { amount: raw.cost.quantity, unit: lower(raw.cost.unit) } }),
    ...(raw.quantity !== undefined && raw.quantity > 1 && { bundle: raw.quantity }),
    ...(category === 'weapon' && { weapon: mapWeapon(raw) }),
    ...(category === 'armor' &&
      raw.armor_class && {
        armor: {
          category: lower(raw.armor_category ?? ''),
          baseAc: raw.armor_class.base,
          ...(raw.str_minimum ? { strMin: raw.str_minimum } : {}),
          stealthDisadvantage: raw.stealth_disadvantage ?? false,
        },
      }),
  };
}

// Charge counts and regain rolls, checked against each item's text at import. Items whose
// starting charges are random (Luck Blade, Nine Lives Stealer) or that recharge on a weekly
// cycle (Ivory Goats) are left for the player's notes.
type ChargeRow = readonly [
  max: number,
  regain: 'all' | 'none' | `${number}d${number}${'' | ` + ${number}`}`,
];
const D3 = [3, '1d3'] as const;
const D6P1 = [7, '1d6 + 1'] as const;
const D6P4 = [10, '1d6 + 4'] as const;
const D4P1 = [5, '1d4 + 1'] as const;
const MAGIC_ITEM_CHARGES: Record<string, ChargeRow> = {
  'cube-of-force': [36, '1d20'],
  'cubic-gate': D3,
  'eyes-of-charming': [3, 'all'],
  'gem-of-brightness': [50, 'none'],
  'gem-of-seeing': D3,
  'hammer-of-thunderbolts': D4P1,
  'helm-of-teleportation': D3,
  'mace-of-terror': D3,
  'medallion-of-thoughts': D3,
  'orb-of-dragonkind': [7, '1d4 + 3'],
  'pipes-of-haunting': D3,
  'pipes-of-the-sewers': D3,
  'ring-of-animal-influence': D3,
  'ring-of-elemental-command-air': D4P1,
  'ring-of-elemental-command-earth': D4P1,
  'ring-of-elemental-command-fire': D4P1,
  'ring-of-elemental-command-water': D4P1,
  'ring-of-evasion': D3,
  'ring-of-shooting-stars': [6, '1d6'],
  'ring-of-the-ram': D3,
  'ring-of-three-wishes': [3, 'none'],
  'robe-of-scintillating-colors': D3,
  'scarab-of-protection': [12, 'none'],
  'staff-of-charming': [10, '1d8 + 2'],
  'staff-of-fire': D6P4,
  'staff-of-frost': D6P4,
  'staff-of-healing': D6P4,
  'staff-of-power': [20, '2d8 + 4'],
  'staff-of-striking': D6P4,
  'staff-of-swarming-insects': D6P4,
  'staff-of-the-magi': [50, '4d6 + 2'],
  'staff-of-the-woodlands': D6P4,
  'staff-of-withering': D3,
  'talisman-of-pure-good': [7, 'none'],
  'talisman-of-ultimate-evil': [6, 'none'],
  'trident-of-fish-command': D3,
  'wand-of-binding': D6P1,
  'wand-of-enemy-detection': D6P1,
  'wand-of-fear': D6P1,
  'wand-of-fireballs': D6P1,
  'wand-of-lightning-bolts': D6P1,
  'wand-of-magic-detection': D3,
  'wand-of-magic-missiles': D6P1,
  'wand-of-paralysis': D6P1,
  'wand-of-polymorph': D6P1,
  'wand-of-secrets': D3,
  'wand-of-web': D6P1,
  'wand-of-wonder': D6P1,
};

const RARITIES: Record<string, ItemRarity> = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  'Very Rare': 'very-rare',
  Legendary: 'legendary',
  Artifact: 'artifact',
  Varies: 'varies',
};

function magicItemCharges(raw: RawMagicItem, text: string): ItemCharges | undefined {
  const row = MAGIC_ITEM_CHARGES[raw.index];
  if (!row) return undefined;
  const [max, regain] = row;
  if (!new RegExp(`\\b${max} (?:magic )?charges\\b`).test(text))
    throw new Error(`${raw.index}: text does not state ${max} charges`);
  if (regain === 'none') {
    if (/regains?[^.]*charges/.test(text)) throw new Error(`${raw.index}: text says it recharges`);
    return { max, recharge: 'none' };
  }
  const stated =
    regain === 'all'
      ? 'all expended charges daily at dawn'
      : `${regain} expended charges daily at dawn`;
  if (!text.includes(`regain ${stated}`) && !text.includes(`regains ${stated}`))
    throw new Error(`${raw.index}: text does not state "${stated}"`);
  if (regain === 'all') return { max, recharge: 'dawn', regain: 'all' };
  const [, dice, bonus] = /^(\d+d\d+)(?: \+ (\d+))?$/.exec(regain)!;
  return {
    max,
    recharge: 'dawn',
    regain: { dice: dice!, ...(bonus !== undefined && { bonus: Number(bonus) }) },
  };
}

/**
 * DMG magic items in the SRD. Generic parents ("Armor, +1") are skipped for their listed
 * variants. Potions, scrolls and ammunition are consumables; everything else is 'magic' with
 * no weapon or armor stats, so bonuses stay manual until the Effects editor (M10).
 */
export function mapMagicItem(raw: RawMagicItem, notes: string[]): ItemDef | undefined {
  if (raw.variants.length > 0) return undefined;
  const rarity = RARITIES[raw.rarity.name];
  if (!rarity) throw new Error(`${raw.index}: unknown rarity ${raw.rarity.name}`);
  const text = raw.desc.join(' ');
  const charges = magicItemCharges(raw, text);
  if (!charges && /\bcharges?\b/.test(text)) notes.push(`${raw.index}: charges left for notes`);
  const consumable = ['potion', 'scroll', 'ammunition'].includes(raw.equipment_category.index);
  return {
    kind: 'item',
    id: `item.${raw.index}`,
    name: raw.name,
    ...SRD,
    source: 'DMG',
    fullText: paragraphs(raw.desc),
    category: consumable ? 'consumable' : 'magic',
    rarity,
    ...(/\(requires attunement/.test(raw.desc[0] ?? '') && { attunement: true }),
    ...(charges && { charges }),
  };
}

export function mapCondition(raw: RawCondition): ConditionDef {
  return {
    kind: 'condition',
    id: `condition.${raw.index}`,
    name: raw.name,
    ...SRD,
    fullText: raw.desc.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Report helpers

const REF_ID =
  /^(?:spell|feature|item|condition|class|subclass|race|background)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

/** Every reference id in a JSON value, as a value or as a record key (`featureUsesSpent`). */
export function referencedIds(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (REF_ID.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) referencedIds(item, found);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (REF_ID.test(key)) found.add(key);
      referencedIds(item, found);
    }
  }
  return found;
}

export const sortById = <T extends RefEntry>(entries: T[]) =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id));
