import { useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ChevronLeft, Ellipsis, Moon, Tent } from 'lucide-react';
import { cx } from '../cx';
import { Sheet } from '../components/Sheet';
import { useCharacterBase } from '../hooks/useCharacterBase';
import { useRest } from '../rest/rest-context';
import { BOTTOM_NAV, NAV, navPath } from './nav';

const tab =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs transition-colors duration-(--omni-motion-hover)';

/** < 640 px: Home · Combat · Spells · Inv · More. More holds the rest, rests, and the way back to campaigns. */
export function BottomNav() {
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  const { openShortRest, openLongRest } = useRest();
  const moreButton = useRef<HTMLButtonElement>(null);
  const openingRest = useRef<'short' | 'long' | null>(null);
  const base = useCharacterBase();
  // BOTTOM_NAV order, not sidebar order (SPEC §3: Home · Combat · Spells · Inventory).
  const direct = BOTTOM_NAV.flatMap((to) => NAV.filter((n) => n.to === to));
  const rest = NAV.filter((n) => !BOTTOM_NAV.includes(n.to));
  const moreActive = rest.some((n) => navPath(base, n.to) === pathname);

  return (
    <nav
      aria-label="Main"
      data-tour="nav"
      className="omni-bar fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {direct.map(({ to, short, icon: Glyph }) => (
        <NavLink
          key={to}
          to={navPath(base, to)}
          end={to === ''}
          className={({ isActive }) => cx(tab, isActive ? 'text-accent' : 'text-text-muted')}
        >
          <Glyph size={20} aria-hidden />
          {short}
        </NavLink>
      ))}
      <button
        ref={moreButton}
        type="button"
        onClick={() => setMore(true)}
        className={cx(tab, moreActive ? 'text-accent' : 'text-text-muted')}
      >
        <Ellipsis size={20} aria-hidden />
        More
      </button>
      <Sheet
        open={more}
        onOpenChange={setMore}
        title="More"
        onCloseAutoFocus={(event) => {
          if (!openingRest.current) return;
          event.preventDefault();
          const open = openingRest.current === 'short' ? openShortRest : openLongRest;
          openingRest.current = null;
          open(moreButton.current ?? undefined);
        }}
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              openingRest.current = 'short';
              setMore(false);
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-btn border border-border bg-surface text-text"
          >
            <Tent size={18} aria-hidden /> Short Rest
          </button>
          <button
            type="button"
            onClick={() => {
              openingRest.current = 'long';
              setMore(false);
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-btn border border-border bg-surface text-text"
          >
            <Moon size={18} aria-hidden /> Long Rest
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {rest.map(({ to, label, icon: Glyph }) => (
            <li key={to}>
              <NavLink
                to={navPath(base, to)}
                onClick={() => setMore(false)}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-12 items-center gap-3 rounded-btn px-3',
                    isActive ? 'bg-surface text-accent' : 'text-text hover:bg-surface',
                  )
                }
              >
                <Glyph size={18} aria-hidden className="text-text-muted" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <Link
          to="/"
          className="mt-3 flex min-h-12 items-center gap-3 rounded-btn border-t border-border px-3 pt-3 text-text-muted hover:text-text"
        >
          <ChevronLeft size={18} aria-hidden />
          All campaigns
        </Link>
      </Sheet>
    </nav>
  );
}
