import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Sheet } from './Sheet';

export interface LogEntry {
  id: string;
  round?: number;
  text: string;
}

/** Full log, newest first. */
export function LogList({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex gap-3 py-2">
          {e.round !== undefined && (
            <span className="w-10 shrink-0 text-xs text-text-muted">Rd {e.round}</span>
          )}
          <span className="text-text">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** One line: last entry + Undo. "All" opens the full log in a sheet. */
export function LastLogLine({
  entries,
  onUndo,
}: {
  entries: readonly LogEntry[];
  onUndo: () => void;
}) {
  const [open, setOpen] = useState(false);
  const last = entries[0];
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="text-xs text-text-muted">Log</span>
        <span className="truncate text-text">{last?.text ?? 'Nothing yet'}</span>
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!last}
        className="hover-lift inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border bg-surface px-3 text-accent disabled:opacity-40"
      >
        <Undo2 size={16} aria-hidden />
        Undo
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Log">
        <LogList entries={entries} />
      </Sheet>
    </div>
  );
}
