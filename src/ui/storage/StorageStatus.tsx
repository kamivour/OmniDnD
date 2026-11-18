import { lazy, Suspense } from 'react';
import { useStore } from 'zustand';
import { retryPersistence, storageStatusStore } from '../../state/persistence';
import { syncConfig } from '../../sync/config';
import { saveStatusView } from './save-status';
import { SaveStatusLine } from './SaveStatusLine';

const SyncSaveStatus = syncConfig ? lazy(() => import('./SyncSaveStatus')) : null;

/**
 * One status for saving on this device and syncing to the account. A local save failure or
 * conflict comes first, since nothing else is safe until it is fixed.
 */
export function StorageStatus({
  compact = false,
  accountPath = '/profile',
}: {
  compact?: boolean;
  accountPath?: string;
}) {
  const { pending, error, conflict } = useStore(storageStatusStore);
  if (conflict || error) {
    return (
      <div
        role="status"
        aria-label="Save status"
        title={conflict ? 'Save conflict' : 'Save failed'}
        className="flex min-h-11 min-w-0 basis-full flex-wrap items-center gap-2 py-2 text-xs text-warn sm:basis-auto"
      >
        <span>{conflict ? 'Save conflict' : 'Save failed'}</span>
        {conflict && <span>{error}</span>}
        {!conflict && (
          <button
            type="button"
            title={error ?? undefined}
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
  const saving = pending > 0;
  const guest = (
    <SaveStatusLine
      compact={compact}
      accountPath={accountPath}
      view={saveStatusView({ saving, account: 'none', sync: 'signed-out', waiting: false })}
    />
  );
  if (!SyncSaveStatus) return guest;
  return (
    <Suspense fallback={guest}>
      <SyncSaveStatus saving={saving} compact={compact} accountPath={accountPath} />
    </Suspense>
  );
}
