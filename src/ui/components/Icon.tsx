import { GAME_ICONS, type GameIcon } from '../icons/game-icons';
import { cx } from '../cx';

const ICONS: Partial<Record<string, GameIcon>> = GAME_ICONS;

interface IconProps {
  /** Content id, e.g. `spell.faerie-fire`. */
  id: string;
  /** Used when `id` has no icon, e.g. `school.evocation`. */
  fallback?: string;
  /** 20 px in lists, 40 px in detail panels (DESIGN.md §4). */
  size?: 16 | 20 | 40;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
  className?: string;
}

/** Monochrome game-icons.net glyph. Renders a neutral diamond when nothing matches. */
export function Icon({ id, fallback, size = 20, label, className }: IconProps) {
  const icon = ICONS[id] ?? (fallback ? ICONS[fallback] : undefined);
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      className={cx('shrink-0', className)}
      {...a11y}
    >
      {icon ? <path d={icon.d} /> : <path d="M256 48 464 256 256 464 48 256Z" />}
    </svg>
  );
}
