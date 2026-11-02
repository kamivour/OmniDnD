import { useEffect, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { initializePersistence, storageStatusStore } from '../../state/persistence';

/** Saved records must validate before any character screen can act on them. */
export function StorageGate({ children }: { children: ReactNode }) {
  const status = useStore(storageStatusStore);
  useEffect(() => {
    void initializePersistence().catch(() => undefined);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const current = storageStatusStore.getState();
      if (current.ready && (current.pending > 0 || current.error)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  if (status.ready) return children;
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-16">
      {status.error ? (
        <>
          <h1 className="font-display text-lg">Local storage unavailable</h1>
          <p role="alert" className="text-warn">
            {status.error}
          </p>
          <p className="text-text-muted">
            Saved data has not been reset. Retry after storage is available.
          </p>
          <button
            type="button"
            onClick={() => {
              void initializePersistence().catch(() => undefined);
            }}
            className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg"
          >
            Retry loading
          </button>
        </>
      ) : (
        <p role="status">Loading saved characters…</p>
      )}
    </main>
  );
}
