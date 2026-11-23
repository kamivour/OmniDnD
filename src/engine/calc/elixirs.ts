import type { CharacterFeature } from './features';
import type { Modifier } from '../schema';

export const EXPERIMENTAL_ELIXIR = 'feature.artificer.alchemist-experimental-elixir';
export const RESTORATIVE_REAGENTS = 'feature.artificer.alchemist-restorative-reagents';

export const ELIXIR_RESULTS = [
  'healing',
  'swiftness',
  'resilience',
  'boldness',
  'flight',
  'transformation',
] as const;
export type ElixirResult = (typeof ELIXIR_RESULTS)[number];

export const ELIXIR_DETAILS: Record<
  ElixirResult,
  {
    name: string;
    note: string;
    duration?: number;
    modifiers?: Modifier[];
  }
> = {
  healing: { name: 'Healing', note: 'Regain 2d4 + the Artificer’s INT modifier HP.' },
  swiftness: {
    name: 'Swiftness',
    note: 'Walking speed increases by 10 feet for 1 hour.',
    duration: 3600,
    modifiers: [{ target: 'speed', value: 10 }],
  },
  resilience: {
    name: 'Resilience',
    note: '+1 AC for 10 minutes.',
    duration: 600,
    modifiers: [{ target: 'ac', value: 1 }],
  },
  boldness: {
    name: 'Boldness',
    note: 'Add 1d4 to attack rolls and saves for 1 minute.',
    duration: 60,
  },
  flight: { name: 'Flight', note: 'Gain a flying speed of 10 feet for 10 minutes.', duration: 600 },
  transformation: {
    name: 'Transformation',
    note: 'Choose an Alter Self effect for 10 minutes.',
    duration: 600,
  },
};

export const elixirRestLimit = (features: readonly CharacterFeature[]): number => {
  const level = features.find(({ def }) => def.id === EXPERIMENTAL_ELIXIR)?.level ?? 0;
  return level >= 15 ? 3 : level >= 6 ? 2 : level >= 3 ? 1 : 0;
};
