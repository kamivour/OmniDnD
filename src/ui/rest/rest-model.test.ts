import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import {
  addEffect,
  applyDamage,
  castSpell,
  completeShortRest,
  startCombat,
} from '../../engine/commands';
import { freshState, Session, withLive } from '../../engine/commands/test-utils';
import { previewShortRest, restChanges } from './rest-model';

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
