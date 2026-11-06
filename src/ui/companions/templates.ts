import type { Companion } from '../../engine/schema';

/** Starting points for the add form. Own-words notes; the player can change every field. */
export interface CompanionTemplate {
  label: string;
  companion: Omit<Companion, 'id'>;
}

export const COMPANION_TEMPLATES: CompanionTemplate[] = [
  {
    label: 'Mastiff',
    companion: {
      name: 'Mastiff',
      type: 'pet',
      kind: 'Medium beast',
      ac: 12,
      maxHp: 5,
      speed: { walk: 40 },
      abilities: { STR: 13, DEX: 14, CON: 12, INT: 3, WIS: 12, CHA: 7 },
      attacks: [
        {
          name: 'Bite',
          bonus: 3,
          damage: { dice: '1d6', bonus: 1, type: 'piercing' },
          range: '5 ft.',
          note: 'Target may be knocked prone (Strength save, DM rules it).',
        },
      ],
      traits: ['Keen hearing and smell.'],
      uses: [],
    },
  },
  {
    label: 'Riding horse',
    companion: {
      name: 'Riding horse',
      type: 'mount',
      kind: 'Large beast',
      ac: 10,
      maxHp: 13,
      speed: { walk: 60 },
      abilities: { STR: 16, DEX: 10, CON: 12, INT: 2, WIS: 11, CHA: 7 },
      attacks: [
        {
          name: 'Hooves',
          bonus: 5,
          damage: { dice: '2d4', bonus: 3, type: 'bludgeoning' },
          range: '5 ft.',
        },
      ],
      traits: ['Carries a rider.'],
      uses: [],
    },
  },
];
