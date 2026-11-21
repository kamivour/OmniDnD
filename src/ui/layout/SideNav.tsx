import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cx } from '../cx';
import { ThemeTitle } from '../theme/ThemeTitle';
import { useCharacterBase } from '../hooks/useCharacterBase';
import { NAV, NAV_GROUPS, navGroup, navPath } from './nav';

const item =
  'flex min-h-11 items-center gap-3 rounded-btn px-3 transition-colors duration-(--omni-motion-hover) justify-center';

/** 640–1023 px: 64 px icon rail. ≥ 1024 px: 220 px with labels. */
export function SideNav() {
  const base = useCharacterBase();
  const [collapsed, setCollapsed] = useState(false);
  const labels = collapsed ? 'sr-only' : 'sr-only lg:not-sr-only';
  return (
    <nav
      aria-label="Main"
      data-tour="nav"
      className={cx(
        'omni-bar sticky top-0 hidden h-dvh w-16 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-bg p-2 sm:flex',
        !collapsed && 'lg:w-55',
      )}
    >
      {!collapsed && (
        <p className="mb-1 hidden px-2 py-1 text-lg lg:block">
          <ThemeTitle />
        </p>
      )}
      <p
        aria-hidden
        className={cx(
          'mb-1 py-1 text-center font-display text-lg text-accent',
          !collapsed && 'lg:hidden',
        )}
      >
        O
      </p>
      <Link
        to="/"
        title="All campaigns"
        className={cx(
          item,
          !collapsed && 'lg:justify-start',
          'mb-2 text-text-muted hover:bg-surface hover:text-text',
        )}
      >
        <ChevronLeft size={20} aria-hidden />
        <span className={labels}>All campaigns</span>
      </Link>
      {NAV_GROUPS.map((group, index) => (
        <div
          key={group.label}
          role="group"
          aria-label={group.label}
          className={cx('flex flex-col gap-1', index > 0 && 'mt-2 border-t border-border pt-2')}
        >
          {navGroup(NAV, group.secondary).map(({ to, label, icon: Glyph }) => (
            <NavLink
              key={to}
              to={navPath(base, to)}
              end={to === ''}
              title={label}
              className={({ isActive }) =>
                cx(
                  item,
                  !collapsed && 'lg:justify-start',
                  isActive
                    ? 'bg-surface-2 text-accent'
                    : 'text-text-muted hover:bg-surface hover:text-text',
                )
              }
            >
              <Glyph size={20} aria-hidden />
              <span className={labels}>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
      <button
        type="button"
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        onClick={() => setCollapsed(!collapsed)}
        className="mt-auto hidden min-h-11 items-center justify-center gap-2 rounded-btn text-text-muted hover:bg-surface hover:text-text lg:flex"
      >
        {collapsed ? (
          <PanelLeftOpen size={20} aria-hidden />
        ) : (
          <>
            <PanelLeftClose size={20} aria-hidden />
            <span>Collapse</span>
          </>
        )}
      </button>
    </nav>
  );
}
