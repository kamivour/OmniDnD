import { describe, expect, it } from 'vitest';
import { registry } from './registry';

const FEATS = [
  'bountiful-luck',
  'dragon-fear',
  'dragon-hide',
  'drow-high-magic',
  'fey-teleportation',
  'flames-of-phlegethos',
  'infernal-constitution',
  'orcish-fury',
  'prodigy',
  'second-chance',
  'squat-nimbleness',
  'wood-elf-magic',
];

const INVOCATIONS = [
  'aspect-of-the-moon',
  'cloak-of-flies',
  'eldritch-smite',
  'ghostly-gaze',
  'gift-of-the-depths',
  'gift-of-the-everliving-ones',
  'grasp-of-hadar',
  'improved-pact-weapon',
  'lance-of-lethargy',
  'maddening-hex',
  'relentless-hex',
  'shroud-of-shadow',
  'tomb-of-levistus',
  'tricksters-escape',
];

describe('M35 Xanathar’s options', () => {
  it('adds 12 racial feats', () => {
    for (const slug of FEATS) {
      const feature = registry.get('feature', `feature.feat.${slug}`);
      expect(feature.source).toBe('XGE');
      expect(feature.origin).toBe('feat');
    }
  });

  it('adds 14 invocations the picker finds by prefix', () => {
    for (const slug of INVOCATIONS) {
      const feature = registry.get('feature', `feature.warlock.eldritch-invocation-${slug}`);
      expect(feature.source).toBe('XGE');
    }
  });

  it('feat ability bumps and limited uses are set', () => {
    expect(registry.get('feature', 'feature.feat.infernal-constitution').grants?.ability).toEqual([
      'CON',
    ]);
    expect(registry.get('feature', 'feature.feat.second-chance').uses?.recharge).toBe('short');
  });
});
