import type { Registry } from '../../engine/registry';
import {
  CUSTOM_ITEM_PREFIX,
  CustomItemSchema,
  type ItemCharges,
  type ItemDef,
  type ItemRarity,
} from '../../engine/schema';
import { parseWholeCount } from './whole-count';

/** What the player types. The form turns these choices into an item definition. */
export type CustomItemFields = {
  name: string;
  category: ItemDef['category'];
  /** Weapons and armor copy their stats from this catalogue item. */
  baseItemId: string;
  /** Blank: the base item's weight, or none. */
  weight: string;
  /** Gold pieces; blank for no recorded cost. */
  cost: string;
  rarity: ItemRarity | '';
  attunement: boolean;
  description: string;
  /** Blank: no charges. */
  charges: string;
  recharge: ItemCharges['recharge'];
  regain: 'all' | 'dice';
  regainDice: string;
  regainBonus: string;
  /** Consumables only. Blank: no healing roll. */
  healingDice: string;
  healingBonus: string;
};

export const MAX_DESCRIPTION_WORDS = 40;

export function emptyCustomItemFields(): CustomItemFields {
  return {
    name: '',
    category: 'magic',
    baseItemId: '',
    weight: '',
    cost: '',
    rarity: '',
    attunement: false,
    description: '',
    charges: '',
    recharge: 'dawn',
    regain: 'dice',
    regainDice: '',
    regainBonus: '',
    healingDice: '',
    healingBonus: '',
  };
}

/** Fill the form from a saved definition. */
export function customItemFields(def: ItemDef): CustomItemFields {
  const regain = def.charges?.regain;
  const healing = def.use?.healing;
  return {
    name: def.name,
    category: def.category,
    baseItemId: def.baseItemId ?? '',
    weight: def.weight === undefined ? '' : String(def.weight),
    cost: def.cost?.unit === 'gp' ? String(def.cost.amount) : '',
    rarity: def.rarity ?? '',
    attunement: def.attunement ?? false,
    description: def.summary?.effect ?? '',
    charges: def.charges ? String(def.charges.max) : '',
    recharge: def.charges?.recharge ?? 'dawn',
    regain: regain === 'all' ? 'all' : 'dice',
    regainDice: typeof regain === 'object' ? regain.dice : '',
    regainBonus: typeof regain === 'object' && regain.bonus ? String(regain.bonus) : '',
    healingDice: healing?.dice ?? '',
    healingBonus: healing?.bonus ? String(healing.bonus) : '',
  };
}

/** Catalogue weapons or armor a custom item can be based on. Never another custom item. */
export function baseItemOptions(registry: Registry, category: ItemDef['category']): ItemDef[] {
  if (category !== 'weapon' && category !== 'armor') return [];
  return [...(registry.base ?? registry).entries.values()]
    .filter(
      (entry): entry is ItemDef =>
        entry.kind === 'item' &&
        entry.category === category &&
        !entry.id.startsWith(CUSTOM_ITEM_PREFIX),
    )
    .sort((first, second) => first.name.localeCompare(second.name, 'en'));
}

/** A readable id that is not taken yet: item.custom.flame-rapier, then -2, -3... */
export function newCustomItemId(name: string, taken: (id: string) => boolean): string {
  const slug =
    name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'item';
  let id = `${CUSTOM_ITEM_PREFIX}${slug}`;
  for (let n = 2; taken(id); n += 1) id = `${CUSTOM_ITEM_PREFIX}${slug}-${n}`;
  return id;
}

function number(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

const DICE = /^[1-9]\d*d(4|6|8|10|12|20|100)$/;
const REGAIN_DICE = /^[1-9]\d*d(3|4|6|8|10|12|20)$/;

/** Turn the form into a definition, or list what to fix. */
export function buildCustomItem(
  fields: CustomItemFields,
  id: string,
  registry: Registry,
): { item: ItemDef; errors: [] } | { item?: undefined; errors: string[] } {
  const errors: string[] = [];
  const name = fields.name.trim();
  if (!name) errors.push('Enter a name.');
  const statsFrom = fields.category === 'weapon' || fields.category === 'armor';
  const base = statsFrom
    ? baseItemOptions(registry, fields.category).find((entry) => entry.id === fields.baseItemId)
    : undefined;
  if (statsFrom && !base) errors.push(`Choose which ${fields.category} it is based on.`);
  const weight = number(fields.weight);
  if (Number.isNaN(weight)) errors.push('Weight must be zero or more.');
  const cost = number(fields.cost);
  if (Number.isNaN(cost)) errors.push('Cost must be zero or more.');
  const description = fields.description.trim();
  if (description && description.split(/\s+/).length > MAX_DESCRIPTION_WORDS)
    errors.push(`Keep the description to ${MAX_DESCRIPTION_WORDS} words or fewer.`);

  let charges: ItemCharges | undefined;
  if (fields.charges.trim()) {
    const max = parseWholeCount(fields.charges);
    if (max === undefined || max < 1) errors.push('Charges must be a whole number of 1 or more.');
    else if (fields.recharge === 'none') charges = { max, recharge: 'none' };
    else if (fields.regain === 'all') charges = { max, recharge: fields.recharge, regain: 'all' };
    else {
      const dice = fields.regainDice.trim().toLowerCase();
      const bonus = fields.regainBonus.trim() ? parseWholeCount(fields.regainBonus) : undefined;
      if (!REGAIN_DICE.test(dice)) errors.push('Enter recharge dice like 1d6.');
      if (fields.regainBonus.trim() && !bonus)
        errors.push('Recharge bonus must be a whole number of 1 or more.');
      charges = {
        max,
        recharge: fields.recharge,
        regain: { dice, ...(bonus ? { bonus } : {}) },
      };
    }
  }

  let use: ItemDef['use'];
  if (fields.category === 'consumable') {
    const dice = fields.healingDice.trim().toLowerCase();
    const bonus = fields.healingBonus.trim() ? parseWholeCount(fields.healingBonus) : undefined;
    if (dice && !DICE.test(dice)) errors.push('Enter healing dice like 2d4.');
    if (fields.healingBonus.trim() && (!dice || !bonus))
      errors.push('A healing bonus needs healing dice and must be 1 or more.');
    use = {
      activation: 'action',
      ...(dice ? { healing: { dice, ...(bonus ? { bonus } : {}) } } : {}),
    };
  }

  if (errors.length > 0) return { errors };
  const item: ItemDef = {
    kind: 'item',
    id,
    name,
    ruleset: '5e-2014',
    source: 'HB',
    srd: false,
    category: fields.category,
    ...(description ? { summary: { effect: description } } : {}),
    ...(fields.rarity ? { rarity: fields.rarity } : {}),
    ...((weight ?? base?.weight) !== undefined ? { weight: weight ?? base!.weight! } : {}),
    ...(cost !== undefined ? { cost: { amount: cost, unit: 'gp' as const } } : {}),
    ...(base?.weapon ? { weapon: structuredClone(base.weapon) } : {}),
    ...(base?.armor ? { armor: structuredClone(base.armor) } : {}),
    ...(base ? { baseItemId: base.id } : {}),
    ...(fields.attunement ? { attunement: true } : {}),
    ...(charges ? { charges } : {}),
    ...(use ? { use } : {}),
  };
  const parsed = CustomItemSchema.safeParse(item);
  if (!parsed.success)
    return { errors: parsed.error.issues.map((issue) => issue.message).slice(0, 3) };
  return { item: parsed.data, errors: [] };
}
