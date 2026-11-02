import { cx } from '../cx';
import { PipRow } from './PipRow';

interface PipStepperProps {
  /** Accessible name of the resource, e.g. "Level 1 spell slots". */
  label: string;
  max: number;
  used: number;
  tone?: 'magic' | 'accent';
  onUse: () => void;
  onRestore: () => void;
  /** Enable direct pip adjustments; receives the aggregate number of used pips. */
  onSetUsed?: (used: number) => void;
  className?: string;
}

/**
 * Manual adjust: [−] pips count [+]. The pips sit between the buttons so the two
 * 44 px targets are never next to each other (fewer mis-taps).
 */
export function PipStepper({
  label,
  max,
  used,
  tone = 'magic',
  onUse,
  onRestore,
  onSetUsed,
  className,
}: PipStepperProps) {
  const left = Math.max(0, max - used);
  const fill = tone === 'magic' ? 'border-magic bg-magic' : 'border-accent bg-accent';

  return (
    <span
      role={onSetUsed ? 'group' : undefined}
      aria-label={onSetUsed ? label : undefined}
      className={cx('inline-flex shrink-0 items-center', onSetUsed ? 'gap-1' : 'gap-2', className)}
    >
      <StepButton label={`Use one: ${label}`} onClick={onUse} disabled={used >= max}>
        −
      </StepButton>
      {onSetUsed ? (
        <span className="flex items-center gap-1">
          <span className="inline-flex gap-1">
            {Array.from({ length: max }, (_, i) => {
              const remaining = i < left ? i : i + 1;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Set ${label} to ${remaining} remaining`}
                  aria-pressed={i < left}
                  onClick={() => onSetUsed(max - remaining)}
                  className="hover-lift grid size-11 shrink-0 place-items-center rounded-btn border border-transparent"
                >
                  <span
                    aria-hidden
                    className={cx(
                      'size-2.5 rounded-full border transition-colors duration-(--omni-motion-pip)',
                      i < left ? fill : 'border-text-muted bg-transparent',
                    )}
                  />
                </button>
              );
            })}
          </span>
          <span
            role="img"
            aria-label={`${label}: ${left} of ${max} left`}
            className="text-xs text-text-muted"
          >
            {left}/{max}
          </span>
        </span>
      ) : (
        <span className="flex w-28 items-center justify-center gap-2">
          <PipRow label={label} max={max} used={used} tone={tone} showLabel={false} />
          <span aria-hidden className="text-xs text-text-muted">
            {max - used}/{max}
          </span>
        </span>
      )}
      <StepButton label={`Restore one: ${label}`} onClick={onRestore} disabled={used <= 0}>
        +
      </StepButton>
    </span>
  );
}

function StepButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="hover-lift grid size-11 shrink-0 place-items-center rounded-btn border border-border bg-surface text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}
