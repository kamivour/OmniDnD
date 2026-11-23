import { useId, useState, type ReactNode } from 'react';
import { Check, Clock3 } from 'lucide-react';
import { guidanceFor } from '../../data/guidance';
import { cx } from '../cx';
import { GuidanceCard } from './GuidanceCard';
import { Icon } from './Icon';
import { inputClass } from './fields';

export interface SelectionOption {
  id: string;
  name: string;
  fallback?: string;
}

export function SelectionCards({
  label,
  options,
  value,
  onChange,
  hints,
  detail,
  emblem,
  searchLabel,
  className,
}: {
  label: string;
  options: readonly SelectionOption[];
  value: string;
  onChange: (id: string) => void;
  hints: boolean;
  detail?: ReactNode;
  emblem?: string;
  searchLabel?: string;
  className?: string;
}) {
  const group = useId();
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const matches = options.filter(({ name }) => name.toLocaleLowerCase().includes(query));
  const chosen = options.find((option) => option.id === value);
  const visible = chosen && !matches.includes(chosen) ? [chosen, ...matches] : matches;
  const chosenGuidance = hints && guidanceFor(chosen?.id);
  const guide =
    chosen && chosenGuidance ? (
      <GuidanceCard name={chosen.name} guidance={chosenGuidance} showPitch={false} />
    ) : undefined;
  const hasSidebar = Boolean(detail || guide);
  return (
    <fieldset className={cx('@container min-w-0 rounded-card border border-border p-3', className)}>
      <legend className="px-1 font-semibold text-text">
        <span className="inline-flex items-center gap-2">
          {emblem && <Icon id={emblem} size={20} className="text-accent" />}
          {label}
        </span>
      </legend>
      {searchLabel && (
        <label className="mb-3 grid gap-1 text-sm text-text-muted" htmlFor={`${group}-search`}>
          {searchLabel}
          <input
            id={`${group}-search`}
            type="search"
            className={inputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        </label>
      )}
      {query && matches.length === 0 && (
        <p role="status" className="mb-3 text-sm text-text-muted">
          No matches{chosen ? '. Your current choice is shown below.' : '.'}
        </p>
      )}
      <div
        className={cx(
          'grid min-w-0 items-start gap-3',
          hasSidebar && '@min-[52rem]:grid-cols-[1fr_15rem]',
        )}
      >
        <div className="grid min-w-0 gap-2 @min-[29rem]:grid-cols-2 @min-[44rem]:grid-cols-3">
          {visible.map((option, index) => {
            const selected = option.id === value;
            const pitch = hints && guidanceFor(option.id)?.pitch;
            const pitchId = `${group}-pitch-${index}`;
            return (
              <label
                key={option.id}
                className={cx(
                  'relative grid min-h-16 min-w-0 cursor-pointer grid-cols-[2.5rem_1fr] items-center gap-3 rounded-card border p-3 text-sm hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent @min-[29rem]:min-h-24 @min-[29rem]:grid-cols-1 @min-[29rem]:content-start @min-[29rem]:gap-1',
                  selected ? 'border-accent bg-surface-2' : 'border-border bg-surface',
                )}
              >
                <input
                  type="radio"
                  name={group}
                  value={option.id}
                  checked={selected}
                  onChange={() => onChange(option.id)}
                  aria-label={option.name}
                  aria-describedby={pitch ? pitchId : undefined}
                  className="absolute top-3 right-3 size-5 opacity-0"
                />
                {option.id ? (
                  <Icon
                    id={option.id}
                    fallback={option.fallback}
                    size={40}
                    className="text-accent"
                  />
                ) : (
                  <Clock3 size={36} aria-hidden="true" className="text-text-muted" />
                )}
                <span className="grid min-w-0 gap-1">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="wrap-anywhere font-semibold text-text">{option.name}</span>
                    {selected && (
                      <span
                        aria-hidden="true"
                        className="inline-flex items-center gap-0.5 text-xs text-accent"
                      >
                        <Check size={12} /> Selected
                      </span>
                    )}
                  </span>
                  {pitch && (
                    <span id={pitchId} className="text-xs text-text-muted">
                      {pitch}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {hasSidebar && (
          <div className="grid min-w-0 gap-2">
            {detail}
            {guide}
          </div>
        )}
      </div>
    </fieldset>
  );
}
