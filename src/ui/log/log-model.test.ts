import { describe, expect, it } from 'vitest';
import { advanceTime, startCombat, startTurn, useEconomy } from '../../engine/commands';
import { freshState, Session, withLive } from '../../engine/commands/test-utils';
import { canUndoCommand, characterLogEntries } from './log-model';

describe('saved command log', () => {
  it('displays newest first while preserving history order and override/undone facts', () => {
    const session = new Session();
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(useEconomy, { kind: 'reaction' });
    session.run(useEconomy, { kind: 'reaction' }, true);
    session.undo();
    const before = structuredClone(session.events);
    const entries = characterLogEntries(session.events);
    expect(entries.map((entry) => entry.id)).toEqual(before.map((event) => event.id).reverse());
    expect(entries[0]?.text).toBe('Undo: Reaction used');
    expect(entries[1]).toMatchObject({ text: 'Reaction used', override: true, undone: true });
    expect(entries[2]).toMatchObject({ text: 'Reaction used', override: false, undone: false });
    expect(session.events).toEqual(before);
  });

  it('uses saved pre-command times including seconds and day boundaries', () => {
    const session = new Session(withLive(freshState, { clock: { seconds: 86399 } }));
    session.run(advanceTime, { seconds: 2 });
    session.run(advanceTime, { seconds: 6 });
    expect(characterLogEntries(session.events).map((entry) => entry.time)).toEqual([
      'Day 2, 00:00:01',
      'Day 1, 23:59:59',
    ]);
  });

  it('disables Undo only when no ordinary command remains, even while undo records remain visible', () => {
    const session = new Session();
    expect(characterLogEntries(session.events)).toEqual([]);
    expect(canUndoCommand(session.events)).toBe(false);
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.undo();
    expect(canUndoCommand(session.events)).toBe(true);
    session.undo();
    expect(session.events).toHaveLength(4);
    expect(canUndoCommand(session.events)).toBe(false);
    session.run(startCombat, null);
    expect(canUndoCommand(session.events)).toBe(true);
  });
});
