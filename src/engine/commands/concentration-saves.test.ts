import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { LiveStateSchema } from '../schema';
import { toggleCondition } from './effects';
import { applyDamage, resolveConcentrationSave, type ResolveConcentrationSavePayload } from './hp';
import { runCommand } from './runner';
import { castSpell, endConcentration } from './spells';
import { freshState, Session, withLive } from './test-utils';
import { advanceTime } from './time';

function concentrating(tempHp = 0, self = false) {
  const session = new Session(withLive(freshState, { tempHp }));
  session.run(
    castSpell,
    self
      ? { spellId: 'spell.invisibility', slotLevel: 2, onSelf: true }
      : { spellId: 'spell.faerie-fire', slotLevel: 1 },
  );
  return session;
}

const pending = (session: Session) => session.live.concentration?.pendingSaves ?? [];

describe('pending concentration saves', () => {
  it('queues one request per damage event using original damage even when temp HP absorb everything', () => {
    const session = concentrating(80);
    const before = structuredClone(session.state);
    session.run(applyDamage, { amount: 8 });
    const firstId = session.events.at(-1)!.id;
    session.run(applyDamage, { amount: 22 });
    const secondId = session.events.at(-1)!.id;
    expect(pending(session)).toEqual([
      { id: firstId, dc: 10 },
      { id: secondId, dc: 11 },
    ]);
    expect(firstId).not.toBe(secondId);
    expect(session.live.hp).toBe(19);
    expect(session.live.tempHp).toBe(50);
    session.undo();
    expect(pending(session)).toEqual([{ id: firstId, dc: 10 }]);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('Pass removes only its request, logs the choice and deletes the empty optional field', () => {
    const session = concentrating();
    session.run(applyDamage, { amount: 1 });
    session.run(applyDamage, { amount: 2 });
    const before = structuredClone(session.state);
    const [first, second] = pending(session);
    expect(session.run(resolveConcentrationSave, { saveId: second!.id, outcome: 'pass' })).toBe(
      'Concentration save passed: Faerie Fire (DC 10)',
    );
    expect(pending(session)).toEqual([first]);
    expect(session.live.hp).toBe(16);
    session.run(resolveConcentrationSave, { saveId: first!.id, outcome: 'pass' });
    expect(session.live.concentration?.spellId).toBe('spell.faerie-fire');
    expect(Object.hasOwn(session.live.concentration!, 'pendingSaves')).toBe(false);
    session.undo();
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('Fail ends current concentration, dependent effects and every request, with exact Undo', () => {
    const session = concentrating(0, true);
    session.run(applyDamage, { amount: 1 });
    session.run(applyDamage, { amount: 2 });
    const before = structuredClone(session.state);
    expect(
      session.run(resolveConcentrationSave, { saveId: pending(session)[0]!.id, outcome: 'fail' }),
    ).toBe('Concentration save failed: Invisibility (DC 10); concentration ended');
    expect(session.live.concentration).toBeUndefined();
    expect(session.live.effects).toEqual([]);
    expect(session.live.hp).toBe(16);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('Manual damage suppresses new requests and Info without erasing an existing pending request', () => {
    const session = concentrating();
    session.run(applyDamage, { amount: 1 });
    const requests = structuredClone(pending(session));
    const result = runCommand(applyDamage, session.state, { amount: 2 }, registry, {
      eventId: 'manual-damage',
      realTime: '2026-11-03T08:00:00.000Z',
      automation: 'manual',
    });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.reasons).toEqual([]);
    expect(result.next.live.concentration?.pendingSaves).toEqual(requests);
    expect(result.next.live.hp).toBe(16);
    const resolved = runCommand(
      resolveConcentrationSave,
      result.next,
      { saveId: requests[0]!.id, outcome: 'pass' },
      registry,
      {
        eventId: 'manual-pass',
        realTime: '2026-11-03T08:00:01.000Z',
        automation: 'manual',
        force: true,
      },
    );
    expect(resolved.result).toBe('ok');
    if (resolved.result === 'ok')
      expect(resolved.next.live.concentration?.pendingSaves).toBeUndefined();

    const fresh = concentrating();
    const noRequest = runCommand(applyDamage, fresh.state, { amount: 2 }, registry, {
      eventId: 'manual-no-request',
      realTime: '2026-11-03T08:00:00.000Z',
      automation: 'manual',
    });
    if (noRequest.result !== 'ok') throw new Error(noRequest.reasons.join());
    expect(Object.hasOwn(noRequest.next.live.concentration!, 'pendingSaves')).toBe(false);
  });

  it('rejects stale IDs after a same-spell recast, even if the replacement snapshot otherwise matches', () => {
    const session = concentrating();
    session.run(applyDamage, { amount: 1 });
    const oldId = pending(session)[0]!.id;
    session.run(castSpell, { spellId: 'spell.faerie-fire', slotLevel: 1 });
    expect(pending(session)).toEqual([]);
    session.run(applyDamage, { amount: 1 });
    expect(pending(session)[0]!.id).not.toBe(oldId);
    const before = structuredClone(session.state);
    for (const outcome of ['pass', 'fail'] as const) {
      expect(
        runCommand(resolveConcentrationSave, session.state, { saveId: oldId, outcome }, registry, {
          eventId: `stale-${outcome}`,
          realTime: '2026-11-03T08:00:00.000Z',
          automation: 'manual',
          force: true,
        }),
      ).toEqual({ result: 'blocked', reasons: ['That concentration save is no longer pending'] });
    }
    expect(session.state).toEqual(before);
  });

  it.each(['replacement', 'end', 'expiry', 'incapacitated', 'down', 'dead'] as const)(
    '%s naturally clears concentration-owned requests, and Undo restores them',
    (cause) => {
      const session = concentrating();
      session.run(applyDamage, { amount: 1 });
      const before = structuredClone(session.state);
      const id = pending(session)[0]!.id;
      if (cause === 'replacement')
        session.run(castSpell, { spellId: 'spell.invisibility', slotLevel: 2 });
      if (cause === 'end') session.run(endConcentration, null);
      if (cause === 'expiry') session.run(advanceTime, { seconds: 60 });
      if (cause === 'incapacitated') session.run(toggleCondition, { condition: 'stunned' });
      if (cause === 'down') session.run(applyDamage, { amount: 18 });
      if (cause === 'dead') session.run(applyDamage, { amount: 40 });
      expect(pending(session)).toEqual([]);
      expect(
        session.preview(resolveConcentrationSave, { saveId: id, outcome: 'fail' }).result,
      ).toBe('blocked');
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('cannot retain or create requests after damage at 0 HP, including a conditionless import', () => {
    const original = concentrating().state;
    const session = new Session(
      withLive(original, {
        hp: 0,
        tempHp: 5,
        conditions: [],
        concentration: {
          ...original.live.concentration!,
          pendingSaves: [{ id: 'imported-save', dc: 10 }],
        },
      }),
    );
    session.run(applyDamage, { amount: 1 });
    expect(session.live.hp).toBe(0);
    expect(session.live.deathSaves.fail).toBe(1);
    expect(session.live.concentration).toBeUndefined();
  });

  it.each([
    null,
    {},
    [],
    { saveId: 'missing', outcome: 'pass' },
    { saveId: '', outcome: 'pass' },
    { saveId: 1, outcome: 'fail' },
    { saveId: 'e2', outcome: true },
    { saveId: 'e2', outcome: 'cancel' },
    { saveId: 'e2', outcome: 'pass', extra: true },
  ])(
    'strictly blocks invalid/stale resolutions without mutation under force/Manual (%j)',
    (payload) => {
      const session = concentrating();
      session.run(applyDamage, { amount: 1 });
      const before = structuredClone(session.state);
      const result = runCommand(
        resolveConcentrationSave,
        session.state,
        payload as ResolveConcentrationSavePayload,
        registry,
        {
          eventId: 'invalid-resolution',
          realTime: '2026-11-03T08:00:00.000Z',
          automation: 'manual',
          force: true,
        },
      );
      expect(result.result).toBe('blocked');
      expect(session.state).toEqual(before);
    },
  );

  it('keeps legacy optional shape and validates DCs, IDs and unique pending requests', () => {
    const legacy = concentrating().live;
    expect(Object.hasOwn(LiveStateSchema.parse(legacy).concentration!, 'pendingSaves')).toBe(false);
    for (const pendingSaves of [
      [{ id: '', dc: 10 }],
      [{ id: 'one', dc: 9 }],
      [{ id: 'one', dc: 10.5 }],
      [{ id: 'one', dc: 10, extra: true }],
      [
        { id: 'one', dc: 10 },
        { id: 'one', dc: 11 },
      ],
    ])
      expect(
        LiveStateSchema.safeParse({
          ...legacy,
          concentration: { ...legacy.concentration, pendingSaves },
        }).success,
      ).toBe(false);
    expect(
      LiveStateSchema.safeParse({
        ...legacy,
        concentration: {
          ...legacy.concentration,
          pendingSaves: [
            { id: 'one', dc: 10 },
            { id: 'two', dc: 11 },
          ],
        },
      }).success,
    ).toBe(true);
  });
});
