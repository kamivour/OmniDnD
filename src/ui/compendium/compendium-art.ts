import { itemTier, itemType, type CatalogEntry, type ItemType } from '../../engine/catalog';
import type { ItemDef } from '../../engine/schema';
import { registry } from '../../data/registry';
import { schoolIconId } from '../format';
import type { GameIconId } from '../icons/game-icons';
import { equipmentBases, equipmentReferences } from './equipment-reference';

type CatalogIcon = Extract<GameIconId, `catalog.${string}`>;

/** Ardentryst drawings by Elle Trudgett (CC BY 3.0), credited on the Credits screen. */
export const equipmentArtwork: Partial<Record<string, string>> = {
  'item.longsword': 'longsword',
  'item.shortsword': 'shortsword',
  'item.battleaxe': 'battleaxe',
  'item.halberd': 'halberd',
  'item.crossbow-light': 'crossbow',
  'item.crossbow-heavy': 'crossbow',
  'item.crossbow-hand': 'crossbow',
  'item.sickle': 'sickle',
  'item.plate-armor': 'plate',
  'item.helm-of-telepathy': 'helmet',
  'item.winged-boots': 'winged-boots',
  'item.quarterstaff': 'staff',
  'item.ring-of-protection': 'ring',
  'item.amulet-of-health': 'pendant',
  'item.potion-of-healing-common': 'healing-potion',
  'item.potion-of-healing-greater': 'healing-potion',
  'item.potion-of-healing-superior': 'healing-potion',
  'item.potion-of-healing-supreme': 'healing-potion',
  'item.cloak-of-protection': 'cloak',
  'item.poison-basic-vial': 'poison',
};

const typeIcon: Record<ItemType, CatalogIcon> = {
  weapon: 'catalog.sword',
  armor: 'catalog.armor',
  gear: 'catalog.pack',
  tool: 'catalog.tool',
  instrument: 'catalog.instrument',
  container: 'catalog.chest',
  consumable: 'catalog.potion',
  potion: 'catalog.potion',
  scroll: 'catalog.scroll',
  ring: 'catalog.ring',
  rod: 'catalog.wand',
  staff: 'catalog.staff',
  wand: 'catalog.wand',
  wondrous: 'catalog.orb',
};

const silhouettes: readonly [RegExp, CatalogIcon][] = [
  [/\btrident\b/, 'catalog.trident'],
  [/\bcrossbow\b/, 'catalog.crossbow'],
  [/\b(?:longbow|shortbow|oathbow|bow)\b/, 'catalog.bow'],
  [/\b(?:dagger|knife)\b/, 'catalog.dagger'],
  [/\brapier\b/, 'catalog.rapier'],
  [/\b(?:battleaxe|greataxe|handaxe|axe)\b/, 'catalog.axe'],
  [/\b(?:warhammer|hammer|maul)\b/, 'catalog.hammer'],
  [/\b(?:mace|morningstar|club|greatclub)\b/, 'catalog.mace'],
  [/\bflail\b/, 'catalog.flail'],
  [/\b(?:spear|javelin|glaive|halberd|pike|lance)\b/, 'catalog.spear'],
  [/\b(?:net|rope of entanglement)\b/, 'catalog.net'],
  [/\bwhip\b/, 'catalog.whip'],
  [/\bsling\b/, 'catalog.sling'],
  [/\b(?:ammunition|arrow|arrows|bolt|bolts|dart|darts|quiver)\b/, 'catalog.arrow'],
  [/\b(?:quarterstaff|staff)\b/, 'catalog.staff'],
  [/\bshield\b/, 'catalog.shield'],
  [/\b(?:helm|helmet|hat|cap|crown|circlet)\b/, 'catalog.helmet'],
  [/\b(?:boots|shoes|slippers|greaves|sandals)\b/, 'catalog.boots'],
  [/\b(?:gloves|gauntlets|bracers)\b/, 'catalog.gloves'],
  [/\b(?:cloak|robe|mantle|cape)\b/, 'catalog.cloak'],
  [
    /\b(?:amulet|necklace|pendant|brooch|locket|periapt|talisman|belt|medallion)\b/,
    'catalog.amulet',
  ],
  [/\b(?:bag|pouch|sack|pack|backpack|haversack)\b/, 'catalog.pack'],
  [/\b(?:chest|box|case|barrel)\b/, 'catalog.chest'],
  [/\b(?:book|tome|manual)\b/, 'catalog.book'],
  [/\b(?:rations?|food|bread|meal)\b/, 'catalog.food'],
  [/\b(?:lantern|lamp|torch|candle)\b/, 'catalog.lantern'],
  [/\b(?:rope|cord|string|chain)\b/, 'catalog.rope'],
];

const featGroups: readonly [CatalogIcon, string][] = [
  ['catalog.mask', 'actor fade-away skulker shadow-touched'],
  ['catalog.eye', 'alert dungeon-delver observant keen-mind telepathic'],
  ['catalog.boots', 'athlete charger mobile squat-nimbleness'],
  ['catalog.crossbow', 'crossbow-expert gunner'],
  ['catalog.shield', 'defensive-duelist sentinel shield-master resilient infernal-constitution'],
  [
    'catalog.sword',
    'dual-wielder great-weapon-master savage-attacker slasher weapon-master mage-slayer fighting-initiate orcish-fury martial-adept',
  ],
  ['catalog.fist', 'grappler tavern-brawler telekinetic'],
  ['catalog.heart', 'durable healer tough dwarven-fortitude'],
  ['catalog.fire', 'elemental-adept flames-of-phlegethos'],
  [
    'catalog.armor',
    'heavily-armored heavy-armor-master lightly-armored medium-armor-master moderately-armored',
  ],
  ['catalog.medal', 'inspiring-leader prodigy skilled skill-expert'],
  ['catalog.book', 'linguist magic-initiate ritual-caster'],
  ['catalog.dice', 'lucky bountiful-luck second-chance'],
  ['catalog.horse', 'mounted-combatant'],
  ['catalog.spear', 'polearm-master piercer'],
  ['catalog.target', 'sharpshooter spell-sniper elven-accuracy'],
  [
    'catalog.wand',
    'war-caster fey-touched eldritch-adept metamagic-adept drow-high-magic fey-teleportation',
  ],
  ['catalog.hammer', 'crusher'],
  ['catalog.tool', 'artificer-initiate'],
  ['catalog.food', 'chef'],
  ['catalog.potion', 'poisoner'],
  ['catalog.dragon', 'dragon-fear dragon-hide'],
  ['catalog.tree', 'wood-elf-magic'],
];
export const featIcons = new Map<string, CatalogIcon>(
  featGroups.flatMap(([icon, names]) =>
    names.split(' ').map((name) => [`feature.feat.${name}`, icon] as const),
  ),
);

const objectIcon = (name: string) =>
  silhouettes.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1];

export function itemArt(item: ItemDef, previewBase?: ItemDef) {
  const type = itemType(item);
  const bases = previewBase ? [previewBase] : equipmentBases(item, registry);
  const base = bases.length === 1 ? bases[0] : undefined;
  const model = base ?? item;
  const artwork = equipmentArtwork[item.id] ?? equipmentArtwork[model.id];
  const shape = model.armor
    ? model.armor.category === 'shield'
      ? 'catalog.shield'
      : 'catalog.armor'
    : objectIcon(model.name);
  const fallback =
    type === 'weapon' ||
    type === 'armor' ||
    type === 'gear' ||
    type === 'wondrous' ||
    type === 'consumable' ||
    type === 'container'
      ? (shape ??
        (equipmentReferences[item.id]?.ammunition ? 'catalog.arrow' : undefined) ??
        (model.weapon?.type === 'ranged' ? 'catalog.bow' : undefined) ??
        typeIcon[type])
      : typeIcon[type];
  return {
    id: item.iconId ?? model.iconId ?? model.id,
    fallback,
    artwork: artwork && `/compendium/${artwork}.png`,
    tier: itemTier(item),
  };
}

export function entryArt(entry: CatalogEntry, previewBase?: ItemDef) {
  if (entry.kind === 'item') return itemArt(entry, previewBase);
  let fallback: string;
  switch (entry.kind) {
    case 'spell':
      fallback = schoolIconId(entry.school);
      break;
    case 'subclass':
      fallback = entry.classId;
      break;
    case 'feature':
      fallback = featIcons.get(entry.id) ?? 'catalog.medal';
      break;
    case 'race':
      fallback = /dragon/i.test(entry.name)
        ? 'catalog.dragon'
        : /elf/i.test(entry.name)
          ? 'catalog.tree'
          : /dwarf/i.test(entry.name)
            ? 'catalog.hammer'
            : /tiefling/i.test(entry.name)
              ? 'catalog.fire'
              : 'catalog.medal';
      break;
    case 'background':
      fallback = /soldier|knight|mercenary|guard/i.test(entry.name)
        ? 'catalog.shield'
        : /artisan|smith|merchant/i.test(entry.name)
          ? 'catalog.tool'
          : /criminal|charlatan|spy/i.test(entry.name)
            ? 'catalog.mask'
            : /entertainer|gladiator/i.test(entry.name)
              ? 'catalog.instrument'
              : /sailor|pirate|fisher/i.test(entry.name)
                ? 'catalog.net'
                : 'catalog.book';
      break;
    default:
      fallback = 'catalog.medal';
  }
  return { id: entry.iconId ?? entry.id, fallback, artwork: undefined, tier: undefined };
}
