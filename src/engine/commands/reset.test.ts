import { describe, expect, it } from 'vitest';
import { computeSheet } from '../calc/sheet';
import { registry } from '../../data/registry';
import { startCombat, startTurn } from './combat';
import { resetCharacter, type ResetCharacterPayload } from './reset';
import { castSpell } from './spells';
import { freshState, Session, withLive } from './test-utils';
import { setValueOverride } from './value-overrides';

describe('resetCharacter', () => {
  it('refills every tracked resource, clears live session state and undoes exactly', () => {
    const session = new Session(
      withLive(freshState, {
        hp: 8,
        inspiration: true,
        lastLongRestEnd: 1234,
        hitDiceSpent: { d8: 3 },
        featureUsesSpent: { 'feature.bard.bardic-inspiration': 5, 'feature.unknown': 2 },
        slotsUsed: [0, 2, 1, 0, 0, 0, 0, 0, 0, 0],
        pactSlotsUsed: 2,
      }),
    );
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    session.state = withLive(session.state, {
      hp: 0,
      tempHp: 4,
      exhaustion: 6,
      conditions: ['poisoned', 'unconscious'],
      deathSaves: { success: 0, fail: 3 },
      concentration: {
        ...session.live.concentration!,
        pendingSaves: [{ id: 'pending-save', dc: 10 }],
      },
    });
    const before = structuredClone(session.state);
    const previousEvents = structuredClone(session.events);

    expect(session.run(resetCharacter, { expected: before })).toContain('HP 0 → 19');
    expect(session.live).toEqual({
      ...before.live,
      hp: 19,
      tempHp: 0,
      deathSaves: { success: 0, fail: 0 },
      hitDiceSpent: {},
      slotsUsed: Array<number>(10).fill(0),
      featureUsesSpent: {},
      effects: [],
      conditions: [],
      exhaustion: 0,
      pactSlotsUsed: undefined,
      concentration: undefined,
      combat: undefined,
    });
    expect(session.state.build).toEqual(before.build);
    expect(session.live).not.toHaveProperty('combat');
    expect(session.live).not.toHaveProperty('concentration');
    expect(session.live).not.toHaveProperty('pactSlotsUsed');
    expect(session.state.campaign).toEqual(before.campaign);
    expect(session.events.slice(0, -1)).toEqual(previousEvents);
    expect(session.events.at(-1)?.command).toBe('resetCharacter');
    expect(session.sheet.maxHp.value).toBe(19);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('preserves possessions, money, choices, Inspiration and both time records', () => {
    const state = structuredClone(freshState);
    state.build.xp = 1300;
    state.live.clock.seconds = 98765;
    state.live.lastLongRestEnd = 24680;
    state.live.currency = { cp: 11, sp: 12, ep: 13, gp: 14, pp: 15 };
    state.live.inspiration = false;
    const itemId = state.build.items[0]!.instanceId;
    state.live.items[itemId] = { qty: 2, charges: 1, equipped: true, attuned: true };
    const session = new Session(state);
    session.run(resetCharacter, {});
    expect(session.state.build).toEqual(state.build);
    expect(session.live.items).toEqual(state.live.items);
    expect(session.live.currency).toEqual(state.live.currency);
    expect(session.live.clock).toEqual(state.live.clock);
    expect(session.live.lastLongRestEnd).toBe(24680);
    expect(session.live.inspiration).toBe(false);
  });

  it('keeps fixed overrides, expires changed counter notes and restores both on Undo', () => {
    const session = new Session();
    session.run(setValueOverride, { path: '/maxHp', value: 25, note: 'DM blessing' });
    session.run(setValueOverride, { path: '/slots/remaining/1', value: 1, note: 'corrected use' });
    const before = structuredClone(session.state);
    session.run(resetCharacter, {});
    expect(session.live.hp).toBe(25);
    expect(session.live.slotsUsed[1]).toBe(0);
    expect(session.state.build.overrides).toEqual([
      { path: '/maxHp', value: 25, note: 'DM blessing' },
    ]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('derives HP after removing exhaustion rather than using the reduced preview maximum', () => {
    const state = withLive(freshState, { hp: 1, exhaustion: 4 });
    expect(computeSheet(state, registry).maxHp.value).toBe(9);
    const session = new Session(state);
    session.run(resetCharacter, {});
    expect(session.live.hp).toBe(19);
    expect(session.live.exhaustion).toBe(0);
  });

  it.each(['live', 'build', 'campaign'] as const)('blocks a stale reviewed %s baseline', (part) => {
    const session = new Session();
    const expected = structuredClone(session.state);
    if (part === 'live') expected.live.hp = 1;
    if (part === 'build') expected.build.name = 'Old name';
    if (part === 'campaign') expected.campaign.name = 'Old campaign';
    expect(session.preview(resetCharacter, { expected })).toEqual({
      result: 'blocked',
      reasons: [
        'The character or campaign changed after this reset was reviewed. Review Reset again.',
      ],
    });
    expect(session.state).toEqual(freshState);
    expect(session.events).toEqual([]);
  });

  it('blocks invalid payloads without changing the character', () => {
    const session = new Session();
    expect(session.preview(resetCharacter, null as unknown as ResetCharacterPayload)).toEqual({
      result: 'blocked',
      reasons: ['Reset details are invalid'],
    });
    expect(session.state).toEqual(freshState);
  });
});
