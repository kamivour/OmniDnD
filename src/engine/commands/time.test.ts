import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { endCombat, startCombat, startTurn } from './combat';
import { addEffect } from './effects';
import { completeLongRest, completeShortRest } from './rest';
import { runCommand, undo, type Command, type RunOptions } from './runner';
import { freshEconomy } from './shared';
import { castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, Session, withLive } from './test-utils';

describe('advanceTime numeric bounds', () => {
  it.each([
    { now: 0, seconds: Number.MAX_SAFE_INTEGER + 1 },
    { now: freshState.live.clock.seconds, seconds: Number.MAX_SAFE_INTEGER },
    { now: Number.MAX_SAFE_INTEGER, seconds: 1 },
  ])('blocks an unsafe clock result from $now + $seconds without state or log changes', (input) => {
    const session = new Session(withLive(freshState, { clock: { seconds: input.now } }));
    const before = session.state;

    expect(session.try(advanceTime, { seconds: input.seconds })).toEqual({
      result: 'blocked',
      reasons: ['Time advance exceeds the supported game clock range'],
    });
    expect(session.state).toBe(before);
    expect(session.events).toEqual([]);
  });

  it.each(['assisted', 'manual'] as const)(
    'keeps numeric blocks enforced in %s mode even when forced',
    (automation) => {
      expect(
        runCommand(advanceTime, freshState, { seconds: Number.MAX_SAFE_INTEGER }, registry, {
          eventId: 'oversized-clock',
          realTime: '2026-11-04T08:00:00.000Z',
          automation,
          force: true,
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ['Time advance exceeds the supported game clock range'],
      });
    },
  );

  it('accepts the exact safe clock limit and restores it with Undo', () => {
    const session = new Session();
    const before = session.state;
    const seconds = Number.MAX_SAFE_INTEGER - session.live.clock.seconds;

    session.run(advanceTime, { seconds });
    expect(session.live.clock.seconds).toBe(Number.MAX_SAFE_INTEGER);
    expect(session.events[0]?.gameSeconds).toBe(before.live.clock.seconds);
    session.undo();
    expect(session.state).toEqual(before);
  });
});

function clockCase<Payload>(
  name: string,
  command: Command<Payload>,
  payload: Payload,
  advanceSeconds: number,
  deadlineSeconds = advanceSeconds,
  prepare: (state: CharacterState) => CharacterState = (state) => state,
) {
  return {
    name,
    advanceSeconds,
    deadlineSeconds,
    run: (state: CharacterState, options: RunOptions) =>
      runCommand(command, prepare(state), payload, registry, options),
    prepare,
  };
}

const combatRound = (round: number) => (state: CharacterState) =>
  withLive(state, { combat: { round, turnActive: false, economy: freshEconomy() } });

const selectSpell = (spellId: string) => (state: CharacterState) => ({
  ...state,
  build: {
    ...state.build,
    spells: [{ classId: 'class.bard', known: [spellId] }],
  },
});

const timePassingCases = [
  clockCase('short rest', completeShortRest, {}, 3600),
  clockCase('long rest', completeLongRest, null, 28800),
  clockCase('later Start Turn', startTurn, null, 6, 6, combatRound(1)),
  clockCase('End Combat', endCombat, null, 6, 6, combatRound(0)),
  clockCase(
    'ritual spell with concentration deadline',
    castSpell,
    { spellId: 'spell.detect-magic', ritual: true },
    600,
    1200,
    selectSpell('spell.detect-magic'),
  ),
  clockCase(
    'long casting time',
    castSpell,
    { spellId: 'spell.mending' },
    60,
    60,
    selectSpell('spell.mending'),
  ),
  clockCase(
    'concentration spell deadline',
    castSpell,
    { spellId: 'spell.faerie-fire', slotLevel: 1 },
    0,
    60,
  ),
  clockCase(
    'self effect spell deadline',
    castSpell,
    { spellId: 'spell.disguise-self', slotLevel: 1 },
    0,
    3600,
  ),
  clockCase('manual effect deadline', addEffect, { name: 'Ward', durationSeconds: 60 }, 0, 60),
];

const clockOptions = { eventId: 'boundary-clock', realTime: '2026-11-04T08:00:00.000Z' };

describe('commands at the supported game clock boundary', () => {
  it.each(timePassingCases)('blocks $name before an unsafe time is written', (testCase) => {
    const state = withLive(freshState, {
      clock: { seconds: Number.MAX_SAFE_INTEGER - testCase.deadlineSeconds + 1 },
    });
    const before = structuredClone(state);

    for (const automation of ['assisted', 'manual'] as const) {
      expect(testCase.run(state, { ...clockOptions, automation, force: true })).toEqual({
        result: 'blocked',
        reasons: ['Time advance exceeds the supported game clock range'],
      });
    }
    expect(state).toEqual(before);
  });

  it.each(timePassingCases)('allows $name at the exact safe limit with exact Undo', (testCase) => {
    const state = withLive(freshState, {
      clock: { seconds: Number.MAX_SAFE_INTEGER - testCase.deadlineSeconds },
    });
    const result = testCase.run(state, clockOptions);
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
    expect(result.next.live.clock.seconds).toBe(state.live.clock.seconds + testCase.advanceSeconds);
    expect(
      undo(result.next, [result.event], { ...clockOptions, eventId: 'undo-boundary-clock' }),
    ).toMatchObject({ result: 'ok', next: testCase.prepare(state) });
  });

  it('allows starting combat and its first turn at the maximum clock without advancing it', () => {
    const session = new Session(
      withLive(freshState, { clock: { seconds: Number.MAX_SAFE_INTEGER } }),
    );
    session.run(startCombat, null);
    session.run(startTurn, null);
    expect(session.live.clock.seconds).toBe(Number.MAX_SAFE_INTEGER);
    expect(session.live.combat).toMatchObject({ round: 1, turnActive: true });
  });

  it('keeps untracked spell durations and in-combat casting time outside the clock guard', () => {
    const state = withLive(freshState, { clock: { seconds: Number.MAX_SAFE_INTEGER } });
    const illusion = runCommand(
      castSpell,
      state,
      { spellId: 'spell.minor-illusion' },
      registry,
      clockOptions,
    );
    expect(illusion).toMatchObject({
      result: 'ok',
      next: { live: { clock: state.live.clock, effects: [] } },
    });
    const inCombat = combatRound(1)(selectSpell('spell.mending')(state));
    const mending = runCommand(castSpell, inCombat, { spellId: 'spell.mending' }, registry, {
      ...clockOptions,
      force: true,
    });
    expect(mending).toMatchObject({
      result: 'ok',
      next: { live: { clock: state.live.clock } },
      event: { override: true },
    });
  });

  it('blocks an unsafe manual effect duration and preserves ordinary invalid-input messages', () => {
    const session = new Session(withLive(freshState, { clock: { seconds: 0 } }));
    expect(
      session.try(addEffect, { name: 'Ward', durationSeconds: Number.MAX_SAFE_INTEGER + 1 }),
    ).toEqual({
      result: 'blocked',
      reasons: ['Time advance exceeds the supported game clock range'],
    });
    expect(session.try(addEffect, { name: 'Ward', durationSeconds: 0 })).toEqual({
      result: 'blocked',
      reasons: ['Duration in seconds must be a whole number of at least 1'],
    });
  });
});
