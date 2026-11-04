import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { characterFeatures } from '../calc/features';
import { freshState } from '../commands/test-utils';
import { buildRegistry } from '../registry';
import { FeatureDefSchema, MechanicsOverlaySchema } from './index';

const defenses = {
  resistances: ['poison'],
  immunities: ['fire'],
  vulnerabilities: ['cold'],
  saveAdvantages: ['poison', 'charmed'],
  magicalSleepImmunity: true,
};
const feature = registry.get('feature', 'feature.fey-ancestry');

describe('feature defensive display metadata', () => {
  it('accepts strict typed defense metadata on a feature and mechanics overlay', () => {
    expect(FeatureDefSchema.parse({ ...feature, defenses }).defenses).toEqual(defenses);
    expect(MechanicsOverlaySchema.parse({ id: feature.id, defenses }).defenses).toEqual(defenses);
    expect(FeatureDefSchema.parse({ ...feature, defenses: {} }).defenses).toEqual({});
  });

  it.each([
    { resistances: ['charmed'] },
    { immunities: ['sleep'] },
    { vulnerabilities: ['unknown'] },
    { saveAdvantages: ['magical-sleep'] },
    { magicalSleepImmunity: 'true' },
    { unknown: [] },
  ])('rejects invalid defensive metadata %j in both schemas', (invalid) => {
    expect(FeatureDefSchema.safeParse({ ...feature, defenses: invalid }).success).toBe(false);
    expect(MechanicsOverlaySchema.safeParse({ id: feature.id, defenses: invalid }).success).toBe(
      false,
    );
  });

  it('exposes annotated defenses only through features the character owns', () => {
    const localRegistry = buildRegistry(
      [[...registry.entries.values()]],
      [],
      [{ id: feature.id, defenses: { saveAdvantages: ['charmed'], magicalSleepImmunity: true } }],
    );
    const context = { mods: { STR: 0, DEX: 2, CON: 1, INT: 1, WIS: 1, CHA: 5 }, proficiency: 2 };
    const owned = characterFeatures(freshState.build, localRegistry, context);
    expect(owned.find(({ def }) => def.id === feature.id)?.def.defenses).toEqual({
      saveAdvantages: ['charmed'],
      magicalSleepImmunity: true,
    });
    const human = { ...freshState.build, raceId: 'race.human' };
    expect(
      characterFeatures(human, localRegistry, context).some(({ def }) => def.id === feature.id),
    ).toBe(false);
  });
});
