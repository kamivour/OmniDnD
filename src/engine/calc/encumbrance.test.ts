import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { buildRegistry } from '../registry';
import type { ItemDef } from '../schema';
import { encumbrance } from './encumbrance';
import { armorEquipmentNotes } from './equipment';
import { inventoryWeight } from './inventory-weight';
import { computeSheet, type CharacterState } from './sheet';

function world(weight: number, unknown = false) {
  const state: CharacterState = structuredClone(seedFile);
  state.campaign.optionalRules.encumbrance = 'variant';
  state.build.abilityScores.base.STR = 10;
  state.build.items = [{ instanceId: 'load', itemId: 'item.test-load' }];
  state.live.items = { load: { qty: 1, equipped: false, attuned: false } };
  state.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const definition: ItemDef = {
    kind: 'item',
    id: 'item.test-load',
    name: 'Test load',
    ruleset: '5e-2014',
    source: 'HB',
    srd: false,
    category: 'gear',
    weight,
  };
  const definitions = [definition];
  if (unknown) {
    definitions.push({ ...definition, id: 'item.unknown-load', weight: undefined });
    state.build.items.push({ instanceId: 'unknown', itemId: 'item.unknown-load' });
    state.live.items.unknown = { qty: 1, equipped: false, attuned: false };
  }
  const references = buildRegistry([[...registry.entries.values(), ...definitions]], [], []);
  return { state, references };
}

describe('variant encumbrance (2014)', () => {
  it.each([
    [0, 'none', 30],
    [50, 'none', 30],
    [50.01, 'encumbered', 20],
    [100, 'encumbered', 20],
    [100.01, 'heavy', 10],
    [150, 'heavy', 10],
    [151, 'heavy', 10],
  ] as const)('at %s lb has level %s and speed %s', (weight, level, speed) => {
    const { state, references } = world(weight);
    const before = structuredClone(state);
    const sheet = computeSheet(state, references);
    expect(sheet.encumbrance).toMatchObject({
      mode: 'variant',
      level,
      incomplete: false,
      encumberedAbove: 50,
      heavyAbove: 100,
    });
    expect(sheet.speed.value).toBe(speed);
    expect(sheet.speed.parts.reduce((sum, part) => sum + part.value, 0)).toBe(speed);
    expect(state).toEqual(before);
  });

  it('counts coins at the exact boundary without using the rounded displayed load', () => {
    const { state, references } = world(100);
    state.live.currency.cp = 1;
    expect(computeSheet(state, references).encumbrance.level).toBe('heavy');
    const tiny = world(100.00001);
    expect(inventoryWeight(tiny.state, tiny.references).knownPounds).toBe('100');
    expect(computeSheet(tiny.state, tiny.references).encumbrance.level).toBe('heavy');
  });

  it.each([
    [30, 'unknown', 0],
    [60, 'encumbered', 10],
    [110, 'heavy', 20],
  ] as const)(
    'uses a proven minimum for %s known pounds with missing weights',
    (weight, level, penalty) => {
      const { state, references } = world(weight, true);
      expect(encumbrance(state, references, 10)).toMatchObject({
        level,
        speedPenalty: penalty,
        incomplete: true,
      });
      expect(computeSheet(state, references).speed.value).toBe(30 - penalty);
    },
  );

  it.each(['off', 'standard', 'unrecognized'])('preserves normal speed under %s', (mode) => {
    const { state, references } = world(200);
    state.campaign.optionalRules.encumbrance = mode;
    const sheet = computeSheet(state, references);
    expect(sheet.speed.value).toBe(30);
    expect(sheet.encumbrance.level).toBe('none');
    expect(sheet.encumbrance.mode).toBe(mode === 'off' ? 'off' : 'standard');
  });

  it('uses accepted Strength overrides without treating a capacity override as a Strength change', () => {
    const { state, references } = world(60);
    state.build.overrides.push({ path: '/abilities/STR/score', value: 12, note: 'DM correction' });
    let sheet = computeSheet(state, references);
    expect(sheet.encumbrance.level).toBe('none');
    expect(sheet.encumbrance.encumberedAbove).toBe(60);
    state.build.overrides.push({
      path: '/carryingCapacity',
      value: 999,
      note: 'Special container',
    });
    state.live.items.load!.qty = 2;
    sheet = computeSheet(state, references);
    expect(sheet.encumbrance.level).toBe('encumbered');
    expect(sheet.carryingCapacity).toBe(999);
  });

  it('replaces armor Strength speed penalties and their reminders while retaining armor proficiency notes', () => {
    const { state, references } = world(0);
    state.build.items.push({ instanceId: 'armor', itemId: 'item.chain-mail' });
    state.live.items.armor = { qty: 1, equipped: true, attuned: false };
    const sheet = computeSheet(state, references);
    expect(sheet.encumbrance.level).toBe('encumbered');
    expect(sheet.speed.value).toBe(20);
    expect(sheet.speed.parts.some(({ label }) => label.includes('(STR'))).toBe(false);
    const notes = armorEquipmentNotes(state, references, sheet);
    expect(notes.some((note) => note.includes('STR 13 requirement'))).toBe(false);
    expect(notes.some((note) => note.includes('No proficiency'))).toBe(true);
    state.campaign.optionalRules.encumbrance = 'standard';
    const standard = computeSheet(state, references);
    expect(standard.speed.value).toBe(20);
    expect(standard.speed.parts.some(({ label }) => label.includes('(STR'))).toBe(true);
  });

  it('applies the load reduction before exhaustion and preserves speed-zero conditions', () => {
    const { state, references } = world(110);
    state.live.exhaustion = 2;
    expect(computeSheet(state, references).speed.value).toBe(5);
    state.live.exhaustion = 5;
    expect(computeSheet(state, references).speed.value).toBe(0);
    state.live.exhaustion = 0;
    state.live.conditions = ['grappled'];
    expect(computeSheet(state, references).speed.value).toBe(0);
    state.live.conditions = [];
    state.build.overrides.push({ path: '/speed', value: 40, note: 'DM speed correction' });
    expect(computeSheet(state, references).speed).toMatchObject({
      value: 40,
      override: { calculated: 10 },
    });
  });

  it('floors a reduced speed at zero with a matching breakdown', () => {
    const { state, references } = world(110);
    state.live.effects.push({
      id: 'slow',
      name: 'Slowed',
      concentration: false,
      conditions: [],
      modifiers: [{ target: 'speed', value: -15 }],
    });
    const speed = computeSheet(state, references).speed;
    expect(speed.value).toBe(0);
    expect(speed.parts.reduce((sum, part) => sum + part.value, 0)).toBe(0);
  });
});
