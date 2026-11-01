import { cx } from '../cx';

const NAMES: Record<string, string> = {
  A: 'Action',
  BA: 'Bonus action',
  R: 'Reaction',
  Passive: 'Passive',
  Rest: 'During a rest',
};

/** Casting time / activation badge: A, BA, R. Text, never color alone. */
export function CostBadge({ cost, className }: { cost: string; className?: string }) {
  return (
    <abbr
      title={NAMES[cost] ?? cost}
      className={cx(
        'inline-grid h-5 min-w-6 place-items-center rounded-btn border border-border px-1 text-xs font-semibold text-text-muted no-underline',
        className,
      )}
    >
      {cost}
    </abbr>
  );
}

/** Concentration marker. Teal, with the letter so it is not color-only. */
export function ConcBadge({ className }: { className?: string }) {
  return (
    <abbr
      title="Concentration"
      className={cx(
        'inline-grid size-5 place-items-center rounded-btn border border-magic text-xs font-semibold text-magic no-underline',
        className,
      )}
    >
      C
    </abbr>
  );
}
