import { lazy, Suspense } from 'react';
import { NavLink } from 'react-router';
import { syncConfig } from '../../sync/config';
import { Avatar } from '../components/Avatar';
import { cx } from '../cx';

const SessionAvatar = syncConfig ? lazy(() => import('./SessionAvatar')) : null;

/** Top-bar link to the Profile screen, showing the account picture. Hidden in guest builds. */
export function ProfileButton({ to }: { to: string }) {
  if (!SessionAvatar) return null;
  return (
    <NavLink
      to={to}
      aria-label="Profile"
      title="Profile"
      className={({ isActive }) =>
        cx(
          'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-btn transition-colors duration-(--omni-motion-hover)',
          isActive ? 'bg-surface-2' : 'hover:bg-surface',
        )
      }
    >
      <Suspense fallback={<Avatar avatar={null} size={28} />}>
        <SessionAvatar size={28} />
      </Suspense>
    </NavLink>
  );
}
