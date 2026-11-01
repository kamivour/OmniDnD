import {
  Backpack,
  BookOpen,
  Compass,
  House,
  Library,
  PawPrint,
  ScrollText,
  Settings,
  Sparkles,
  Star,
  Swords,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** Path segment under the character base (`/characters/:characterId`). '' = Home. */
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  /** Milestone that builds the real screen. Undefined = built (key frame). */
  milestone?: string;
  phase?: 2 | 3 | 4;
}

/** Character screens in sidebar order (DESIGN.md Frame A). The divider sits before Inventory. */
export const NAV: NavItem[] = [
  { to: '', label: 'Home', short: 'Home', icon: House },
  { to: 'sheet', label: 'Sheet', short: 'Sheet', icon: ScrollText, milestone: 'M7' },
  { to: 'spells', label: 'Spells', short: 'Spells', icon: Sparkles },
  { to: 'combat', label: 'Combat', short: 'Combat', icon: Swords },
  { to: 'explore', label: 'Explore', short: 'Explore', icon: Compass, milestone: 'M7' },
  { to: 'inventory', label: 'Inventory', short: 'Inv', icon: Backpack, milestone: 'M9', phase: 2 },
  { to: 'features', label: 'Features', short: 'Features', icon: Star, milestone: 'M9', phase: 2 },
  {
    to: 'companions',
    label: 'Companions',
    short: 'Companions',
    icon: PawPrint,
    milestone: 'M12',
    phase: 2,
  },
  { to: 'journal', label: 'Journal', short: 'Journal', icon: BookOpen, milestone: 'M12', phase: 2 },
  { to: 'reference', label: 'Reference', short: 'Ref', icon: Library, milestone: 'M3' },
  { to: 'settings', label: 'Settings', short: 'Settings', icon: Settings, milestone: 'M3' },
];

export const NAV_DIVIDER_BEFORE = 'inventory';

/** Mobile bottom nav: four direct links in this order + More. */
export const BOTTOM_NAV = ['', 'combat', 'spells', 'inventory'];

/** Full path of a character screen. */
export function navPath(base: string, to: string): string {
  return to ? `${base}/${to}` : base;
}
