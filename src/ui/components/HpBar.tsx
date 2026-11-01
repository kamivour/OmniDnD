import { cx } from '../cx';
import { hpTone } from '../format';

const FILL = { heal: 'bg-heal', warn: 'bg-warn', danger: 'bg-danger' } as const;

export function HpBar({
  current,
  max,
  className,
}: {
  current: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return (
    <span
      aria-hidden
      className={cx('block h-1.5 overflow-hidden rounded-full bg-surface-2', className)}
    >
      <span
        className={cx(
          'block h-full rounded-full transition-[width] duration-(--omni-motion-bar)',
          FILL[hpTone(current, max)],
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}
