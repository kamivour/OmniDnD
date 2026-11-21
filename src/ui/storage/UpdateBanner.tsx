import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useStore } from 'zustand';
import { storageStatusStore } from '../../state/persistence';
import { activateWaitingUpdate, watchForUpdate } from './app-update';

/**
 * Tells the player a new version is ready and switches on tap. Without this, an update
 * waits until every window of the app closes, which an installed phone app rarely does.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useStore(storageStatusStore, (s) => s.pending > 0);
  useEffect(() => watchForUpdate(() => setReady(true)), []);
  if (!ready) return null;
  return (
    <div
      role="status"
      aria-label="App update"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div className="flex max-w-md flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-3 py-2 text-sm shadow-lg">
        <span>A new version of OmniDnD is ready.</span>
        <button
          type="button"
          disabled={busy || pending}
          onClick={() => {
            setBusy(true);
            void activateWaitingUpdate().then((reloading) => {
              if (!reloading) window.location.reload();
            });
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn bg-accent px-3 font-semibold text-bg disabled:opacity-60"
        >
          <RefreshCw size={16} aria-hidden />
          {pending ? 'Saving…' : 'Update now'}
        </button>
        <button
          type="button"
          onClick={() => setReady(false)}
          className="min-h-11 px-2 text-text-muted underline"
        >
          Later
        </button>
      </div>
    </div>
  );
}
