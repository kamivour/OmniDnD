import { GAME_ICONS, type GameIconId } from './game-icons';

const identityIcons: Partial<Record<string, GameIconId>> = {
  'class.barbarian': 'catalog.axe',
  'class.monk': 'catalog.fist',
  'class.ranger': 'catalog.bow',
  'class.rogue': 'catalog.dagger',
  'class.wizard': 'catalog.book',
  'race.custom-lineage': 'catalog.mask',
  'race.dragonborn': 'catalog.dragon',
  'race.drow': 'catalog.moon',
  'race.dwarf': 'catalog.hammer',
  'race.elf': 'catalog.tree',
  'race.forest-gnome': 'spell.faerie-fire',
  'race.gnome': 'catalog.tool',
  'race.half-elf': 'catalog.amulet',
  'race.half-orc': 'catalog.axe',
  'race.halfling': 'catalog.pack',
  'race.high-elf': 'catalog.wand',
  'race.hill-dwarf': 'catalog.mace',
  'race.human': 'catalog.helmet',
  'race.lightfoot-halfling': 'catalog.boots',
  'race.mountain-dwarf': 'catalog.shield',
  'race.rock-gnome': 'class.artificer',
  'race.stout-halfling': 'catalog.food',
  'race.tiefling': 'catalog.fire',
  'race.variant-human': 'catalog.medal',
  'race.wood-elf': 'class.druid',
  'background.acolyte': 'class.cleric',
  'background.charlatan': 'catalog.dice',
  'background.criminal': 'catalog.dagger',
  'background.custom': 'catalog.scroll',
  'background.entertainer': 'catalog.instrument',
  'background.folk-hero': 'catalog.target',
  'background.gladiator': 'catalog.sword',
  'background.guild-artisan': 'catalog.tool',
  'background.guild-merchant': 'catalog.chest',
  'background.hermit': 'catalog.lantern',
  'background.knight': 'catalog.shield',
  'background.noble': 'catalog.medal',
  'background.outlander': 'catalog.tree',
  'background.pirate': 'school.necromancy',
  'background.sage': 'catalog.book',
  'background.sailor': 'catalog.net',
  'background.soldier': 'catalog.helmet',
  'background.spy': 'catalog.mask',
  'background.urchin': 'catalog.cloak',
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
  const identity = Object.hasOwn(identityIcons, id)
    ? identityIcons[id]
    : kind === 'subclass' && subclasses && subclass && Object.hasOwn(subclasses, subclass)
      ? subclasses[subclass]
      : undefined;
  if (identity) return identity;
  if (Object.hasOwn(GAME_ICONS, id)) return id as GameIconId;
  if (fallback && fallback !== id) return iconGlyph(fallback);
  if (kind === 'subclass' && className) return iconGlyph(`class.${className}`);
  return undefined;
}
