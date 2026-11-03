import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import {
  addEffect,
  applyDamage,
  castSpell,
  completeLongRest,
  completeShortRest,
  runCommand,
  setExhaustion,
  setTempHp,
  startCombat,
} from '../../engine/commands';
import { freshState, seedState, Session, withLive } from '../../engine/commands/test-utils';
import { preparedRestClassIds, previewLongRest, previewShortRest, restChanges } from './rest-model';

describe('Short Rest preview', () => {
  it('previews the exact applied rest, expiry and unchanged resources without changing state or history', () => {
    const session = new Session(
      withLive(freshState, {
        hp: 14,
        featureUsesSpent: { 'feature.bard.bardic-inspiration': 2 },
      }),
    );
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    session.run(applyDamage, { amount: 1 });
    session.run(addEffect, { name: 'Longer ward', durationSeconds: 3601 });
    const before = structuredClone({ state: session.state, events: session.events });
    const payload = { hitDice: [{ die: 'd8' as const, roll: 2 }], songOfRest: 2 };
    const preview = previewShortRest(session.state, registry, payload);
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect({ state: session.state, events: session.events }).toEqual(before);
    const changes = restChanges(session.state, preview.next, registry);
    expect(changes).toEqual(
      expect.arrayContaining([
        { label: 'HP', before: '13 / 19', after: '18 / 19' },
        { label: 'Game clock', before: 'Day 1, 08:00', after: 'Day 1, 09:00' },
        { label: 'd8 Hit Dice', before: '3 / 3', after: '2 / 3' },
        { label: 'Level 1 slots', before: '4 / 4', after: '4 / 4' },
        { label: 'Level 2 slots', before: '1 / 2', after: '1 / 2' },
        { label: 'Bardic Inspiration', before: '3 / 5', after: '3 / 5' },
        { label: 'Concentration', before: 'Invisibility', after: 'None' },
        { label: 'Pending concentration checks', before: '1', after: '0' },
        { label: 'Invisibility', before: 'Active', after: 'Ended' },
        { label: 'Longer ward', before: 'Active', after: 'Active' },
        { label: 'Conditions', before: 'invisible', after: 'None' },
      ]),
    );
    session.run(completeShortRest, payload);
    expect(session.state).toEqual(preview.next);
    expect(session.events).toHaveLength(before.events.length + 1);
    expect(session.events.at(-1)?.id).not.toBe(preview.event.id);
    session.undo();
    expect(session.state).toEqual(before.state);
  });

  it('returns engine blockers for incomplete rolls or combat without advancing anything', () => {
    const session = new Session();
    const before = session.state;
    const invalid = previewShortRest(session.state, registry, {
      hitDice: [{ die: 'd8', roll: NaN }],
    });
    expect(invalid).toEqual({
      result: 'blocked',
      reasons: ['d8 roll must be a whole number from 1 to 8'],
    });
    expect(session.state).toBe(before);
    session.run(startCombat, null);
    const fighting = structuredClone(session.state);
    expect(previewShortRest(session.state, registry, {})).toEqual({
      result: 'blocked',
      reasons: ['End combat before resting'],
    });
    expect(session.state).toEqual(fighting);
    expect(session.events).toHaveLength(1);
  });

  it('caps preview healing and retains dice expenditure when the selected rolls exceed missing HP', () => {
    const session = new Session(withLive(freshState, { hp: 18 }));
    const preview = previewShortRest(session.state, registry, {
      hitDice: [{ die: 'd8', roll: 8 }],
    });
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(preview.next.live.hp).toBe(19);
    expect(preview.next.live.hitDiceSpent).toEqual({ d8: 1 });
    expect(session.live.hp).toBe(18);
    expect(session.live.hitDiceSpent).toEqual({});
  });
});

describe('Long Rest preview', () => {
  it('shows every recovery and expiry from the exact applied rest, leaving state and history untouched', () => {
    const session = new Session(
      withLive(seedState, {
        hitDiceSpent: { d8: 3 },
        deathSaves: { success: 1, fail: 1 },
      }),
    );
    session.run(setExhaustion, { level: 4 });
    session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true });
    session.run(applyDamage, { amount: 1 });
    session.run(setTempHp, { amount: 4 });
    session.run(addEffect, { name: 'Rest-length ward', durationSeconds: 8 * 3600 });
    session.run(addEffect, { name: 'Longer ward', durationSeconds: 8 * 3600 + 1 });
    const before = structuredClone({ state: session.state, events: session.events });
    const preview = previewLongRest(session.state, registry);
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(preview.warnings).toEqual([]);
    expect({ state: session.state, events: session.events }).toEqual(before);
    const changes = restChanges(session.state, preview.next, registry);
    expect(changes).toEqual(
      expect.arrayContaining([
        { label: 'HP', before: '8 / 9', after: '19 / 19' },
        { label: 'Game clock', before: 'Day 1, 08:00', after: 'Day 1, 16:00' },
        { label: 'd8 Hit Dice', before: '0 / 3', after: '1 / 3' },
        { label: 'Level 1 slots', before: '0 / 4', after: '4 / 4' },
        { label: 'Level 2 slots', before: '1 / 2', after: '2 / 2' },
        { label: 'Bardic Inspiration', before: '3 / 5', after: '5 / 5' },
        { label: 'Temporary HP', before: '4', after: '0' },
        { label: 'Exhaustion', before: '4', after: '3' },
        {
          label: 'Death saves',
          before: '1 success / 1 failure',
          after: '0 successes / 0 failures',
        },
        { label: 'Last long rest', before: 'Never', after: 'Day 1, 16:00' },
        { label: 'Concentration', before: 'Invisibility', after: 'None' },
        { label: 'Pending concentration checks', before: '1', after: '0' },
        { label: 'Invisibility', before: 'Active', after: 'Ended' },
        { label: 'Rest-length ward', before: 'Active', after: 'Ended' },
        { label: 'Longer ward', before: 'Active', after: 'Active' },
        { label: 'Conditions', before: 'invisible', after: 'None' },
      ]),
    );
    expect(preview.next.live.deathSaves).toEqual({ success: 0, fail: 0 });
    session.run(completeLongRest, null);
    expect(session.state).toEqual(preview.next);
    expect(session.events).toHaveLength(before.events.length + 1);
    expect(session.events.at(-1)?.id).not.toBe(preview.event.id);
    expect(session.events.at(-1)?.override).toBeUndefined();
    session.undo();
    expect(session.state).toEqual(before.state);
  });

  it('retains the 24-hour warning alongside a pure complete preview without forcing actual Apply', () => {
    const session = new Session(
      withLive(seedState, { lastLongRestEnd: 0, hitDiceSpent: { d8: 3 } }),
    );
    const before = structuredClone({ state: session.state, events: session.events });
    const preview = previewLongRest(session.state, registry);
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(preview.warnings).toEqual(['Less than 24 h since last long rest']);
    expect(preview.next.live.hp).toBe(19);
    expect(preview.next.live.hitDiceSpent).toEqual({ d8: 2 });
    expect(preview.next.live.clock.seconds).toBe(before.state.live.clock.seconds + 8 * 3600);
    expect({ state: session.state, events: session.events }).toEqual(before);
    expect(session.try(completeLongRest, null)).toEqual({
      result: 'warn',
      reasons: ['Less than 24 h since last long rest'],
    });
    expect({ state: session.state, events: session.events }).toEqual(before);
    session.run(completeLongRest, null, true);
    expect(session.state).toEqual(preview.next);
    expect(session.events).toHaveLength(1);
    expect(session.events[0]!.override).toBe(true);
    session.undo();
    expect(session.state).toEqual(before.state);
  });

  it('Manual omits the 24-hour warning in both preview and actual execution', () => {
    const state = withLive(seedState, { lastLongRestEnd: 0 });
    const before = structuredClone(state);
    const preview = previewLongRest(state, registry, 'manual');
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(preview.warnings).toEqual([]);
    const result = runCommand(completeLongRest, state, null, registry, {
      eventId: 'manual-rest',
      realTime: '2026-11-03T10:00:00.000Z',
      automation: 'manual',
    });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') return;
    expect(result.next).toEqual(preview.next);
    expect(result.event.override).toBeUndefined();
    expect(state).toEqual(before);
  });

  it('does not project recovery past health or combat blockers, even in Manual', () => {
    const fighting = new Session();
    fighting.run(startCombat, null);
    for (const [state, reason] of [
      [withLive(seedState, { hp: 0, lastLongRestEnd: 0 }), "Can't long rest at 0 HP"],
      [withLive(seedState, { hp: 0, deathSaves: { success: 0, fail: 3 } }), 'You are dead'],
      [fighting.state, 'End combat before resting'],
    ] as const) {
      const before = structuredClone(state);
      for (const automation of ['assisted', 'manual'] as const) {
        const preview = previewLongRest(state, registry, automation);
        expect(preview).toMatchObject({ result: 'blocked', reasons: [reason], warnings: [] });
        expect(preview).not.toHaveProperty('next');
        expect(state).toEqual(before);
      }
    }
  });
});

describe('prepared-spell rest prompt', () => {
  it.each([
    ['class.bard', 3, false],
    ['class.paladin', 1, false],
    ['class.paladin', 2, true],
    ['class.cleric', 1, true],
    ['class.druid', 1, true],
    ['class.wizard', 1, true],
  ] as const)('offers changes only when %s %i can prepare spells', (classId, level, expected) => {
    const state = structuredClone(freshState);
    state.build.classes = [{ classId, level }];
    expect(preparedRestClassIds(state, registry)).toEqual(expected ? [classId] : []);
  });

  it('offers owned prepared classes together and ignores unrelated spell associations', () => {
    const state = structuredClone(freshState);
    state.build.classes.push(
      { classId: 'class.cleric', level: 1 },
      { classId: 'class.wizard', level: 1 },
    );
    state.build.spells.push({
      classId: 'class.druid',
      known: [],
      prepared: ['spell.healing-word'],
    });
    const before = structuredClone(state);
    expect(preparedRestClassIds(state, registry)).toEqual(['class.cleric', 'class.wizard']);
    expect(state).toEqual(before);
  });
});
