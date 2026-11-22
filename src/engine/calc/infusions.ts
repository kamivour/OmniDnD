import replicas from '../../../data/content/infusion-replicas.json' with { type: 'json' };
import type { CharacterBuild, LiveState, ItemDef, FeatureDefenses } from '../schema';
import type { DamageType } from '../rules2014';
import type { Registry } from '../registry';

export const INFUSION_PREFIX = 'feature.artificer.infusion-';
export const REPLICATE_INFUSION = `${INFUSION_PREFIX}replicate-magic-item`;

/** Tasha's named tables. Each item is a separate known infusion. */
export const REPLICATE_RECIPES = Object.entries(replicas).flatMap(([level, names]) =>
  names.map((name) => ({
    id: `${REPLICATE_INFUSION}-${name.toLowerCase().replaceAll(' ', '-')}`,
    name,
    level: Number(level),
  })),
);
const recipeLevels = new Map(REPLICATE_RECIPES.map(({ id, level }) => [id, level]));

export const isReplicateInfusion = (id: string) =>
  id === REPLICATE_INFUSION || recipeLevels.has(id);
export const RESISTANT_ARMOR_TYPES = [
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
] as const satisfies readonly DamageType[];
export const isResistantArmorType = (type: DamageType) =>
  RESISTANT_ARMOR_TYPES.some((candidate) => candidate === type);
/** Tasha's 2014 Artificer: known recipes, separate from the active-item limit. */
export const INFUSIONS_KNOWN: [number, number][] = [
  [2, 4],
  [6, 6],
  [10, 8],
  [14, 10],
  [18, 12],
];
export const infusionsKnownAt = (level: number) =>
  INFUSIONS_KNOWN.reduce((total, [from, count]) => (level >= from ? count : total), 0);
export const infusionMinimumLevel = (id: string) =>
  recipeLevels.get(id) ?? INFUSIONS[infusionKey(id)]?.level ?? 2;
type Gear =
  | 'weapon'
  | 'thrown'
  | 'ammunition'
  | 'armor'
  | 'shield'
  | 'defense'
  | 'focus'
  | 'robes'
  | 'boots'
  | 'helmet'
  | 'ring';
export const INFUSIONS: Readonly<
  Record<string, { level: number; gear: Gear; attunement?: boolean }>
> = {
  'enhanced-weapon': { level: 2, gear: 'weapon' },
  'enhanced-defense': { level: 2, gear: 'defense' },
  'enhanced-arcane-focus': { level: 2, gear: 'focus', attunement: true },
  'returning-weapon': { level: 2, gear: 'thrown' },
  'repeating-shot': { level: 2, gear: 'ammunition', attunement: true },
  'mind-sharpener': { level: 2, gear: 'robes' },
  'repulsion-shield': { level: 6, gear: 'shield', attunement: true },
  'resistant-armor': { level: 6, gear: 'armor', attunement: true },
  'radiant-weapon': { level: 6, gear: 'weapon', attunement: true },
  'boots-of-the-winding-path': { level: 6, gear: 'boots', attunement: true },
  'armor-of-magical-strength': { level: 2, gear: 'armor', attunement: true },
  'helm-of-awareness': { level: 10, gear: 'helmet', attunement: true },
  'spell-refueling-ring': { level: 6, gear: 'ring', attunement: true },
  'arcane-propulsion-armor': { level: 14, gear: 'armor', attunement: true },
};

export const artificerLevel = (build: CharacterBuild) =>
  build.classes.find((c) => c.classId === 'class.artificer')?.level ?? 0;
export function infusionLimit(build: CharacterBuild) {
  const level = artificerLevel(build);
  return level < 2 ? 0 : level < 6 ? 2 : level < 10 ? 3 : level < 14 ? 4 : level < 18 ? 5 : 6;
}
export const infusionKey = (id: string) =>
  id.startsWith(INFUSION_PREFIX) ? id.slice(INFUSION_PREFIX.length) : '';
export function infusionFits(key: string, item: ItemDef): boolean {
  const gear = INFUSIONS[key]?.gear;
  switch (gear) {
    case 'weapon':
      return !!item.weapon;
    case 'thrown':
      return !!item.weapon?.properties.includes('thrown');
    case 'ammunition':
      return !!item.weapon?.properties.includes('ammunition');
    case 'armor':
      return !!item.armor && item.armor.category !== 'shield';
    case 'shield':
      return item.armor?.category === 'shield';
    case 'defense':
      return !!item.armor;
    case 'focus':
      return /^(rod|staff|wand)(\b| \()/i.test(item.name);
    case 'robes':
      return (!!item.armor && item.armor.category !== 'shield') || /\brobes?\b/i.test(item.name);
    case 'boots':
      return /\bboots\b/i.test(item.name);
    case 'helmet':
      return /\b(helmet|helm)\b/i.test(item.name);
    case 'ring':
      return /\bring\b/i.test(item.name);
    default:
      return false;
  }
}
export const magicalItem = (item: ItemDef) =>
  item.category === 'magic' || !!item.rarity || !!item.attunement;

/** Saved applications survive rests; forgotten infusions and missing items give no bonuses. */
export function activeInfusions(build: CharacterBuild, live: LiveState) {
  const seenItems = new Set<string>(),
    seenInfusions = new Set<string>();
  return (live.infusions ?? []).filter((entry) => {
    const key = infusionKey(entry.featureId),
      rule = INFUSIONS[key];
    const valid =
      rule &&
      artificerLevel(build) >= rule.level &&
      build.featureIds.includes(entry.featureId) &&
      !seenItems.has(entry.instanceId) &&
      !seenInfusions.has(entry.featureId);
    seenItems.add(entry.instanceId);
    seenInfusions.add(entry.featureId);
    return !!valid;
  });
}
export function infusionBonus(key: string, build: CharacterBuild) {
  return key.startsWith('enhanced-') && artificerLevel(build) >= 10 ? 2 : 1;
}

/** Equipped and, when required, attuned by this character. No ally's stats are mutated. */
export function wornInfusions(build: CharacterBuild, live: LiveState, registry: Registry) {
  return activeInfusions(build, live).filter(
    (entry) =>
      live.items[entry.instanceId]?.qty === 1 &&
      build.items.some((item) => {
        const def = registry.entries.get(item.itemId);
        return (
          item.instanceId === entry.instanceId &&
          def?.kind === 'item' &&
          !magicalItem(def) &&
          infusionFits(infusionKey(entry.featureId), def)
        );
      }) &&
      live.items[entry.instanceId]?.equipped &&
      (!INFUSIONS[infusionKey(entry.featureId)]?.attunement ||
        live.items[entry.instanceId]?.attuned),
  );
}

export function infusionDefenses(
  build: CharacterBuild,
  live: LiveState,
  registry: Registry,
): { name: string; defenses: FeatureDefenses }[] {
  return wornInfusions(build, live, registry).flatMap((entry) =>
    infusionKey(entry.featureId) === 'resistant-armor' && entry.damageType
      ? [{ name: 'Resistant Armor', defenses: { resistances: [entry.damageType] } }]
      : [],
  );
}
