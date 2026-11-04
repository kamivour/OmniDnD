import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { overrideTargets, type OverrideTarget } from '../calc/override-targets';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { ExportFileSchema } from '../schema';
import { useFeature } from './features';
import { heal } from './hp';
import { setInspiration } from './inspiration';
import { adjustHitDice, completeLongRest, completeShortRest } from './rest';
import { runCommand } from './runner';
import { castSpell } from './spells';
import { freshState, Session, withLive } from './test-utils';
import {
  resetValueOverride,
  setValueOverride,
  type ResetValueOverridePayload,
  type SetValueOverridePayload,
} from './value-overrides';

const options = { eventId: 'override-test', realTime: '2026-11-04T15:00:00.000Z' };
const set = (
  path: string,
  value: number | string,
  note = 'DM approved',
): SetValueOverridePayload => ({ path, value, note });
const catalog = (state: CharacterState) =>
  overrideTargets({ ...state, sheet: computeSheet(state, registry), registry });
const target = (state: CharacterState, path: string): OverrideTarget => {
  const result = catalog(state).find((entry) => entry.path === path);
  if (!result) throw new Error(`Missing target: ${path}`);
  return result;
};

describe('set and reset calculated value overrides', () => {
  it('logs noted values, preserves raw build/live values and supports exact Undo', () => {
    const before = structuredClone(freshState);
    const session = new Session();
    expect(session.run(setValueOverride, set('/ac', 18, '  magic coat  '))).toContain('magic coat');
    expect(session.sheet.ac.value).toBe(18);
    expect(session.sheet.ac.override).toMatchObject({
      calculated: 13,
      value: 18,
      note: 'magic coat',
    });
    expect(session.state.live).toEqual(before.live);
    expect(session.state.build).toEqual({
      ...before.build,
      overrides: [{ path: '/ac', value: 18, note: 'magic coat' }],
    });
    expect(session.events.at(-1)?.command).toBe('setValueOverride');
    expect(session.events.at(-1)?.text).toContain('Armor class');
    expect(session.events.at(-1)?.override).toBeUndefined();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('applies upstream values before dependent stats while a terminal override remains specific', () => {
    const session = new Session();
    session.run(setValueOverride, set('/abilities/CHA/score', 22));
    expect(session.sheet.abilities.CHA.mod).toBe(6);
    expect(session.sheet.spellcasting[0]?.saveDc.value).toBe(16);
    expect(
      session.sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.uses
        ?.max,
    ).toBe(6);
    session.run(setValueOverride, set('/skills/deception', 17));
    expect(session.sheet.skills.deception.value).toBe(17);
    expect(session.sheet.saves.CHA.value).toBe(8);
    session.run(setValueOverride, set('/skills/perception', 8));
    expect(session.sheet.passives.perception.value).toBe(18);
    session.run(setValueOverride, set('/passives/perception', 20));
    expect(session.sheet.passives.perception.value).toBe(20);
    expect(session.sheet.skills.perception.value).toBe(8);
  });

  it('uses effective HP and slot maxima in real healing and casting without changing stored usage on override', () => {
    const session = new Session(
      withLive(freshState, { hp: 17, slotsUsed: [0, 3, 0, 0, 0, 0, 0, 0, 0, 0] }),
    );
    const beforeLive = structuredClone(session.live);
    session.run(setValueOverride, set('/maxHp', 25));
    session.run(setValueOverride, set('/slots/max/1', 6));
    expect(session.live).toEqual(beforeLive);
    session.run(heal, { amount: 20 });
    expect(session.live.hp).toBe(25);
    session.run(castSpell, { spellId: 'spell.dissonant-whispers', slotLevel: 1 });
    expect(session.live.slotsUsed[1]).toBe(4);
    expect(target(session.state, '/slots/remaining/1').value).toBe(2);
    session.undo();
    expect(session.live.slotsUsed[1]).toBe(3);
  });

  it('allows an explicit noted grant of a previously zero slot maximum and uses that pool normally', () => {
    const session = new Session();
    expect(target(session.state, '/slots/max/9').value).toBe(0);
    session.run(setValueOverride, set('/slots/max/9', 1, 'one-use DM grant'));
    expect(target(session.state, '/slots/remaining/9').value).toBe(1);
    session.run(castSpell, { spellId: 'spell.dissonant-whispers', slotLevel: 9 });
    expect(session.live.slotsUsed[9]).toBe(1);
    expect(target(session.state, '/slots/remaining/9').value).toBe(0);
    session.undo();
    session.run(resetValueOverride, { path: '/slots/max/9' });
    expect(session.sheet.slots.max[9]).toBe(0);
  });

  it('resets only the selected target, retains unrelated legacy entries and Undo restores duplicates exactly', () => {
    const state: CharacterState = {
      ...freshState,
      build: {
        ...freshState.build,
        overrides: [
          { path: '/unknown/legacy', value: { nested: [1, 2] }, note: '' },
          { path: '/ac', value: 15, note: 'older' },
          { path: '/ac', value: 18, note: 'newer' },
          { path: '/ac', value: { invalid: true }, note: 'retained' },
        ],
      },
    };
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(resetValueOverride, { path: '/ac', expected: target(state, '/ac').expected });
    expect(session.sheet.ac.value).toBe(13);
    expect(session.state.build.overrides).toEqual([before.build.overrides[0]]);
    expect(session.live).toEqual(before.live);
    session.undo();
    expect(session.state).toEqual(before);
    session.run(setValueOverride, set('/ac', 20));
    expect(session.state.build.overrides).toEqual([
      before.build.overrides[0],
      { path: '/ac', value: 20, note: 'DM approved' },
    ]);
  });

  it('allows explicit same-value notes but blocks repeated no-op saves and empty resets', () => {
    const session = new Session();
    session.run(setValueOverride, set('/ac', 13));
    expect(session.sheet.ac.override).toBeDefined();
    const before = structuredClone(session.state);
    expect(session.try(setValueOverride, set('/ac', 13)).result).toBe('blocked');
    expect(session.state).toEqual(before);
    expect(session.try(resetValueOverride, { path: '/speed' }).result).toBe('blocked');
    expect(session.events).toHaveLength(1);
  });

  it('blocks stale effective values and changed notes without overwriting the latest choice', () => {
    const session = new Session();
    const expected = target(session.state, '/ac').expected;
    session.run(setValueOverride, set('/ac', 17, 'first'));
    expect(session.try(setValueOverride, { ...set('/ac', 20), expected }).result).toBe('blocked');
    const resetExpected = target(session.state, '/ac').expected;
    session.run(setValueOverride, set('/ac', 17, 'updated note'));
    expect(session.try(resetValueOverride, { path: '/ac', expected: resetExpected }).result).toBe(
      'blocked',
    );
    expect(session.sheet.ac.value).toBe(17);
    expect(session.sheet.ac.override?.note).toBe('updated note');
  });

  it('blocks a stale Reset when an override hides an upstream calculation change', () => {
    const session = new Session();
    session.run(setValueOverride, set('/ac', 18));
    const expected = target(session.state, '/ac').expected;
    session.run(setValueOverride, set('/abilities/DEX/mod', 5));
    expect(session.sheet.ac.value).toBe(18);
    expect(target(session.state, '/ac').calculated).toBe(16);
    expect(session.try(resetValueOverride, { path: '/ac', expected }).result).toBe('blocked');
    expect(session.sheet.ac.override).toBeDefined();
  });

  it('keeps exact safe results when large integer parts cancel after an unsafe intermediate sum', () => {
    const state = structuredClone(freshState);
    for (const item of state.build.items)
      if (registry.get('item', item.itemId).weapon)
        state.live.items[item.instanceId]!.equipped = false;
    state.live.effects = [
      {
        id: 'large-value-offsets',
        name: 'Large value offsets',
        concentration: false,
        conditions: [],
        modifiers: (['checks', 'saves', 'ac'] as const).map((target) => ({ target, value: -20 })),
      },
    ];
    const session = new Session(state);
    session.run(setValueOverride, set('/abilities/DEX/mod', Number.MAX_SAFE_INTEGER));
    expect(session.sheet.abilities.DEX.mod).toBe(Number.MAX_SAFE_INTEGER);
    const exactSave = Number(BigInt(Number.MAX_SAFE_INTEGER) + 2n - 20n);
    expect(exactSave).toBe(9007199254740973);
    expect(session.sheet.saves.DEX.value).toBe(exactSave);
    expect(session.sheet.skills['sleight-of-hand'].value).toBe(
      Number(BigInt(Number.MAX_SAFE_INTEGER) + 4n - 20n),
    );
  });

  it.each([
    null,
    {},
    { path: '/ac', value: 18, note: '' },
    { path: '/ac', value: 18, note: '   ' },
    { path: '/ac', value: 18, note: 'ok', extra: true },
    set('/ac', '18'),
    set('/ac', -1),
    set('/ac', 1.5),
    set('/ac', Number.MAX_SAFE_INTEGER + 1),
    set('/abilities/STR/score', Number.MAX_SAFE_INTEGER),
    set('/proficiency', Number.MAX_SAFE_INTEGER),
    set('/level', 21),
    set('/build/name', 20),
    set('/__proto__/polluted', 1),
    set('/slots/max/0', 2),
    set('/features/unowned/uses/max', 4),
    set('/features/feature.bard.bardic-inspiration/die', 'd100'),
  ])(
    'blocks malformed, unavailable and unsafe requests even in forced Manual mode (%j)',
    (payload) => {
      const before = structuredClone(freshState);
      const result = runCommand(
        setValueOverride,
        freshState,
        payload as SetValueOverridePayload,
        registry,
        { ...options, automation: 'manual', force: true },
      );
      expect(result.result).toBe('blocked');
      expect(freshState).toEqual(before);
    },
  );

  it.each([null, {}, { path: '/ac', extra: true }, { path: '/build/name' }])(
    'blocks invalid reset payloads (%j)',
    (payload) => {
      expect(
        runCommand(
          resetValueOverride,
          freshState,
          payload as ResetValueOverridePayload,
          registry,
          options,
        ).result,
      ).toBe('blocked');
    },
  );

  it('uses a noted feature die in real feature commands and restores it with Reset and Undo', () => {
    const session = new Session();
    const path = '/features/feature.bard.bardic-inspiration/die';
    session.run(setValueOverride, set(path, 'd10', 'special boon'));
    expect(session.run(useFeature, { featureId: 'feature.bard.bardic-inspiration' })).toContain(
      'd10',
    );
    session.run(resetValueOverride, { path });
    expect(
      session.sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.die,
    ).toBe('d6');
    session.undo();
    expect(
      session.sheet.features.find(({ def }) => def.id === 'feature.bard.bardic-inspiration')?.die,
    ).toBe('d10');
  });

  it('round-trips notes, legacy entries and exact Undo through the existing character-file schema', () => {
    const session = new Session({
      ...freshState,
      build: {
        ...freshState.build,
        overrides: [{ path: 'legacy.path', value: { own: 'data' }, note: '' }],
      },
    });
    session.run(setValueOverride, set('/initiative', -2, 'heavy costume'));
    const file = ExportFileSchema.parse(
      JSON.parse(
        JSON.stringify({
          ...seed,
          campaign: session.state.campaign,
          build: session.state.build,
          live: session.live,
          events: session.events,
        }),
      ),
    );
    expect(file.build.overrides).toEqual(session.state.build.overrides);
    const restored = new Session({ campaign: file.campaign, build: file.build, live: file.live });
    restored.events = file.events;
    restored.undo();
    expect(restored.state.build.overrides).toEqual([
      { path: 'legacy.path', value: { own: 'data' }, note: '' },
    ]);
    expect(restored.live).toEqual(freshState.live);
  });
});

describe('noted remaining-resource corrections', () => {
  it('preserves future and inactive imported annotations through unrelated commands and counter changes', () => {
    const annotations = [
      {
        path: '/features/feature.future.pet/uses/remaining',
        value: {
          kind: 'remaining-correction',
          remaining: 2,
          spentBefore: 0,
          spent: 1,
          max: 3,
        },
        note: 'future companion resource',
      },
      {
        path: '/hitDice/d8/remaining',
        value: {
          kind: 'remaining-correction',
          remaining: 2,
          spentBefore: 0,
          spent: 1,
          max: 3,
        },
        note: 'inactive imported correction',
      },
    ];
    const session = new Session({
      ...withLive(freshState, { hitDiceSpent: { d8: 2 } }),
      build: { ...freshState.build, overrides: structuredClone(annotations) },
    });
    session.run(setInspiration, { inspired: true });
    expect(session.state.build.overrides).toEqual(annotations);
    session.run(castSpell, { spellId: 'spell.dissonant-whispers', slotLevel: 1 });
    expect(session.live.slotsUsed[1]).toBe(1);
    expect(session.state.build.overrides).toEqual(annotations);
    session.undo();
    expect(session.state.build.overrides).toEqual(annotations);
  });

  it('blocks stale corrections when clamping hides a change in spending or maximum', () => {
    const session = new Session(withLive(freshState, { hitDiceSpent: { d8: 4 } }));
    const path = '/hitDice/d8/remaining';
    const expected = target(session.state, path).expected;
    session.run(adjustHitDice, { die: 'd8', spent: 3 });
    expect(target(session.state, path).value).toBe(0);
    expect(session.try(setValueOverride, { ...set(path, 2), expected }).result).toBe('blocked');
    const maximumExpected = target(session.state, path).expected;
    session.run(setValueOverride, set('/hitDice/d8/max', 2));
    expect(target(session.state, path).value).toBe(0);
    expect(
      session.try(setValueOverride, { ...set(path, 1), expected: maximumExpected }).result,
    ).toBe('blocked');
  });

  it('computes spending from the effective maximum and resets the original correction baseline', () => {
    const initial = withLive(freshState, { hitDiceSpent: { d8: 2 } });
    const session = new Session(initial);
    const path = '/hitDice/d8/remaining';
    session.run(setValueOverride, set(path, 2, 'missed recovery'));
    expect(session.live.hitDiceSpent).toEqual({ d8: 1 });
    expect(target(session.state, path)).toMatchObject({
      value: 2,
      calculated: 1,
      note: 'missed recovery',
    });
    const corrected = structuredClone(session.state);
    expect(session.try(setValueOverride, set(path, 2, 'missed recovery')).result).toBe('blocked');
    session.run(setValueOverride, set(path, 3, 'rechecked recovery'));
    expect(session.live.hitDiceSpent).toEqual({});
    session.run(resetValueOverride, { path });
    expect(session.live.hitDiceSpent).toEqual({ d8: 2 });
    expect(session.state.build.overrides).toEqual([]);
    session.undo();
    expect(target(session.state, path).value).toBe(3);
    session.undo();
    expect(session.state).toEqual(corrected);
    session.undo();
    expect(session.state).toEqual(initial);
  });

  it('spends corrected Hit Dice normally, expires the annotation and Undo restores it exactly', () => {
    const session = new Session(withLive(freshState, { hp: 10, hitDiceSpent: { d8: 2 } }));
    const path = '/hitDice/d8/remaining';
    session.run(setValueOverride, set(path, 2, 'recovery'));
    const corrected = structuredClone(session.state);
    session.run(completeShortRest, { hitDice: [{ die: 'd8', roll: 2 }] });
    expect(target(session.state, path).value).toBe(1);
    expect(session.state.build.overrides.some((entry) => entry.path === path)).toBe(false);
    session.undo();
    expect(session.state).toEqual(corrected);
  });

  it('spends corrected spell slots and shared feature uses without freezing remaining counts', () => {
    const session = new Session();
    const slotPath = '/slots/remaining/1';
    const usePath = '/features/feature.bard.bardic-inspiration/uses/remaining';
    session.run(setValueOverride, set(slotPath, 2, 'slot correction'));
    session.run(setValueOverride, set(usePath, 3, 'feature correction'));
    expect(session.live.slotsUsed[1]).toBe(2);
    expect(session.live.featureUsesSpent['feature.bard.bardic-inspiration']).toBe(2);
    session.run(castSpell, { spellId: 'spell.dissonant-whispers', slotLevel: 1 });
    expect(target(session.state, slotPath).value).toBe(1);
    session.run(useFeature, { featureId: 'feature.bard.cutting-words' });
    expect(target(session.state, usePath).value).toBe(2);
    expect(
      session.state.build.overrides.some(({ path }) => path === slotPath || path === usePath),
    ).toBe(false);
  });

  it('recovers corrected resources normally during Long Rest and Undo restores their annotations', () => {
    const session = new Session();
    const paths = [
      '/hitDice/d8/remaining',
      '/slots/remaining/1',
      '/features/feature.bard.bardic-inspiration/uses/remaining',
    ];
    session.run(setValueOverride, set(paths[0]!, 1));
    session.run(setValueOverride, set(paths[1]!, 1));
    session.run(setValueOverride, set(paths[2]!, 1));
    const corrected = structuredClone(session.state);
    session.run(completeLongRest, null);
    expect(target(session.state, paths[0]!).value).toBe(2);
    expect(target(session.state, paths[1]!).value).toBe(4);
    expect(target(session.state, paths[2]!).value).toBe(5);
    expect(session.state.build.overrides).toEqual([]);
    session.undo();
    expect(session.state).toEqual(corrected);
  });

  it('corrects the separate Pact Magic counter and spends and restores it through actual commands', () => {
    const state: CharacterState = {
      ...freshState,
      build: {
        ...freshState.build,
        classes: [{ classId: 'class.warlock', level: 3 }],
        hpEntries: freshState.build.hpEntries.map((entry) => ({
          ...entry,
          classId: 'class.warlock',
        })),
        spells: [{ classId: 'class.warlock', known: ['spell.invisibility'] }],
        featureIds: [],
      },
    };
    const session = new Session(state);
    const path = '/slots/pact/remaining';
    session.run(setValueOverride, set(path, 1, 'one pact slot spent earlier'));
    const corrected = structuredClone(session.state);
    expect(session.live.pactSlotsUsed).toBe(1);
    session.run(castSpell, { spellId: 'spell.invisibility', pact: true });
    expect(session.live.pactSlotsUsed).toBe(2);
    expect(target(session.state, path).value).toBe(0);
    expect(session.state.build.overrides).toEqual([]);
    session.undo();
    expect(session.state).toEqual(corrected);
    session.run(completeShortRest, {});
    expect(session.live.pactSlotsUsed).toBeUndefined();
    expect(target(session.state, path).value).toBe(2);
    expect(session.state.build.overrides).toEqual([]);
    session.undo();
    expect(session.state).toEqual(corrected);
    session.run(resetValueOverride, { path });
    expect(session.live.pactSlotsUsed).toBeUndefined();
  });

  it('does not restore prior spending from an inactive imported annotation', () => {
    const path = '/hitDice/d8/remaining';
    const state: CharacterState = {
      ...withLive(freshState, { hitDiceSpent: { d8: 2 } }),
      build: {
        ...freshState.build,
        overrides: [
          {
            path,
            value: { kind: 'remaining-correction', remaining: 2, spentBefore: 0, spent: 1, max: 3 },
            note: 'old annotation',
          },
        ],
      },
    };
    const session = new Session(state);
    session.run(resetValueOverride, { path });
    expect(session.live).toEqual(state.live);
    expect(session.state.build.overrides).toEqual([]);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it.each([-1, 4, 1.5, '2'])('rejects remaining counts outside the pool domain (%j)', (value) => {
    const session = new Session();
    const before = structuredClone(session.state);
    expect(session.try(setValueOverride, set('/hitDice/d8/remaining', value)).result).toBe(
      'blocked',
    );
    expect(session.state).toEqual(before);
    expect(session.events).toEqual([]);
  });
});
