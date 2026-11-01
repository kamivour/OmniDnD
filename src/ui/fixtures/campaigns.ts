/**
 * Static campaign list for the M1 hub frame. M3 loads campaigns and characters from storage.
 * A campaign holds the character rules (D14); each character belongs to one campaign.
 */

import type { HpLevelFloor } from '../../engine/calc/hp';

export type Leveling = 'xp' | 'milestone';
export type HpMethod = 'average' | 'rolled';
export type AbilityMethod = 'standard' | 'pointBuy' | 'rolled';

export interface CharacterCardView {
  id: string;
  name: string;
  /** Race · class line. */
  line: string;
  iconId: string;
  hp: { current: number; max: number };
}

export interface CampaignView {
  id: string;
  name: string;
  leveling: Leveling;
  hpMethod: HpMethod;
  hpFloor: HpLevelFloor;
  abilityMethod: AbilityMethod;
  sources: string[];
  characters: CharacterCardView[];
}

export const campaigns: CampaignView[] = [
  {
    id: '273',
    name: 'Campaign #273',
    leveling: 'milestone',
    hpMethod: 'rolled',
    hpFloor: 'none',
    abilityMethod: 'rolled',
    sources: ['PHB', 'XGE', 'TCE'],
    characters: [
      {
        id: 'the-fool',
        name: 'The Fool',
        line: 'Half-Elf · Bard 3 (Lore)',
        iconId: 'character.the-fool',
        hp: { current: 15, max: 19 },
      },
    ],
  },
];

/** Defaults for a new campaign: the plain PHB rules (DECISIONS D40). */
export const newCampaign: CampaignView = {
  id: 'new',
  name: '',
  leveling: 'xp',
  hpMethod: 'average',
  hpFloor: 'none',
  abilityMethod: 'standard',
  sources: ['PHB'],
  characters: [],
};

export function findCampaign(id: string | undefined): CampaignView | undefined {
  return campaigns.find((c) => c.id === id);
}

export function findCharacter(id: string | undefined): CharacterCardView | undefined {
  return campaigns.flatMap((c) => c.characters).find((ch) => ch.id === id);
}
