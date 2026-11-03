import { cx } from '../cx';

interface PipRowProps {
  label: string;
  max: number;
  used: number;
  tone?: 'magic' | 'accent';
  /** Show the label text before the pips. */
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** Bounded resource rows can wrap large pools without shrinking their pips. */
  wrap?: boolean;
}

/** Remaining uses as filled pips, spent uses as empty rings. Live state stores "used" (D6). */
export function PipRow({
  label,
  max,
  used,
  tone = 'magic',
  showLabel = true,
  size = 'md',
  className,
  wrap = false,
}: PipRowProps) {
  const left = Math.max(0, max - used);
  const dot = size === 'sm' ? 'size-2' : 'size-2.5';
  const fill = tone === 'magic' ? 'border-magic bg-magic' : 'border-accent bg-accent';
  return (
    <span
      role="img"
      aria-label={`${label}: ${left} of ${max} left`}
      className={cx('inline-flex items-center gap-1.5', wrap && 'min-w-0 max-w-full', className)}
    >
      {showLabel && <span className="text-xs text-text-muted">{label}</span>}
      <span className={cx('inline-flex gap-1', wrap && 'max-w-full flex-wrap justify-center')}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={cx(
              'rounded-full border transition-colors duration-(--omni-motion-pip)',
              dot,
              i < left ? fill : 'border-text-muted bg-transparent',
            )}
          />
        ))}
      </span>
    </span>
  );
}
