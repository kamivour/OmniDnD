import { cx } from '../cx';

interface StatChipProps {
  label: string;
  value: string | number;
  className?: string;
}

/** Small label + value pair. Breakdown tooltip arrives with the engine (M7). */
export function StatChip({ label, value, className }: StatChipProps) {
  return (
    <span className={cx('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="font-semibold text-text">{value}</span>
    </span>
  );
}
