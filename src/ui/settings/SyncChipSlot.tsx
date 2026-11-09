import { lazy, Suspense } from 'react';
import { syncConfig } from '../../sync/config';

const SyncChip = syncConfig ? lazy(() => import('./SyncChip')) : null;

/** Renders nothing in guest builds, so the sync code never loads for them. */
export function SyncChipSlot({ to }: { to: string }) {
  if (!SyncChip) return null;
  return (
    <Suspense fallback={null}>
      <SyncChip to={to} />
    </Suspense>
  );
}
