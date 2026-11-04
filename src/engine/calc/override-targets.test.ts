import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState, withLive } from '../commands/test-utils';
import type { CharacterState } from './sheet';
import { computeSheet } from './sheet';
import { overrideTargets } from './override-targets';
import { overridePath } from './value-overrides';

const targets = (state: CharacterState = freshState) =>
  overrideTargets({ ...state, sheet: computeSheet(state, registry), registry });

function withClass(classId: string): CharacterState {
  return {
    ...freshState,
    build: {
      ...freshState.build,
      classes: [{ classId, level: 3 }],
      hpEntries: freshState.build.hpEntries.map((entry) => ({ ...entry, classId })),
      spells: [],
      featureIds: [],
    },
  };
}

describe('calculated override target catalog', () => {
  it('exposes each existing calculated value once and retains state unchanged', () => {
    const before = structuredClone(freshState);
    const sheet = computeSheet(freshState, registry);
    const actual = targets();
    const numericPaths = Object.keys(sheet.values);
    expect(actual.filter(({ kind }) => kind === 'number').map(({ path }) => path)).toEqual(
      numericPaths,
    );
    expect(new Set(actual.map(({ path }) => path)).size).toBe(actual.length);
    expect(actual.find(({ path }) => path === '/level')).toMatchObject({
      kind: 'number',
      value: 3,
      calculated: 3,
      domain: { min: 1, max: 20 },
      hasOverride: false,
      expected: { value: 3, override: [] },
    });
    expect(actual.some(({ path }) => path === '/slots/remaining/3')).toBe(false);
    expect(actual.find(({ path }) => path === '/slots/max/3')).toMatchObject({ value: 0 });
    expect(actual.some(({ path }) => path === '/slots/max/0')).toBe(false);
    expect(freshState).toEqual(before);
  });

  it('shows applied notes, pre-override calculations and raw retained records in review snapshots', () => {
    const state: CharacterState = {
      ...freshState,
      build: {
        ...freshState.build,
        overrides: [
          { path: '/ac', value: 15, note: 'old' },
          { path: '/unknown', value: { untouched: true }, note: 'legacy' },
          { path: '/ac', value: 18, note: 'DM approved' },
          { path: '/ac', value: 'invalid legacy number', note: 'retained' },
        ],
      },
    };
    const target = targets(state).find(({ path }) => path === '/ac');
    expect(target).toMatchObject({
      value: 18,
      calculated: 13,
      note: 'DM approved',
      hasOverride: true,
      expected: { value: 18, override: state.build.overrides.filter(({ path }) => path === '/ac') },
    });
    expect(targets(state).some(({ path }) => path === '/unknown')).toBe(false);
  });

  it('uses physical feature pools once instead of duplicating aliases and exposes owned feature dice', () => {
    const actual = targets(
      withLive(freshState, { featureUsesSpent: { 'feature.bard.bardic-inspiration': 2 } }),
    );
    const uses = actual.filter(
      ({ kind, path }) => kind === 'remaining' && path.startsWith('/features/'),
    );
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({
      path: '/features/feature.bard.bardic-inspiration/uses/remaining',
      value: 3,
      max: 5,
      spent: 2,
      counter: { kind: 'feature', featureId: 'feature.bard.bardic-inspiration' },
    });
    expect(
      actual.find(({ path }) => path === '/features/feature.bard.bardic-inspiration/die'),
    ).toMatchObject({
      kind: 'die',
      value: 'd6',
      calculated: 'd6',
    });
    expect(actual.some(({ path }) => path.includes('cutting-words/uses/remaining'))).toBe(false);
  });

  it('covers prepared casters and Pact Magic without adding unavailable pools to noncasters', () => {
    expect(
      targets(withClass('class.wizard')).find(
        ({ path }) => path === '/spellcasting/class.wizard/preparedLimit',
      ),
    ).toMatchObject({
      value: 4,
      kind: 'number',
    });
    const pact = targets(withClass('class.warlock'));
    expect(pact.find(({ path }) => path === '/slots/pact/remaining')).toMatchObject({
      value: 2,
      max: 2,
      counter: { kind: 'pact' },
    });
    expect(pact.some(({ path }) => path.startsWith('/slots/remaining/'))).toBe(false);
    expect(
      targets(withClass('class.fighter')).some(({ path }) => path.startsWith('/slots/remaining/')),
    ).toBe(false);
  });

  it('keeps explicitly overridden zero slot pools resettable and uses current effective maxima', () => {
    const state: CharacterState = {
      ...freshState,
      build: {
        ...freshState.build,
        overrides: [{ path: '/slots/max/1', value: 0, note: 'DM restriction' }],
      },
    };
    expect(targets(state).find(({ path }) => path === '/slots/max/1')).toMatchObject({
      value: 0,
      calculated: 4,
      hasOverride: true,
    });
    expect(targets(state).find(({ path }) => path === '/slots/remaining/1')).toMatchObject({
      value: 0,
      max: 0,
      domain: { min: 0, max: 0 },
    });
  });

  it('reports active and inactive remaining-correction provenance without pinning the result', () => {
    const path = overridePath('hitDice', 'd8', 'remaining');
    const state: CharacterState = {
      ...withLive(freshState, { hitDiceSpent: { d8: 1 } }),
      build: {
        ...freshState.build,
        overrides: [
          {
            path,
            value: { kind: 'remaining-correction', remaining: 2, spentBefore: 2, spent: 1, max: 3 },
            note: 'missed recovery',
          },
        ],
      },
    };
    expect(targets(state).find((target) => target.path === path)).toMatchObject({
      value: 2,
      calculated: 1,
      note: 'missed recovery',
      hasOverride: true,
    });
    const later = targets(withLive(state, { hitDiceSpent: { d8: 2 } })).find(
      (target) => target.path === path,
    );
    expect(later).toMatchObject({ value: 1, calculated: 1, hasOverride: true });
    expect(later?.override).toBeUndefined();
  });
});
