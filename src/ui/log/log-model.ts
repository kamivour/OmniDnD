import { formatClock } from '../../engine/clock';
import type { LogEvent } from '../../engine/schema';
import type { LogEntry } from '../components/LogList';

/** Saved history is chronological; display newest first without changing its order. */
export function characterLogEntries(events: readonly LogEvent[]): LogEntry[] {
  return events.toReversed().map((event) => ({
    id: event.id,
    text: event.text,
    time: `${formatClock(event.gameSeconds)}:${String(event.gameSeconds % 60).padStart(2, '0')}`,
    override: event.override === true,
    undone: event.undoneBy !== undefined,
  }));
}

export function canUndoCommand(events: readonly LogEvent[]): boolean {
  return events.some((event) => event.command !== 'undo' && !event.undoneBy);
}
