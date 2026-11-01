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
  className,
}: PipStepperProps) {
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-2', className)}>
      <StepButton label={`Use one: ${label}`} onClick={onUse}>
        −
      </StepButton>
      <span className="flex w-28 items-center justify-center gap-2">
        <PipRow label={label} max={max} used={used} tone={tone} showLabel={false} />
        <span aria-hidden className="text-xs text-text-muted">
          {max - used}/{max}
        </span>
      </span>
      <StepButton label={`Restore one: ${label}`} onClick={onRestore}>
        +
      </StepButton>
    </span>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hover-lift grid size-11 shrink-0 place-items-center rounded-btn border border-border bg-surface text-text"
    >
      {children}
    </button>
  );
}
