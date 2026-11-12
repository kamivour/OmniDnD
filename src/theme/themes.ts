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
] as const satisfies readonly ThemeInfo[];

export type ThemeId = (typeof THEMES)[number]['id'];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((theme) => theme.id);

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((theme) => theme.id === id)!;
}
