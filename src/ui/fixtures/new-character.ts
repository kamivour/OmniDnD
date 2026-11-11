/**
 * PHB 2014 name lists for the static New Character frame. M2 loads races, classes, and
 * backgrounds (with their mechanics) from the data layer instead.
 */
import type { HitDie } from '../../engine/calc/hp';

export const RACES = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Halfling',
  'Human',
  'Tiefling',
];

export const CLASSES: { name: string; die: HitDie }[] = [
  { name: 'Barbarian', die: 12 },
  { name: 'Bard', die: 8 },
  { name: 'Cleric', die: 8 },
  { name: 'Druid', die: 8 },
  { name: 'Fighter', die: 10 },
  { name: 'Monk', die: 8 },
  { name: 'Paladin', die: 10 },
  { name: 'Ranger', die: 10 },
  { name: 'Rogue', die: 8 },
  { name: 'Sorcerer', die: 6 },
  { name: 'Warlock', die: 8 },
  { name: 'Wizard', die: 6 },
];

export const BACKGROUNDS = [
  'Acolyte',
  'Charlatan',
  'Criminal',
  'Entertainer',
  'Folk Hero',
  'Guild Artisan',
  'Hermit',
  'Noble',
  'Outlander',
  'Sage',
  'Sailor',
  'Soldier',
  'Urchin',
];

export const ALIGNMENTS = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
];

/** Characters saved before the list said True Neutral still read "Neutral". */
export function alignmentLabel(alignment: string): string {
  return alignment === 'Neutral' ? 'True Neutral' : alignment;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
