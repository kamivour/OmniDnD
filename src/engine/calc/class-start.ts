import type { Registry } from '../registry';
import type { Skill } from '../rules2014';

/** PHB 2014 (Artificer: TCE): what a level 1 character of a class starts with. Labels are in our own words. */
export interface ClassStart {
  skills: { count: number; from: 'any' | Skill[] };
  armor: ('light' | 'medium' | 'heavy' | 'shield')[];
  /** `simple`, `martial`, or an item id. */
  weapons: string[];
  /** Tool item ids. */
  tools: string[];
  /** Musical instruments the class lets you pick. */
  instruments: number;
  equipment: EquipmentStep[];
  /** Average starting gold when the player takes gold instead of the kit. */
  goldInstead: string;
}

export type ItemSlot =
  | 'simple-weapon'
  | 'simple-melee'
  | 'martial-weapon'
  | 'martial-melee'
  | 'holy-symbol'
  | 'druidic-focus'
  | 'arcane-focus'
  | 'instrument';

export interface StartItem {
  /** A fixed catalogue item. */
  itemId?: string;
  /** Or a slot the player fills with one catalogue item. */
  slot?: ItemSlot;
  /** Pieces; defaults to 1. */
  quantity?: number;
}

export interface EquipmentStep {
  label: string;
  /** One option means a fixed grant; several mean the player picks one. */
  options: { label: string; items: StartItem[] }[];
}

const item = (id: string, quantity?: number): StartItem => ({
  itemId: `item.${id}`,
  ...(quantity !== undefined && { quantity }),
});
const slot = (kind: ItemSlot): StartItem => ({ slot: kind });
const fixed = (label: string, ...items: StartItem[]): EquipmentStep => ({
  label,
  options: [{ label, items }],
});
const choose = (label: string, ...options: [string, ...StartItem[]][]): EquipmentStep => ({
  label,
  options: options.map(([name, ...items]) => ({ label: name, items })),
});

const PACK_NAMES: Record<string, string> = {
  'explorers-pack': "Explorer's pack",
  'dungeoneers-pack': "Dungeoneer's pack",
  'priests-pack': "Priest's pack",
  'scholars-pack': "Scholar's pack",
  'burglars-pack': "Burglar's pack",
  'diplomats-pack': "Diplomat's pack",
  'entertainers-pack': "Entertainer's pack",
};
const packs = (...ids: string[]) =>
  choose('Pack', ...ids.map((id): [string, StartItem] => [PACK_NAMES[id]!, item(id)]));
const lightCrossbow = (): [string, ...StartItem[]] => [
  'Light crossbow and 20 bolts',
  item('crossbow-light'),
  item('crossbow-bolt', 20),
];
const focusOrPouch = (): EquipmentStep =>
  choose(
    'Casting tool',
    ['Component pouch', item('component-pouch')],
    ['Arcane focus', slot('arcane-focus')],
  );

export const CLASS_START: Record<string, ClassStart> = {
  'class.artificer': {
    skills: {
      count: 2,
      from: [
        'arcana',
        'history',
        'investigation',
        'medicine',
        'nature',
        'perception',
        'sleight-of-hand',
      ],
    },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple'],
    tools: ['item.thieves-tools', 'item.tinkers-tools'],
    instruments: 0,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose(
        'Weapons',
        ['Any two simple weapons', slot('simple-weapon'), slot('simple-weapon')],
        lightCrossbow(),
      ),
      choose(
        'Armor',
        ['Studded leather armor', item('studded-leather-armor')],
        ['Scale mail', item('scale-mail')],
      ),
      fixed(
        "Thieves' tools and a Dungeoneer's pack",
        item('thieves-tools'),
        item('dungeoneers-pack'),
      ),
    ],
  },
  'class.barbarian': {
    skills: {
      count: 2,
      from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    instruments: 0,
    goldInstead: '2d4 × 10 gp',
    equipment: [
      choose(
        'Main weapon',
        ['Greataxe', item('greataxe')],
        ['Any martial melee weapon', slot('martial-melee')],
      ),
      choose(
        'Second weapon',
        ['Two handaxes', item('handaxe', 2)],
        ['Any simple weapon', slot('simple-weapon')],
      ),
      fixed("Explorer's pack and four javelins", item('explorers-pack'), item('javelin', 4)),
    ],
  },
  'class.bard': {
    skills: { count: 3, from: 'any' },
    armor: ['light'],
    weapons: ['simple', 'item.crossbow-hand', 'item.longsword', 'item.rapier', 'item.shortsword'],
    tools: [],
    instruments: 3,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose(
        'Weapon',
        ['Rapier', item('rapier')],
        ['Longsword', item('longsword')],
        ['Any simple weapon', slot('simple-weapon')],
      ),
      packs('diplomats-pack', 'entertainers-pack'),
      choose('Instrument', ['Lute', item('lute')], ['Another instrument', slot('instrument')]),
      fixed('Leather armor and a dagger', item('leather-armor'), item('dagger')),
    ],
  },
  'class.cleric': {
    skills: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple'],
    tools: [],
    instruments: 0,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose('Weapon', ['Mace', item('mace')], ['Warhammer', item('warhammer')]),
      choose(
        'Armor',
        ['Scale mail', item('scale-mail')],
        ['Leather armor', item('leather-armor')],
        ['Chain mail', item('chain-mail')],
      ),
      choose('Ranged option', lightCrossbow(), ['Any simple weapon', slot('simple-weapon')]),
      packs('priests-pack', 'explorers-pack'),
      fixed('Shield and a holy symbol', item('shield'), slot('holy-symbol')),
    ],
  },
  'class.druid': {
    skills: {
      count: 2,
      from: [
        'arcana',
        'animal-handling',
        'insight',
        'medicine',
        'nature',
        'perception',
        'religion',
        'survival',
      ],
    },
    armor: ['light', 'medium', 'shield'],
    weapons: [
      'item.club',
      'item.dagger',
      'item.dart',
      'item.javelin',
      'item.mace',
      'item.quarterstaff',
      'item.scimitar',
      'item.sickle',
      'item.sling',
      'item.spear',
    ],
    tools: ['item.herbalism-kit'],
    instruments: 0,
    goldInstead: '2d4 × 10 gp',
    equipment: [
      choose(
        'Shield or weapon',
        ['Shield', item('shield')],
        ['Any simple weapon', slot('simple-weapon')],
      ),
      choose(
        'Melee weapon',
        ['Scimitar', item('scimitar')],
        ['Any simple melee weapon', slot('simple-melee')],
      ),
      fixed(
        "Leather armor, Explorer's pack and a druidic focus",
        item('leather-armor'),
        item('explorers-pack'),
        slot('druidic-focus'),
      ),
    ],
  },
  'class.fighter': {
    skills: {
      count: 2,
      from: [
        'acrobatics',
        'animal-handling',
        'athletics',
        'history',
        'insight',
        'intimidation',
        'perception',
        'survival',
      ],
    },
    armor: ['light', 'medium', 'heavy', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    instruments: 0,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose(
        'Armor',
        ['Chain mail', item('chain-mail')],
        [
          'Leather armor, longbow and 20 arrows',
          item('leather-armor'),
          item('longbow'),
          item('arrow', 20),
        ],
      ),
      choose(
        'Weapons',
        ['A martial weapon and a shield', slot('martial-weapon'), item('shield')],
        ['Two martial weapons', slot('martial-weapon'), slot('martial-weapon')],
      ),
      choose('Ranged option', lightCrossbow(), ['Two handaxes', item('handaxe', 2)]),
      packs('dungeoneers-pack', 'explorers-pack'),
    ],
  },
  'class.monk': {
    skills: {
      count: 2,
      from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    },
    armor: [],
    weapons: ['simple', 'item.shortsword'],
    tools: [],
    instruments: 0,
    goldInstead: '5d4 gp',
    equipment: [
      choose(
        'Weapon',
        ['Shortsword', item('shortsword')],
        ['Any simple weapon', slot('simple-weapon')],
      ),
      packs('dungeoneers-pack', 'explorers-pack'),
      fixed('Ten darts', item('dart', 10)),
    ],
  },
  'class.paladin': {
    skills: {
      count: 2,
      from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    },
    armor: ['light', 'medium', 'heavy', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    instruments: 0,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose(
        'Weapons',
        ['A martial weapon and a shield', slot('martial-weapon'), item('shield')],
        ['Two martial weapons', slot('martial-weapon'), slot('martial-weapon')],
      ),
      choose(
        'Second weapon',
        ['Five javelins', item('javelin', 5)],
        ['Any simple melee weapon', slot('simple-melee')],
      ),
      packs('priests-pack', 'explorers-pack'),
      fixed('Chain mail and a holy symbol', item('chain-mail'), slot('holy-symbol')),
    ],
  },
  'class.ranger': {
    skills: {
      count: 3,
      from: [
        'animal-handling',
        'athletics',
        'insight',
        'investigation',
        'nature',
        'perception',
        'stealth',
        'survival',
      ],
    },
    armor: ['light', 'medium', 'shield'],
    weapons: ['simple', 'martial'],
    tools: [],
    instruments: 0,
    goldInstead: '5d4 × 10 gp',
    equipment: [
      choose('Armor', ['Scale mail', item('scale-mail')], ['Leather armor', item('leather-armor')]),
      choose(
        'Weapons',
        ['Two shortswords', item('shortsword', 2)],
        ['Two simple melee weapons', slot('simple-melee'), slot('simple-melee')],
      ),
      packs('dungeoneers-pack', 'explorers-pack'),
      fixed('Longbow and 20 arrows', item('longbow'), item('arrow', 20)),
    ],
  },
  'class.rogue': {
    skills: {
      count: 4,
      from: [
        'acrobatics',
        'athletics',
        'deception',
        'insight',
        'intimidation',
        'investigation',
        'perception',
        'performance',
        'persuasion',
        'sleight-of-hand',
        'stealth',
      ],
    },
    armor: ['light'],
    weapons: ['simple', 'item.crossbow-hand', 'item.longsword', 'item.rapier', 'item.shortsword'],
    tools: ['item.thieves-tools'],
    instruments: 0,
    goldInstead: '4d4 × 10 gp',
    equipment: [
      choose('Weapon', ['Rapier', item('rapier')], ['Shortsword', item('shortsword')]),
      choose(
        'Second weapon',
        ['Shortbow and 20 arrows', item('shortbow'), item('arrow', 20)],
        ['Shortsword', item('shortsword')],
      ),
      packs('burglars-pack', 'dungeoneers-pack', 'explorers-pack'),
      fixed(
        "Leather armor, two daggers and thieves' tools",
        item('leather-armor'),
        item('dagger', 2),
        item('thieves-tools'),
      ),
    ],
  },
  'class.sorcerer': {
    skills: {
      count: 2,
      from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    },
    armor: [],
    weapons: ['item.dagger', 'item.dart', 'item.sling', 'item.quarterstaff', 'item.crossbow-light'],
    tools: [],
    instruments: 0,
    goldInstead: '3d4 × 10 gp',
    equipment: [
      choose('Weapon', lightCrossbow(), ['Any simple weapon', slot('simple-weapon')]),
      focusOrPouch(),
      packs('dungeoneers-pack', 'explorers-pack'),
      fixed('Two daggers', item('dagger', 2)),
    ],
  },
  'class.warlock': {
    skills: {
      count: 2,
      from: [
        'arcana',
        'deception',
        'history',
        'intimidation',
        'investigation',
        'nature',
        'religion',
      ],
    },
    armor: ['light'],
    weapons: ['simple'],
    tools: [],
    instruments: 0,
    goldInstead: '4d4 × 10 gp',
    equipment: [
      choose('Weapon', lightCrossbow(), ['Any simple weapon', slot('simple-weapon')]),
      focusOrPouch(),
      packs('scholars-pack', 'dungeoneers-pack'),
      fixed(
        'Leather armor, a simple weapon and two daggers',
        item('leather-armor'),
        slot('simple-weapon'),
        item('dagger', 2),
      ),
    ],
  },
  'class.wizard': {
    skills: {
      count: 2,
      from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    },
    armor: [],
    weapons: ['item.dagger', 'item.dart', 'item.sling', 'item.quarterstaff', 'item.crossbow-light'],
    tools: [],
    instruments: 0,
    goldInstead: '4d4 × 10 gp',
    equipment: [
      choose('Weapon', ['Quarterstaff', item('quarterstaff')], ['Dagger', item('dagger')]),
      focusOrPouch(),
      packs('scholars-pack', 'explorers-pack'),
      fixed('Spellbook', item('spellbook')),
    ],
  },
};

export const SLOT_LABELS: Record<ItemSlot, string> = {
  'simple-weapon': 'Simple weapon',
  'simple-melee': 'Simple melee weapon',
  'martial-weapon': 'Martial weapon',
  'martial-melee': 'Martial melee weapon',
  'holy-symbol': 'Holy symbol',
  'druidic-focus': 'Druidic focus',
  'arcane-focus': 'Arcane focus',
  instrument: 'Musical instrument',
};

const FOCUS_IDS: Partial<Record<ItemSlot, string[]>> = {
  'holy-symbol': ['item.amulet', 'item.emblem', 'item.reliquary'],
  'druidic-focus': ['item.sprig-of-mistletoe', 'item.totem', 'item.wooden-staff', 'item.yew-wand'],
  'arcane-focus': ['item.crystal', 'item.orb', 'item.rod', 'item.staff', 'item.wand'],
};

/** Catalogue item ids that can fill a slot. */
export function slotChoices(kind: ItemSlot, registry: Registry): string[] {
  const listed = FOCUS_IDS[kind];
  if (listed) return listed.filter((id) => registry.entries.get(id)?.kind === 'item');
  const ids: string[] = [];
  for (const entry of registry.entries.values()) {
    if (entry.kind !== 'item') continue;
    if (kind === 'instrument') {
      if (entry.category === 'instrument') ids.push(entry.id);
      continue;
    }
    const [category, melee] = kind.split('-') as ['simple' | 'martial', string];
    const weapon = entry.weapon;
    // Magic-item variants are not starting gear.
    if (entry.id.includes('-of-')) continue;
    if (weapon?.category === category && (melee !== 'melee' || weapon.type === 'melee'))
      ids.push(entry.id);
  }
  return ids;
}
