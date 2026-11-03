import { describe, expect, it } from 'vitest';
import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { ExportFileSchema, type LogEvent } from '../schema';
import { appendEvent, runCommand, undo, type Check, type Command } from './runner';

const fool = ExportFileSchema.parse(seed);
const state: CharacterState = { campaign: fool.campaign, build: fool.build, live: fool.live };
const options = (eventId: string) => ({ eventId, realTime: '2026-11-02T10:00:00.000Z' });

/** Test command: loses HP, with whatever checks the test asks for. */
const loseHp = (checks: Check[] = []): Command<number> => ({
  name: 'loseHp',
  check: () => checks,
  apply: (draft, amount) => {
    draft.live.hp -= amount;
    return `Lose ${amount} HP`;
  },
});

function ok(result: ReturnType<typeof runCommand>) {
  if (result.result !== 'ok') throw new Error(`Expected ok, got ${result.result}`);
  return result;
}

describe('runCommand', () => {
  it('applies the change and logs an event with undo patches', () => {
    const { next, event, reasons } = ok(runCommand(loseHp(), state, 3, registry, options('e1')));
    expect(next.live.hp).toBe(state.live.hp - 3);
    expect(next.campaign).toBe(state.campaign);
    expect(state.live.hp).toBe(11);
    expect(reasons).toEqual([]);
    expect(event).toEqual({
      id: 'e1',
      characterId: 'the-fool',
      realTime: '2026-11-02T10:00:00.000Z',
      gameSeconds: state.live.clock.seconds,
      command: 'loseHp',
      text: 'Lose 3 HP',
      patches: [{ op: 'replace', path: ['live', 'hp'], value: 8 }],
      inversePatches: [{ op: 'replace', path: ['live', 'hp'], value: 11 }],
    });
  });

  it('gives the command the computed sheet', () => {
    let maxHp = 0;
    const peek: Command<null> = {
      name: 'peek',
      apply: (_draft, _payload, ctx) => {
        maxHp = ctx.sheet.maxHp.value;
        return 'Peek';
      },
    };
    ok(runCommand(peek, state, null, registry, options('e1')));
    expect(maxHp).toBe(19);
  });

  it('stops on a Block, even with force or in manual mode', () => {
    const command = loseHp([
      { level: 'block', reason: 'No HP left' },
      { level: 'warn', reason: 'Ignored' },
    ]);
    const blocked = { result: 'blocked', reasons: ['No HP left'] };
    expect(runCommand(command, state, 3, registry, options('e1'))).toEqual(blocked);
    expect(
      runCommand(command, state, 3, registry, {
        ...options('e1'),
        force: true,
        automation: 'manual',
      }),
    ).toEqual(blocked);
  });

  it('passes deterministic event metadata to apply while leaving check/helper context unchanged', () => {
    const metadata: Command<null> = {
      name: 'metadata',
      check: (ctx) => {
        expect(Object.hasOwn(ctx, 'eventId')).toBe(false);
        expect(Object.hasOwn(ctx, 'automation')).toBe(false);
        return [];
      },
      apply: (_draft, _payload, ctx) => `${ctx.eventId}/${ctx.automation}`,
    };
    expect(
      ok(runCommand(metadata, state, null, registry, options('default-event'))).event.text,
    ).toBe('default-event/assisted');
    expect(
      ok(
        runCommand(metadata, state, null, registry, {
          ...options('manual-event'),
          automation: 'manual',
        }),
      ).event.text,
    ).toBe('manual-event/manual');
  });

  it('asks before a Warn and logs an override on "Do anyway"', () => {
    const command = loseHp([{ level: 'warn', reason: 'Reaction already used' }]);
    expect(runCommand(command, state, 3, registry, options('e1'))).toEqual({
      result: 'warn',
      reasons: ['Reaction already used'],
    });
    const { event } = ok(
      runCommand(command, state, 3, registry, { ...options('e1'), force: true }),
    );
    expect(event.override).toBe(true);
  });

  it('returns Info notes without stopping', () => {
    const command = loseHp([{ level: 'info', reason: 'Concentration save DC 10' }]);
    const result = ok(runCommand(command, state, 3, registry, options('e1')));
    expect(result.reasons).toEqual(['Concentration save DC 10']);
    expect(result.event.override).toBeUndefined();
  });

  it('skips Warn and Info in manual mode', () => {
    const command = loseHp([
      { level: 'warn', reason: 'Reaction already used' },
      { level: 'info', reason: 'Concentration save DC 10' },
    ]);
    const result = ok(
      runCommand(command, state, 3, registry, { ...options('e1'), automation: 'manual' }),
    );
    expect(result.reasons).toEqual([]);
    expect(result.event.override).toBeUndefined();
  });

  it('throws when a command leaves an invalid state', () => {
    expect(() => runCommand(loseHp(), state, 20, registry, options('e1'))).toThrow(
      'loseHp left an invalid live at hp',
    );
  });
});

describe('undo', () => {
  /** Runs commands in order and returns the final state and log. */
  function play(...amounts: number[]) {
    let current = state;
    let events: LogEvent[] = [];
    amounts.forEach((amount, index) => {
      const result = ok(runCommand(loseHp(), current, amount, registry, options(`e${index + 1}`)));
      current = result.next;
      events = appendEvent(events, result.event);
    });
    return { current, events };
  }

  it('reverts the last event, marks it, and logs the undo', () => {
    const { current, events } = play(3, 2);
    const result = undo(current, events, options('u1'));
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.next.live.hp).toBe(8);
    expect(result.events.map(({ id, undoneBy }) => [id, undoneBy])).toEqual([
      ['e1', undefined],
      ['e2', 'u1'],
      ['u1', undefined],
    ]);
    expect(result.event).toMatchObject({
      command: 'undo',
      text: 'Undo: Lose 2 HP',
      patches: [{ op: 'replace', path: ['live', 'hp'], value: 8 }],
      inversePatches: [{ op: 'replace', path: ['live', 'hp'], value: 6 }],
    });
  });

  it('steps back one event at a time and never undoes an undo', () => {
    const { current, events } = play(3, 2);
    const first = undo(current, events, options('u1'));
    if (first.result !== 'ok') throw new Error(first.reasons.join());
    const second = undo(first.next, first.events, options('u2'));
    if (second.result !== 'ok') throw new Error(second.reasons.join());
    expect(second.next.live.hp).toBe(11);
    expect(second.next).toEqual(state);
    expect(undo(second.next, second.events, options('u3'))).toEqual({
      result: 'blocked',
      reasons: ['Nothing to undo'],
    });
  });

  it('undoes a newer command before older ones after an undo', () => {
    const { current, events } = play(3, 2);
    const undone = undo(current, events, options('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    const again = ok(runCommand(loseHp(), undone.next, 1, registry, options('e3')));
    const result = undo(again.next, appendEvent(undone.events, again.event), options('u2'));
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.next.live.hp).toBe(8);
    expect(result.events.find((event) => event.id === 'e3')?.undoneBy).toBe('u2');
  });
});

describe('appendEvent', () => {
  it('keeps only the newest events past the limit', () => {
    const { event } = ok(runCommand(loseHp(), state, 1, registry, options('a')));
    const events = ['a', 'b', 'c'].map((id) => ({ ...event, id }));
    const kept = appendEvent(events, { ...event, id: 'd' }, 3);
    expect(kept.map(({ id }) => id)).toEqual(['b', 'c', 'd']);
  });
});
