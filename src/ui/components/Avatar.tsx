import { isAvatar } from '../../sync/avatar';
import { cx } from '../cx';

/**
 * A player's profile picture, or the default mask when they have none. Decorative by
 * default: the name next to it carries the meaning. Pass `label` when it stands alone.
 */
export function Avatar({
  avatar,
  size,
  label,
  className,
}: {
  avatar: string | null | undefined;
  size: number;
  label?: string;
  className?: string;
}) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  if (isAvatar(avatar)) {
    return (
      <img
        src={avatar}
        alt={label ?? ''}
        width={size}
        height={size}
        className={cx('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      {...a11y}
      data-avatar="mask"
      className={cx('shrink-0 rounded-full', className)}
    >
      <circle cx="16" cy="16" r="16" fill="var(--omni-surface-2)" />
      {/* A plain masquerade mask: the face behind it is the player's own business. */}
      <path
        d="M5 13.5c0-2 1.6-3.2 3.6-3 2.6.3 4.7 1.4 7.4 1.4s4.8-1.1 7.4-1.4c2-.2 3.6 1 3.6 3 0 4.3-2.6 7.5-5.6 7.5-2.2 0-3.6-1.6-5.4-1.6s-3.2 1.6-5.4 1.6c-3 0-5.6-3.2-5.6-7.5Z"
        fill="var(--omni-accent)"
      />
      <ellipse cx="11" cy="15" rx="2.4" ry="1.6" fill="var(--omni-surface-2)" />
      <ellipse cx="21" cy="15" rx="2.4" ry="1.6" fill="var(--omni-surface-2)" />
      <path
        d="M12.5 24.5c1.2.8 2.3 1.1 3.5 1.1s2.3-.3 3.5-1.1"
        fill="none"
        stroke="var(--omni-text-muted)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
