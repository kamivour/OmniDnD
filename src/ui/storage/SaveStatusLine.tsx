import { Link } from 'react-router';
import {
  AlertTriangle,
  Check,
  Clock3,
  Cloud,
  CloudOff,
  HardDrive,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../cx';
import { scrollToAnchor } from '../find/anchor';
import type { SaveIcon, SaveStatusView } from './save-status';

const GLYPH: Record<SaveIcon, LucideIcon> = {
  saved: Check,
  saving: Clock3,
  synced: Cloud,
  syncing: RefreshCw,
  offline: CloudOff,
  alert: AlertTriangle,
  device: HardDrive,
};

const TONE: Record<SaveStatusView['tone'], string> = {
  muted: 'text-text-muted',
  ok: 'text-heal',
  warn: 'text-warn',
  danger: 'text-danger',
};

export interface SaveStatusLineProps {
  view: SaveStatusView;
  /** Character bar: icon only on phones unless the status needs attention. */
  compact?: boolean;
  /** Settings route that holds the account section, for the status link. */
  accountPath: string;
}

/** The visible save and sync status. Guest and account builds share it. */
export function SaveStatusLine({ view, compact = false, accountPath }: SaveStatusLineProps) {
  const Glyph = GLYPH[view.icon];
  const tone = TONE[view.tone];
  const { action } = view;
  return (
    <div
      role="status"
      aria-label="Save status"
      title={view.label}
      className={cx(
        'flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 text-xs text-text-muted',
        compact ? 'shrink-0' : 'flex-1',
        compact && view.prominent && 'basis-full sm:basis-auto',
      )}
    >
      <Glyph
        size={14}
        aria-hidden
        className={cx(
          'shrink-0',
          view.tone === 'muted' && view.icon === 'saved' ? 'text-heal' : tone,
          view.icon === 'syncing' && 'animate-spin motion-reduce:animate-none',
        )}
      />
      <span
        className={cx(
          view.tone === 'muted' || view.tone === 'ok' ? undefined : tone,
          compact && !view.prominent && 'sr-only sm:not-sr-only',
        )}
      >
        {view.label}
      </span>
      {action && (
        <Link
          to={accountPath}
          onClick={() => scrollToAnchor(action.anchor)}
          className="flex min-h-11 items-center px-1 text-accent underline-offset-2 hover:underline"
        >
          {action.text}
        </Link>
      )}
    </div>
  );
}
