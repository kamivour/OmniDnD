import type { ReactNode } from 'react';
import { cx } from '../cx';
import type { Option } from '../campaignOptions';

/** Shared form styles for setup screens. */
export const inputClass =
  'min-h-11 w-full rounded-btn border border-border bg-surface px-3 text-text placeholder:text-text-muted focus:border-accent';

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-xs text-text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/** Radio group shown as cards: each option has a label and a one-line hint. */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: (Option<T> & { icon?: ReactNode })[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-text">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              'flex cursor-pointer flex-col gap-0.5 rounded-btn border p-3 transition-colors duration-(--omni-motion-hover)',
              'border-border bg-surface hover:border-text-muted',
              'has-checked:border-accent has-checked:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:outline-accent',
            )}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="size-4 accent-(--omni-accent)"
              />
              {o.icon && (
                <span aria-hidden className="text-accent">
                  {o.icon}
                </span>
              )}
              <span className="font-semibold text-text">{o.label}</span>
            </span>
            <span className="text-xs text-text-muted">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
