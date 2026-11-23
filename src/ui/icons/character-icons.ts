import { GAME_ICONS, type GameIconId } from './game-icons';

const classIcons: Partial<Record<string, GameIconId>> = {
  barbarian: 'catalog.axe',
  monk: 'catalog.fist',
  ranger: 'catalog.bow',
  rogue: 'catalog.dagger',
  wizard: 'catalog.book',
};

// Reuse the attributed glyphs for subclass motifs. The remaining names have dedicated icons.
const subclassIcons: Record<string, Partial<Record<string, GameIconId>>> = {
  barbarian: {
    'ancestral-guardian': 'school.necromancy',
    beast: 'catalog.dragon',
    'storm-herald': 'school.evocation',
    'totem-warrior': 'catalog.tree',
    'wild-magic': 'catalog.dice',
    zealot: 'catalog.mace',
  },
  bard: {
    creation: 'feature.bard.bardic-inspiration',
    eloquence: 'spell.suggestion',
    glamour: 'spell.faerie-fire',
    swords: 'catalog.sword',
    valor: 'catalog.shield',
    whispers: 'spell.dissonant-whispers',
  },
  cleric: {
    forge: 'catalog.hammer',
    grave: 'school.necromancy',
    knowledge: 'catalog.book',
    light: 'catalog.lantern',
    nature: 'class.druid',
    order: 'catalog.medal',
    peace: 'catalog.heart',
    tempest: 'school.evocation',
    trickery: 'catalog.mask',
    war: 'class.fighter',
  },
  druid: {
    dreams: 'spell.minor-illusion',
    moon: 'catalog.moon',
    shepherd: 'catalog.horse',
    spores: 'school.necromancy',
    stars: 'school.divination',
    wildfire: 'catalog.fire',
  },
  fighter: {
    'arcane-archer': 'catalog.arrow',
    'battle-master': 'catalog.sword',
    'eldritch-knight': 'catalog.wand',
    'rune-knight': 'catalog.hammer',
    samurai: 'catalog.rapier',
  },
  monk: {
    'astral-self': 'class.monk',
    'drunken-master': 'catalog.potion',
    'four-elements': 'school.transmutation',
    kensei: 'catalog.sword',
    mercy: 'spell.healing-word',
    shadow: 'spell.invisibility',
    'sun-soul': 'catalog.fire',
  },
  paladin: {
    ancients: 'catalog.tree',
    conquest: 'catalog.helmet',
    glory: 'catalog.medal',
    oathbreaker: 'school.necromancy',
    redemption: 'catalog.heart',
    vengeance: 'catalog.sword',
    watchers: 'catalog.eye',
  },
  ranger: {
    'beast-master': 'catalog.horse',
    'fey-wanderer': 'spell.faerie-fire',
    'horizon-walker': 'school.conjuration',
    'monster-slayer': 'catalog.spear',
    swarmkeeper: 'spell.minor-illusion',
  },
  rogue: {
    'arcane-trickster': 'catalog.wand',
    assassin: 'school.necromancy',
    inquisitive: 'catalog.eye',
    mastermind: 'catalog.mask',
    phantom: 'spell.invisibility',
    scout: 'catalog.target',
    soulknife: 'subclass.fighter.psi-warrior',
    swashbuckler: 'catalog.rapier',
  },
  sorcerer: {
    'aberrant-mind': 'subclass.fighter.psi-warrior',
    'clockwork-soul': 'class.artificer',
    'divine-soul': 'class.cleric',
    'shadow-magic': 'catalog.moon',
    'storm-sorcery': 'school.evocation',
    'wild-magic': 'catalog.dice',
  },
  warlock: {
    archfey: 'spell.faerie-fire',
    celestial: 'spell.healing-word',
    fathomless: 'catalog.net',
    genie: 'catalog.orb',
    'great-old-one': 'catalog.eye',
    hexblade: 'catalog.sword',
  },
  wizard: {
    abjuration: 'school.abjuration',
    bladesinging: 'catalog.rapier',
    conjuration: 'school.conjuration',
    divination: 'school.divination',
    enchantment: 'school.enchantment',
    illusion: 'school.illusion',
    necromancy: 'school.necromancy',
    'order-of-scribes': 'catalog.scroll',
    transmutation: 'school.transmutation',
  },
};

/** Identity glyphs for selection cards, Compendium and portrait fallbacks. */
export function iconGlyph(id: string, fallback?: string): GameIconId | undefined {
  const [kind, className, subclass] = id.split('.');
  const subclasses =
    className && Object.hasOwn(subclassIcons, className) ? subclassIcons[className] : undefined;
  const identity =
    kind === 'class' && className && Object.hasOwn(classIcons, className)
      ? classIcons[className]
      : kind === 'subclass' && subclasses && subclass && Object.hasOwn(subclasses, subclass)
        ? subclasses[subclass]
        : undefined;
  if (identity) return identity;
  if (Object.hasOwn(GAME_ICONS, id)) return id as GameIconId;
  if (fallback && fallback !== id) return iconGlyph(fallback);
  if (kind === 'subclass' && className) return iconGlyph(`class.${className}`);
  return undefined;
}
