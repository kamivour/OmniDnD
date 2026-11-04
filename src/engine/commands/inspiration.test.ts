import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { ExportFileSchema, LiveStateSchema } from '../schema';
import { setInspiration, type SetInspirationPayload } from './inspiration';
import { runCommand, undo } from './runner';
import { freshState, Session, withLive } from './test-utils';

const options = { eventId: 'inspiration-change', realTime: '2026-11-04T10:00:00.000Z' };

describe('ordinary Inspiration compatibility', () => {
  it('reads legacy absence as false without adding or rewriting the field', () => {
    const before = structuredClone(seed);
    const parsed = ExportFileSchema.parse(seed);
    expect(parsed.live.inspiration ?? false).toBe(false);
    expect(parsed.live).not.toHaveProperty('inspiration');
    expect(parsed).toEqual(before);
    expect(ExportFileSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(seed).toEqual(before);
  });

  it.each([true, false])('round-trips an explicit Inspiration value of %s', (inspiration) => {
    const file = ExportFileSchema.parse({ ...seed, live: { ...seed.live, inspiration } });
    expect(file.live.inspiration).toBe(inspiration);
    expect(ExportFileSchema.parse(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  it.each([null, 0, 1, 'false', [], {}])('rejects invalid saved Inspiration %j', (inspiration) => {
    expect(LiveStateSchema.safeParse({ ...freshState.live, inspiration }).success).toBe(false);
  });
});

describe('setInspiration', () => {
  it.each(['assisted', 'manual'] as const)(
    'logs only the chosen field in %s mode and Undo restores legacy absence exactly',
    (automation) => {
      const before = structuredClone(freshState);
      const result = runCommand(setInspiration, freshState, { inspired: true }, registry, {
        ...options,
        automation,
      });
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
      expect(result.next).toEqual({ ...before, live: { ...before.live, inspiration: true } });
      expect(result.event).toMatchObject({
        command: 'setInspiration',
        text: 'Inspiration on',
        patches: [{ op: 'add', path: ['live', 'inspiration'], value: true }],
        inversePatches: [{ op: 'remove', path: ['live', 'inspiration'] }],
      });
      expect(result.event.override).toBeUndefined();
      expect(freshState).toEqual(before);
      const file = ExportFileSchema.parse(
        JSON.parse(JSON.stringify({ ...seed, ...result.next, events: [result.event] })),
      );
      const restored = undo(
        { campaign: file.campaign, build: file.build, live: file.live },
        file.events,
        { ...options, eventId: 'undo-inspiration-change' },
      );
      expect(restored.result).toBe('ok');
      if (restored.result !== 'ok') throw new Error(restored.reasons.join('; '));
      expect(restored.next).toEqual(before);
      expect(restored.next.live).not.toHaveProperty('inspiration');
    },
  );

  it.each([true, false])(
    'turns off explicit Inspiration %s without touching Bardic Inspiration',
    (inspiration) => {
      const initial = withLive(freshState, {
        inspiration,
        featureUsesSpent: { 'feature.bard.bardic-inspiration': 2 },
      });
      const session = new Session(initial);
      expect(session.run(setInspiration, { inspired: false })).toBe('Inspiration off');
      expect(session.state).toEqual({ ...initial, live: { ...initial.live, inspiration: false } });
      session.undo();
      expect(session.state).toEqual(initial);
    },
  );

  it.each([
    null,
    [],
    {},
    { inspired: 'true' },
    { inspired: 1 },
    { inspired: null },
    { inspired: true, extra: false },
  ])('blocks invalid payload %j in both modes even when forced', (payload) => {
    const before = structuredClone(freshState);
    for (const automation of ['assisted', 'manual'] as const) {
      expect(
        runCommand(setInspiration, freshState, payload as SetInspirationPayload, registry, {
          ...options,
          automation,
          force: true,
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ['Inspiration details are invalid'],
      });
    }
    expect(freshState).toEqual(before);
  });
});
