/**
 * Static display data for the M1 key frames. Values are hard-coded here, not computed.
 * M2+ replaces this with engine output. Mid-combat example state, not the seed state.
 */

import type { SpellType } from '../spellTypes';

export type Cost = 'A' | 'BA' | 'R' | `${number} min` | `${number} h`;

export interface SpellView {
  id: string;
  name: string;
  level: number;
  school: string;
  cost: Cost;
  range: string;
  save?: string;
  attack?: 'melee' | 'ranged';
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string;
  source: string;
  lines: string[];
  url: string;
  /** Main type: sets the row color. Always the first tag. */
  type: SpellType;
  tags: SpellType[];
}

export interface AttackView {
  id: string;
  name: string;
  toHit: number;
  damage: string;
  damageType: string;
  notes: string;
}

export interface FeatureView {
  id: string;
  name: string;
  cost: Cost | 'Passive' | 'Rest';
  uses?: { max: number; used: number; die: string; recharge: string };
  lines: string[];
}

export const fool = {
  name: 'The Fool',
  classLine: 'Bard 3 (Lore)',
  iconId: 'character.the-fool',
  hp: { current: 15, max: 19, temp: 0 },
  ac: 13,
  initiative: 3,
  speed: 30,
  spellDc: 15,
  spellAttack: 7,
  abilities: [
    { key: 'STR', mod: 0 },
    { key: 'DEX', mod: 2 },
    { key: 'CON', mod: 1 },
    { key: 'INT', mod: 1 },
    { key: 'WIS', mod: 1 },
    { key: 'CHA', mod: 5 },
  ],
  slots: [
    { level: 1, max: 4, used: 1 },
    { level: 2, max: 2, used: 1 },
  ],
  bardicInspiration: { max: 5, used: 1, die: 'd6' },
  hitDice: { die: 'd8', max: 3, spent: 0 },
  /** A spell you keep up. Faerie Fire affects enemies, so it is not an effect on you. */
  concentration: {
    id: 'spell.faerie-fire',
    name: 'Faerie Fire',
    short: 'FF',
    remaining: '7 rd',
    note: 'Targets that failed the save are outlined.',
  },
  /** Effects on you (buffs, debuffs). None in this sample state. */
  effects: [] as { id: string; name: string; remaining: string }[],
  combat: {
    round: 3,
    yourTurn: true,
    economy: { action: false, bonus: true, reaction: true },
    movementUsed: 15,
  },
  log: [
    { id: 'e5', round: 3, text: 'Cast Vicious Mockery' },
    { id: 'e4', round: 2, text: 'Cutting Words (Bardic Inspiration 5 → 4)' },
    { id: 'e3', round: 2, text: 'Took 4 damage (HP 19 → 15)' },
    { id: 'e2', round: 1, text: 'Cast Faerie Fire (L1 slot)' },
    { id: 'e1', round: 1, text: 'Combat started' },
  ],
} as const;

export const attacks: AttackView[] = [
  {
    id: 'item.rapier',
    name: 'Rapier',
    toHit: 4,
    damage: '1d8+2',
    damageType: 'P',
    notes: 'Finesse',
  },
  {
    id: 'item.dagger',
    name: 'Dagger',
    toHit: 4,
    damage: '1d4+2',
    damageType: 'P',
    notes: 'Finesse, light, thrown 20/60',
  },
];

/** 2014 standard actions, own-words summaries. All cost an action except where noted. */
export const standardActions: { name: string; lines: string[] }[] = [
  { name: 'Dash', lines: ['Gain extra movement equal to your speed for this turn.'] },
  {
    name: 'Disengage',
    lines: ["Your movement doesn't provoke opportunity attacks for the rest of this turn."],
  },
  {
    name: 'Dodge',
    lines: [
      'Until your next turn: attacks against you have disadvantage if you can see the attacker, and you have advantage on DEX saves.',
      'Ends early if you are incapacitated or your speed drops to 0.',
    ],
  },
  {
    name: 'Help',
    lines: [
      'An ally gets advantage on its next check for the task you help with, or on its next attack against a creature within 5 ft of you. Lasts until your next turn.',
    ],
  },
  { name: 'Hide', lines: ['Make a DEX (Stealth) check to hide. You must be out of sight.'] },
  {
    name: 'Ready',
    lines: [
      'Pick a trigger and a response (an action or a move). When it happens, use your reaction.',
      'A readied spell is cast now, needs concentration, and spends the slot even if never released.',
    ],
  },
  {
    name: 'Search',
    lines: ['Look for something: WIS (Perception) or INT (Investigation) check.'],
  },
  {
    name: 'Use Object',
    lines: ['Use an object that needs an action, or interact with a second object this turn.'],
  },
  {
    name: 'Grapple',
    lines: [
      'Replaces one attack. Your Athletics vs its Athletics or Acrobatics. Target at most one size larger.',
      'Success: grappled (speed 0).',
    ],
  },
  {
    name: 'Shove',
    lines: [
      'Replaces one attack. Your Athletics vs its Athletics or Acrobatics. Target at most one size larger.',
      'Success: knock it prone or push it 5 ft away.',
    ],
  },
];

export const items: { id: string; name: string; qty: number; lines: string[] }[] = [
  {
    id: 'item.disguise-kit',
    name: 'Disguise kit',
    qty: 2,
    lines: ["Nobleman's elegant suit; brown bear costume (looks very real)."],
  },
  {
    id: 'item.deck-of-marked-cards',
    name: 'Deck of marked cards',
    qty: 1,
    lines: ['Charlatan con tool.'],
  },
  { id: 'item.candle', name: 'Candle', qty: 5, lines: ['Bright light 5 ft, dim 5 ft more, 1 h.'] },
];

const DDB = 'https://www.dndbeyond.com/spells/';

export const spells: SpellView[] = [
  {
    id: 'spell.vicious-mockery',
    name: 'Vicious Mockery',
    level: 0,
    school: 'Enchantment',
    cost: 'A',
    range: '60 ft',
    save: 'WIS',
    duration: 'Instant',
    concentration: false,
    ritual: false,
    components: 'V',
    source: 'PHB',
    lines: [
      'Fail: 1d4 psychic and disadvantage on its next attack roll before the end of its next turn. Success: nothing.',
      'Scaling: 2d4 at character level 5, 3d4 at 11, 4d4 at 17.',
    ],
    url: `${DDB}vicious-mockery`,
    type: 'damage',
    tags: ['damage', 'debuff'],
  },
  {
    id: 'spell.minor-illusion',
    name: 'Minor Illusion',
    level: 0,
    school: 'Illusion',
    cost: 'A',
    range: '30 ft',
    duration: '1 min',
    concentration: false,
    ritual: false,
    components: 'S, M',
    source: 'PHB',
    lines: [
      'Create one sound or one image of an object (fits in a 5-ft cube). Image has no sound, light, or smell; physical touch reveals it.',
      'Investigation vs DC 15 to discern.',
    ],
    url: `${DDB}minor-illusion`,
    type: 'utility',
    tags: ['utility'],
  },
  {
    id: 'spell.healing-word',
    name: 'Healing Word',
    level: 1,
    school: 'Evocation',
    cost: 'BA',
    range: '60 ft',
    duration: 'Instant',
    concentration: false,
    ritual: false,
    components: 'V',
    source: 'PHB',
    lines: [
      'One creature you can see regains 1d4 + 5 HP. No effect on undead or constructs.',
      'Upcast: +1d4 per slot level above 1.',
    ],
    url: `${DDB}healing-word`,
    type: 'healing',
    tags: ['healing'],
  },
  {
    id: 'spell.dissonant-whispers',
    name: 'Dissonant Whispers',
    level: 1,
    school: 'Enchantment',
    cost: 'A',
    range: '60 ft',
    save: 'WIS',
    duration: 'Instant',
    concentration: false,
    ritual: false,
    components: 'V',
    source: 'PHB',
    lines: [
      'Fail: 3d6 psychic; target must use its reaction (if available) to move its speed away from you. Success: half damage, no movement.',
      'Upcast: +1d6 per slot level above 1.',
    ],
    url: `${DDB}dissonant-whispers`,
    type: 'damage',
    tags: ['damage', 'control'],
  },
  {
    id: 'spell.faerie-fire',
    name: 'Faerie Fire',
    level: 1,
    school: 'Evocation',
    cost: 'A',
    range: '60 ft',
    save: 'DEX',
    duration: '1 min',
    concentration: true,
    ritual: false,
    components: 'V',
    source: 'PHB',
    lines: [
      '20-ft cube. Fail: outlined in light (dim light 10 ft).',
      "Attacks vs it have advantage if the attacker can see it; it can't benefit from invisible.",
    ],
    url: `${DDB}faerie-fire`,
    type: 'debuff',
    tags: ['debuff', 'utility'],
  },
  {
    id: 'spell.disguise-self',
    name: 'Disguise Self',
    level: 1,
    school: 'Illusion',
    cost: 'A',
    range: 'Self',
    duration: '1 h',
    concentration: false,
    ritual: false,
    components: 'V, S',
    source: 'PHB',
    lines: [
      'Change your look, clothes, and gear; ±1 ft height. Body type stays. Touch reveals it.',
      'Investigation vs DC 15 to discern.',
    ],
    url: `${DDB}disguise-self`,
    type: 'utility',
    tags: ['utility'],
  },
  {
    id: 'spell.suggestion',
    name: 'Suggestion',
    level: 2,
    school: 'Enchantment',
    cost: 'A',
    range: '30 ft',
    save: 'WIS',
    duration: '8 h',
    concentration: true,
    ritual: false,
    components: 'V, M',
    source: 'PHB',
    lines: [
      'Target that hears and understands you follows a reasonable-sounding course of action. Fail: it obeys until done or the spell ends.',
      "Immune if it can't be charmed. Obviously harmful requests end the spell.",
    ],
    url: `${DDB}suggestion`,
    type: 'control',
    tags: ['control'],
  },
  {
    id: 'spell.invisibility',
    name: 'Invisibility',
    level: 2,
    school: 'Illusion',
    cost: 'A',
    range: 'Touch',
    duration: '1 h',
    concentration: true,
    ritual: false,
    components: 'V, S, M',
    source: 'PHB',
    lines: [
      'Target and what it carries become invisible. Ends for a target when it attacks or casts a spell.',
      'Upcast: +1 target per slot level above 2.',
    ],
    url: `${DDB}invisibility`,
    type: 'buff',
    tags: ['buff', 'utility'],
  },
];

export const features: FeatureView[] = [
  {
    id: 'feature.bard.bardic-inspiration',
    name: 'Bardic Inspiration',
    cost: 'BA',
    uses: { max: 5, used: 1, die: 'd6', recharge: 'Long rest' },
    lines: [
      'Creature within 60 ft that can hear you gets a d6. Within 10 min it adds it to one attack, check, or save.',
    ],
  },
  {
    id: 'feature.bard.cutting-words',
    name: 'Cutting Words',
    cost: 'R',
    uses: { max: 5, used: 1, die: 'd6', recharge: 'Uses Bardic Inspiration' },
    lines: [
      'Creature within 60 ft you can see makes an attack, check, or damage roll: subtract your d6.',
      "Use after the roll, before the result. Immune if it can't hear you or can't be charmed.",
    ],
  },
];
