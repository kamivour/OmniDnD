/**
 * Theme registry (docs/PLAN.md M39). Colours live in CSS: tokens.css for Dark and one file per
 * other theme in ./themes/. This list holds what the picker, Find and the tests need.
 */

export type ThemeGroup = 'basic' | 'glass' | 'planes' | 'places' | 'light';

export const THEME_GROUPS: readonly { id: ThemeGroup; label: string }[] = [
  { id: 'basic', label: 'Basic' },
  { id: 'glass', label: 'Glass and water' },
  { id: 'planes', label: 'Planes of existence' },
  { id: 'places', label: 'Places' },
  { id: 'light', label: 'Light' },
];

/** Moving background behind the app, only at the full effect level. */
export type AmbientEffect =
  | 'blobs'
  | 'caustics'
  | 'embers'
  | 'ash'
  | 'motes'
  | 'wisps'
  | 'stars'
  | 'gears'
  | 'snow'
  | 'spores'
  | 'mist'
  | 'rays';

export interface ThemeInfo {
  id: string;
  name: string;
  /** One line for the picker. */
  hint: string;
  group: ThemeGroup;
  scheme: 'dark' | 'light';
  /** The title has its own effect (static on phones, animated on desktops). */
  title?: boolean;
  ambient?: AmbientEffect;
  /** Press feedback: a water ripple, or a glass sheen that follows the pointer. */
  press?: 'ripple' | 'sheen';
  /** Extra words for Find. */
  synonyms: readonly string[];
  /** Kept in code but left out of the picker and Find until it is reworked. */
  hidden?: boolean;
}

export const THEMES = [
  {
    id: 'dark',
    name: 'Dark',
    hint: 'Deep blue with gold.',
    group: 'basic',
    scheme: 'dark',
    synonyms: ['dark mode', 'night', 'default'],
  },
  {
    id: 'parchment',
    name: 'Parchment',
    hint: 'Soft light paper for bright rooms.',
    group: 'basic',
    scheme: 'light',
    synonyms: ['light mode', 'paper', 'day'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    hint: 'True black with bright system colours.',
    group: 'basic',
    scheme: 'dark',
    synonyms: ['ios', 'iphone', 'oled', 'black', 'amoled', 'modern'],
  },
  {
    id: 'prism',
    hidden: true,
    name: 'Prism',
    hint: 'Frosted glass over soft colour light.',
    group: 'glass',
    scheme: 'dark',
    title: true,
    ambient: 'blobs',
    press: 'sheen',
    synonyms: ['glass', 'liquid glass', 'frosted', 'translucent', 'shiny', 'blur'],
  },
  {
    id: 'tidewater',
    name: 'Tidewater',
    hint: 'Clear sea glass with a ripple on every tap.',
    group: 'glass',
    scheme: 'dark',
    title: true,
    ambient: 'caustics',
    press: 'ripple',
    synonyms: ['water', 'sea', 'ocean', 'wave', 'ripple', 'aqua', 'transparent'],
  },
  {
    id: 'fire',
    hidden: true,
    name: 'Elemental Plane of Fire',
    hint: 'Charcoal and ember orange; the title burns.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'embers',
    synonyms: ['fire', 'flame', 'ember', 'lava', 'efreeti', 'city of brass', 'red', 'orange'],
  },
  {
    id: 'nine-hells',
    hidden: true,
    name: 'Nine Hells',
    hint: 'Blood red and brass under falling ash.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'ash',
    synonyms: ['hell', 'hells', 'avernus', 'baator', 'devil', 'infernal', 'ash', 'brass'],
  },
  {
    id: 'icewind-dale',
    hidden: true,
    name: 'Icewind Dale',
    hint: 'Pale ice on dark slate; frost on the title.',
    group: 'places',
    scheme: 'dark',
    title: true,
    ambient: 'snow',
    synonyms: ['ice', 'snow', 'frost', 'winter', 'cold', 'rime', 'ten towns', 'frozen'],
  },
  {
    id: 'feywild',
    hidden: true,
    name: 'Feywild',
    hint: 'Twilight violet with blossom pink; the title shimmers.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'motes',
    synonyms: ['fey', 'fairy', 'faerie', 'twilight', 'pink', 'whimsy', 'enchanted', 'forest'],
  },
  {
    id: 'shadowfell',
    hidden: true,
    name: 'Shadowfell',
    hint: 'Drained greys; shadow passes over the title.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'wisps',
    synonyms: ['shadow', 'grey', 'gray', 'gloom', 'raven queen', 'despair', 'muted', 'monochrome'],
  },
  {
    id: 'underdark',
    hidden: true,
    name: 'Underdark',
    hint: 'Cave violet lit by faerzress and glowing fungus.',
    group: 'places',
    scheme: 'dark',
    title: true,
    ambient: 'spores',
    synonyms: ['cave', 'caverns', 'drow', 'fungus', 'mushroom', 'faerzress', 'menzoberranzan'],
  },
  {
    id: 'astral-sea',
    hidden: true,
    name: 'Astral Sea',
    hint: 'Silver on deep indigo; stars in the title.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'stars',
    synonyms: ['astral', 'space', 'stars', 'night sky', 'cosmic', 'void', 'spelljammer', 'silver'],
  },
  {
    id: 'mechanus',
    hidden: true,
    name: 'Mechanus',
    hint: 'Brass and steel; a gear ticks by the title.',
    group: 'planes',
    scheme: 'dark',
    title: true,
    ambient: 'gears',
    synonyms: ['gears', 'clockwork', 'brass', 'steel', 'modron', 'order', 'steampunk', 'machine'],
  },
  {
    id: 'barovia',
    hidden: true,
    name: 'Barovia',
    hint: 'Gothic crimson in grey mist; candlelit title.',
    group: 'places',
    scheme: 'dark',
    title: true,
    ambient: 'mist',
    synonyms: ['ravenloft', 'strahd', 'gothic', 'vampire', 'horror', 'mist', 'crimson', 'candle'],
  },
  {
    id: 'mount-celestia',
    hidden: true,
    name: 'Mount Celestia',
    hint: 'Warm white and gold; light shines across the title.',
    group: 'light',
    scheme: 'light',
    title: true,
    ambient: 'rays',
    synonyms: ['celestia', 'heaven', 'holy', 'radiant', 'gold', 'angel', 'light', 'bright'],
  },
] as const satisfies readonly ThemeInfo[];

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

/** Themes people can pick now (hidden ones are being reworked). */
export const VISIBLE_THEMES: readonly ThemeInfo[] = (THEMES as readonly ThemeInfo[]).filter(
  (theme) => !theme.hidden,
);

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((theme) => theme.id === id)!;
}
