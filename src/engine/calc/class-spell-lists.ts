import type { Campaign, SpellDef } from '../schema';
import { bookParts, optionalRules } from './campaign-rules';

// Tasha's Additional Class Spells. Keep these separate from PHB lists and subclass grants.
const BLADE_CANTRIPS = 'booming-blade green-flame-blade lightning-lure mind-sliver sword-burst';
const SHARED_ARCANE = `${BLADE_CANTRIPS} intellect-fortress tashas-otherworldly-guise dream-of-the-blue-veil blade-of-disaster`;
const SUMMONS =
  'spirit-shroud summon-fey summon-shadowspawn summon-undead summon-aberration summon-fiend';
const OPTIONAL_SPELLS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries({
    bard: 'color-spray command aid enlarge-reduce mirror-image intellect-fortress mass-healing-word slow phantasmal-killer telepathic-bond heroes-feast dream-of-the-blue-veil prismatic-spray antipathy-sympathy prismatic-wall',
    cleric:
      'aura-of-vitality spirit-shroud aura-of-life aura-of-purity summon-celestial sunbeam sunburst power-word-heal',
    druid:
      'protection-from-evil-and-good augury continual-flame enlarge-reduce summon-beast aura-of-vitality elemental-weapon revivify summon-fey divination fire-shield summon-elemental cone-of-cold flesh-to-stone symbol incendiary-cloud',
    paladin: 'gentle-repose prayer-of-healing warding-bond spirit-shroud summon-celestial',
    ranger:
      'entangle searing-smite aid enhance-ability gust-of-wind magic-weapon summon-beast elemental-weapon meld-into-stone revivify summon-fey dominate-beast summon-elemental greater-restoration',
    sorcerer: `${SHARED_ARCANE} caustic-brew tashas-mind-whip grease flame-blade flaming-sphere magic-weapon vampiric-touch fire-shield arcane-hand flesh-to-stone freezing-sphere demiplane`,
    warlock: `${SHARED_ARCANE} ${SUMMONS} mislead planar-binding teleportation-circle gate weird`,
    wizard: `${SHARED_ARCANE} ${SUMMONS} caustic-brew tashas-mind-whip augury enhance-ability speak-with-dead divination summon-construct summon-elemental`,
  }).map(([className, spells]) => [
    `class.${className}`,
    new Set(spells.split(' ').map((id) => `spell.${id}`)),
  ]),
);

export type SpellListCampaign = Pick<Campaign, 'sources' | 'sourceParts' | 'optionalRules'>;

export function classSpellAllows(campaign: SpellListCampaign, classId: string, spell: SpellDef) {
  if (OPTIONAL_SPELLS[classId]?.has(spell.id))
    return (
      bookParts(campaign, 'TCE').includes('options') &&
      optionalRules(campaign).optionalClassFeatures
    );
  return spell.classes.includes(classId);
}

/** Optional memberships shown separately from the base spell lists in the Compendium. */
export function optionalTashaSpellClasses(spell: SpellDef): string[] {
  return Object.keys(OPTIONAL_SPELLS).filter((classId) => OPTIONAL_SPELLS[classId]!.has(spell.id));
}
