import type { DamageType } from '../rules2014';
import type { Ability } from './abilities';
import type { CharacterFeature } from './features';

/** The breath weapon a Dragonborn's ancestry pick sets up, with its numbers resolved. */
export interface BreathWeapon {
  featureId: string;
  dc: number;
  save: Ability;
  area: string;
  type: DamageType;
  dice: string;
}

/** The picked draconic ancestry: the Dragonborn race pick or the Draconic Sorcerer's Dragon Ancestor. */
export function ancestryPick(features: readonly CharacterFeature[], origin: 'race' | 'subclass') {
  return features.find(({ def }) => def.ancestry && def.origin === origin)?.def.ancestry;
}

/** Elemental Affinity's bonus for a spell of this damage type, when it matches the ancestry. */
export function elementalAffinity(
  features: readonly CharacterFeature[],
  mods: Record<Ability, number>,
  type: DamageType,
): { name: string; bonus: number } | undefined {
  const feature = features.find(({ def }) => def.affinity);
  if (!feature?.def.affinity || ancestryPick(features, 'subclass')?.type !== type) return undefined;
  return { name: feature.def.name, bonus: mods[feature.def.affinity.ability] };
}

/** PHB 2014 Dragonborn: DC 8 + CON + proficiency; area, save and type follow the ancestry. */
export function breathWeapon(
  features: readonly CharacterFeature[],
  mods: Record<Ability, number>,
  proficiency: number,
): BreathWeapon | undefined {
  const feature = features.find(({ def }) => def.breath);
  const pick = ancestryPick(features, 'race');
  if (!feature?.def.breath || !pick?.save || !pick.area || !feature.dice) return undefined;
  return {
    featureId: feature.def.id,
    dc: 8 + mods[feature.def.breath.ability] + proficiency,
    save: pick.save,
    area: pick.area,
    type: pick.type,
    dice: feature.dice,
  };
}
