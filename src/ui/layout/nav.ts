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
  /** Journal, Reference and Settings sit below the divider (M44). */
  secondary?: true;
}

/** Character screens in sidebar order: main screens, a divider, then secondary screens (M44 T2). */
export const NAV: NavItem[] = [
  { to: '', label: 'Home', short: 'Home', icon: House },
  { to: 'sheet', label: 'Sheet', short: 'Sheet', icon: ScrollText },
  { to: 'spells', label: 'Spells', short: 'Spells', icon: Sparkles },
  { to: 'combat', label: 'Combat', short: 'Combat', icon: Swords },
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
  { to: 'explore', label: 'Explore', short: 'Explore', icon: Compass },
  {
    to: 'journal',
    label: 'Journal',
    short: 'Journal',
    icon: BookOpen,
    milestone: 'M12',
    phase: 2,
    secondary: true,
  },
  {
    to: 'reference',
    label: 'Reference',
    short: 'Ref',
    icon: Library,
    milestone: 'M3',
    secondary: true,
  },
  {
    to: 'settings',
    label: 'Settings',
    short: 'Settings',
    icon: Settings,
    milestone: 'M3',
    secondary: true,
  },
];

/** The two labelled groups shared by the sidebar and the phone More sheet. */
export const NAV_GROUPS = [
  { label: 'Main screens', secondary: false },
  { label: 'Other screens', secondary: true },
] as const;

/** Items of one group, keeping NAV order. */
export function navGroup(items: NavItem[], secondary: boolean): NavItem[] {
  return items.filter((n) => Boolean(n.secondary) === secondary);
}

/** Mobile bottom nav: five direct links in this order + More (D232). */
export const BOTTOM_NAV = ['', 'sheet', 'spells', 'inventory', 'combat'];

/** Full path of a character screen. */
export function navPath(base: string, to: string): string {
  return to ? `${base}/${to}` : base;
}
