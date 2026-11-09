import { Link } from 'react-router';
import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import type { SyncStatus } from '../../sync/auto-sync';
import { useAutoSyncState } from '../../sync/service';
import { cx } from '../cx';

const SYNC_CHIP: Record<
  Exclude<SyncStatus, 'signed-out'>,
  { label: string; tone: string }
> = {
  idle: { label: 'Synced', tone: 'text-text-muted' },
  syncing: { label: 'Syncing', tone: 'text-text-muted' },
  offline: { label: 'Offline', tone: 'text-text-muted' },
  error: { label: 'Sync problem', tone: 'text-danger' },
  'needs-choice': { label: 'Needs your choice', tone: 'text-danger' },
};

const GLYPH = {
  idle: Cloud,
  syncing: RefreshCw,
  offline: CloudOff,
  error: AlertTriangle,
  'needs-choice': AlertTriangle,
} as const;

/** Top-bar sync state for a signed-in account. Opens Settings, where choices are made. */
export default function SyncChip({ to }: { to: string }) {
  const { status } = useAutoSyncState();
  if (status === 'signed-out') return null;
  const { label, tone } = SYNC_CHIP[status];
  const Glyph = GLYPH[status];
  return (
    <Link
      to={to}
      title={`${label}. Open account settings.`}
      className={cx(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-btn px-2 text-xs hover:bg-surface',
        tone,
      )}
    >
      <Glyph size={16} aria-hidden className={status === 'syncing' ? 'animate-spin' : undefined} />
      <span role="status" className={status === 'needs-choice' ? undefined : 'sr-only'}>
        {label}
      </span>
    </Link>
  );
}
