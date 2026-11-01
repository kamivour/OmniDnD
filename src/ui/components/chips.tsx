import { X } from 'lucide-react';
import { cx } from '../cx';
import { ConcBadge } from './CostBadge';

/** Concentration chip: "C" + spell name (+ time left) + ✕ to end. The ✕ hit area is 44 px. */
export function ConcentrationChip({
  name,
  remaining,
  onEnd,
  className,
}: {
  name: string;
  remaining?: string;
  onEnd: () => void;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-btn border border-magic pl-1 text-xs text-magic',
        className,
      )}
    >
      <ConcBadge className="size-4 border-0" />
      <span className="truncate">{name}</span>
      {remaining && <span className="shrink-0 text-text-muted">{remaining}</span>}
      <button
        type="button"
        onClick={onEnd}
        aria-label={`End concentration on ${name}`}
        className="relative grid size-6 shrink-0 place-items-center rounded-btn hover:text-text after:absolute after:-inset-2.5"
      >
        <X size={14} aria-hidden />
      </button>
    </span>
  );
}

/** Effect on you with time left. Teal, with text, never color alone. */
export function EffectChip({ name, remaining }: { name: string; remaining: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-btn border border-magic/60 px-2 text-xs text-text">
      {name}
      <span className="text-magic">{remaining}</span>
    </span>
  );
}
