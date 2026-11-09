import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { Library, Settings } from 'lucide-react';
import { cx } from '../cx';
import { FindLauncher } from '../find/FindLauncher';
import { SyncChipSlot } from '../settings/SyncChipSlot';
import { StorageStatus } from '../storage/StorageStatus';

const LINKS = [
  { to: '/reference', label: 'Reference', icon: Library },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** App-level screens (campaigns, setup, new character). No HUD: no character is open. */
export function HubFrame() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-bg px-4">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2">
          <Link to="/" className="rounded-btn font-display text-lg text-accent">
            OmniDnD
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <SyncChipSlot to="/settings" />
            <FindLauncher withCharacter={false} />
            {LINKS.map(({ to, label, icon: Glyph }) => (
              <NavLink
                key={to}
                to={to}
                data-tour={to === '/settings' ? 'settings' : undefined}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-btn px-2 sm:px-3 transition-colors duration-(--omni-motion-hover)',
                    isActive
                      ? 'bg-surface-2 text-accent'
                      : 'text-text-muted hover:bg-surface hover:text-text',
                  )
                }
              >
                <Glyph size={18} aria-hidden />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4">
        <StorageStatus />
      </div>
      <main id="hub-workspace" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6">
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
