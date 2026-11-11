import type { BackgroundDef } from '../schema';

export type ToolGroup = NonNullable<BackgroundDef['toolChoices']>[number]['group'];

/** Languages a background or race may grant by choice. */
export const LANGUAGES = [
  'Common',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
  'Abyssal',
  'Celestial',
  'Draconic',
  'Deep Speech',
  'Infernal',
  'Primordial',
  'Sylvan',
  'Undercommon',
] as const;

const GAMING = ['item.dice-set', 'item.playing-card-set'];
const ARTISAN = [
  'item.alchemists-supplies',
  'item.brewers-supplies',
  'item.calligraphers-supplies',
  'item.carpenters-tools',
  'item.cartographers-tools',
  'item.cobblers-tools',
  'item.cooks-utensils',
  'item.glassblowers-tools',
  'item.jewelers-tools',
  'item.leatherworkers-tools',
  'item.masons-tools',
  'item.painters-supplies',
  'item.potters-tools',
  'item.smiths-tools',
  'item.tinkers-tools',
  'item.weavers-tools',
  'item.woodcarvers-tools',
];
const OTHER_TOOLS = [
  'item.disguise-kit',
  'item.forgery-kit',
  'item.herbalism-kit',
  'item.navigators-tools',
  'item.poisoners-kit',
  'item.thieves-tools',
];

/** Item ids a tool choice may take. Instruments come from the item list by category. */
export function toolGroupOptions(
  group: ToolGroup,
  items: readonly { id: string; category: string }[],
): string[] {
  const instruments = items.filter((i) => i.category === 'instrument').map((i) => i.id);
  switch (group) {
    case 'gaming':
      return GAMING;
    case 'artisan':
      return ARTISAN;
    case 'instrument':
      return instruments;
    case 'any':
      return [...GAMING, ...ARTISAN, ...OTHER_TOOLS, ...instruments];
  }
}

/** One slot per picked tool, in the background's order. */
export function toolSlots(background: BackgroundDef): ToolGroup[] {
  return (background.toolChoices ?? []).flatMap(({ count, group }) =>
    Array.from({ length: count }, () => group),
  );
}
