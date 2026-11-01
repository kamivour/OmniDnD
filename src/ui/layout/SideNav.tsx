import { Link, NavLink } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cx } from '../cx';
import { useCharacterBase } from '../hooks/useCharacterBase';
import { NAV, NAV_DIVIDER_BEFORE, navPath } from './nav';

const item =
  'flex min-h-11 items-center gap-3 rounded-btn px-3 transition-colors duration-(--omni-motion-hover) justify-center lg:justify-start';

/** 640–1023 px: 64 px icon rail. ≥ 1024 px: 220 px with labels. */
export function SideNav() {
  const base = useCharacterBase();
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col gap-1 border-r border-border bg-bg p-2 sm:flex lg:w-55"
    >
      <p className="mb-1 hidden px-2 py-1 font-display text-lg text-accent lg:block">OmniDnD</p>
      <p aria-hidden className="mb-1 py-1 text-center font-display text-lg text-accent lg:hidden">
        O
      </p>
      <Link
        to="/"
        title="All campaigns"
        className={cx(item, 'mb-2 text-text-muted hover:bg-surface hover:text-text')}
      >
        <ChevronLeft size={20} aria-hidden />
        <span className="sr-only lg:not-sr-only">All campaigns</span>
      </Link>
      {NAV.map(({ to, label, icon: Glyph }) => (
        <div key={to} className="contents">
          {to === NAV_DIVIDER_BEFORE && <hr className="my-2 border-border" />}
          <NavLink
            to={navPath(base, to)}
            end={to === ''}
            title={label}
            className={({ isActive }) =>
              cx(
                item,
                isActive
                  ? 'bg-surface-2 text-accent'
                  : 'text-text-muted hover:bg-surface hover:text-text',
              )
            }
          >
            <Glyph size={20} aria-hidden />
            <span className="sr-only lg:not-sr-only">{label}</span>
          </NavLink>
        </div>
      ))}
    </nav>
  );
}
