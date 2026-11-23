import { GAME_ICONS } from '../icons/game-icons';
import { iconGlyph } from '../icons/character-icons';
import { cx } from '../cx';

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
  const glyph = iconGlyph(id, fallback);
  const icon = glyph && GAME_ICONS[glyph];
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="currentColor"
      data-glyph={glyph}
      className={cx('shrink-0', className)}
      {...a11y}
    >
      {glyph === 'class.paladin' ? (
        <g
          transform="scale(21.3333)"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <path fill="none" d="M12 2 21 5.5v5.2c0 5.3-3.9 9.2-9 11.3-5.1-2.1-9-6-9-11.3V5.5z" />
          <path stroke="none" d="M8 6.7h8v3.7h-3.1v7.1h-1.8v-7.1H8z" transform="rotate(28 12 12)" />
        </g>
      ) : icon ? (
        <path d={icon.d} />
      ) : (
        <path d="M256 48 464 256 256 464 48 256Z" />
      )}
    </svg>
  );
}
