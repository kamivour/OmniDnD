import { useId } from 'react';
import type { Stat } from '../../engine/calc/stat';
import { cx } from '../cx';
import { Preview } from './Preview';
import { StatBreakdown } from './StatBreakdown';

interface StatChipProps {
  label: string;
  value: string | number;
  className?: string;
  stat?: Stat;
  breakdownLabel?: string;
  override?: Stat['override'];
}

/** Display-only unless a computed value supplies its engine-owned breakdown. */
export function StatChip({
  label,
  value,
  className,
  stat,
  breakdownLabel = label,
  override,
}: StatChipProps) {
  const valueId = useId();
  if (stat) {
    return (
      <Preview title={breakdownLabel} content={<StatBreakdown stat={stat} />}>
        {({ ref, props }) => (
          <button
            ref={ref}
            {...props}
            type="button"
            aria-label={`Show ${breakdownLabel} breakdown`}
            aria-describedby={[valueId, props['aria-describedby']].filter(Boolean).join(' ')}
            className={cx(
              'inline-flex min-h-11 min-w-11 max-w-full items-center justify-between gap-2 rounded-btn px-2 text-left hover:bg-surface-2',
              className,
            )}
          >
            <span className="text-xs text-text-muted">{label}</span>
            <span id={valueId} className="min-w-0 text-right font-semibold break-all text-text">
              {value}
              <OverrideMarker override={stat.override ?? override} />
            </span>
          </button>
        )}
      </Preview>
    );
  }
  return (
    <span className={cx('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-semibold text-text">
        {value}
        <OverrideMarker override={override} />
      </span>
    </span>
  );
}

export function OverrideMarker({ override }: { override?: { note: string } }) {
  return override ? (
    <span
      role="img"
      aria-label={`Overridden: ${override.note}`}
      title={override.note}
      className="ml-1 text-accent"
    >
      ✎
    </span>
  ) : null;
}
