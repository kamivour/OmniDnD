import { useStore } from 'zustand';
import { retryPersistence, storageStatusStore } from '../../state/persistence';

export function StorageStatus() {
  const { pending, error, conflict } = useStore(storageStatusStore);
  return (
    <div
      role="status"
      aria-label="Local save status"
      className={`flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-2 text-xs text-text-muted ${conflict ? 'basis-full py-2' : ''}`}
    >
      <span className={error ? 'text-warn' : undefined}>
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
