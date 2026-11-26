import { useId } from 'react';
import { cx } from '../cx';
import { ALIGNMENTS } from '../fixtures/new-character';

/**
 * The nine alignments as a 3×3 grid: law to chaos across, good to evil down.
 * ALIGNMENTS is already in that reading order. Optional, so a pick can be cleared.
 */
export function AlignmentGrid({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const group = useId();
  return (
    <fieldset className={cx('min-w-0 rounded-card border border-border p-3', className)}>
      <legend className="px-1 font-semibold text-text">Alignment</legend>
      <div className="grid max-w-lg grid-cols-3 gap-2">
        {ALIGNMENTS.map((name) => {
          const selected = name === value;
          return (
            <label
              key={name}
              className={cx(
                'grid min-h-14 cursor-pointer place-items-center rounded-card border p-2 text-center text-sm hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
                selected
                  ? 'border-accent bg-surface-2 font-semibold text-accent'
                  : 'border-border bg-surface text-text',
              )}
            >
              <input
                type="radio"
                name={group}
                value={name}
                checked={selected}
                onChange={() => onChange(name)}
                className="sr-only"
              />
              {name}
            </label>
          );
        })}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="mt-2 text-sm text-text-muted underline hover:text-text"
        >
          Clear alignment
        </button>
      )}
    </fieldset>
  );
}
