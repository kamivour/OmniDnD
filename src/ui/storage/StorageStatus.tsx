import { useStore } from 'zustand';
import { Check, Clock3 } from 'lucide-react';
import { retryPersistence, storageStatusStore } from '../../state/persistence';

export function StorageStatus({ compact = false }: { compact?: boolean }) {
  const { pending, error, conflict } = useStore(storageStatusStore);
  return (
    <div
      role="status"
      aria-label="Local save status"
      title={
        conflict
          ? 'Save conflict'
          : error
            ? 'Save failed'
            : pending > 0
              ? 'Saving…'
              : 'Saved locally'
      }
      className={`flex min-h-11 min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted ${compact ? 'shrink-0' : 'flex-1'} ${conflict || (compact && error) ? 'basis-full py-2' : ''}`}
    >
      {compact &&
        !error &&
        !conflict &&
        (pending > 0 ? (
          <Clock3 size={14} aria-hidden className="sm:hidden" />
        ) : (
          <Check size={14} aria-hidden className="text-heal sm:hidden" />
        ))}
      <span
        className={error || conflict ? 'text-warn' : compact ? 'sr-only sm:not-sr-only' : undefined}
      >
        {conflict
          ? 'Save conflict'
          : error
            ? 'Save failed'
            : pending > 0
              ? 'Saving…'
              : 'Saved locally'}
      </span>
      {conflict && <span className="text-warn">{error}</span>}
      {error && !conflict && (
        <button
          type="button"
          title={error}
          onClick={() => {
            void retryPersistence().catch(() => undefined);
          }}
          className="min-h-11 px-2 text-accent"
        >
          Retry save
        </button>
      )}
    </div>
  );
}
