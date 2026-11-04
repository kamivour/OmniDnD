export interface LogEntry {
  id: string;
  round?: number;
  text: string;
  time?: string;
  override?: boolean;
  undone?: boolean;
  source?: 'character' | 'workspace';
}

/** Full log, newest first. */
export function LogList({ entries, label }: { entries: readonly LogEntry[]; label?: string }) {
  if (entries.length === 0) return <p className="text-sm text-text-muted">No commands yet.</p>;
  return (
    <ol aria-label={label} className="flex min-w-0 flex-col divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} data-source={e.source} className="flex gap-3 py-2">
          {e.round !== undefined && (
            <span className="w-10 shrink-0 text-xs text-text-muted">Rd {e.round}</span>
          )}
          <div className="min-w-0 flex-1">
            {e.source && (
              <p className="text-xs text-accent">
                {e.source === 'workspace' ? 'Workspace' : 'Character'}
              </p>
            )}
            {e.time && <p className="text-xs text-text-muted">{e.time}</p>}
            <p
              className={`wrap-anywhere text-sm ${e.undone ? 'text-text-muted line-through' : 'text-text'}`}
            >
              {e.text}
            </p>
            {(e.override || e.undone) && (
              <p className="flex flex-wrap gap-2 text-xs">
                {e.override && <span className="text-warn">Override</span>}
                {e.undone && <span className="text-text-muted">Undone</span>}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
