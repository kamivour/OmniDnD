import { useId, useRef, useState } from 'react';
import { registryFor } from '../../data/registry';
import { overrideTargets, type OverrideTarget } from '../../engine/calc/override-targets';
import { resetValueOverride, setValueOverride } from '../../engine/commands/value-overrides';
import { DieSchema } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';
import { useCharacter } from '../hooks/useCharacter';

interface OverrideDraft {
  reviewed: OverrideTarget;
  value: string;
  note: string;
}

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/** A typed draft keeps the reviewed target, including its calculation and saved records. */
export function SheetOverrideEditor() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const prefix = useId();
  const select = useRef<HTMLSelectElement>(null);
  const errorsRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState('');
  const [draft, setDraft] = useState<OverrideDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const targets = overrideTargets({ ...state, sheet, registry: registryFor(state.build) });
  const current = targets.find((target) => target.path === path);
  const reviewed = draft?.reviewed ?? current;
  const displayed = current ?? reviewed;
  const stale =
    draft !== null &&
    (current === undefined || JSON.stringify(current) !== JSON.stringify(draft.reviewed));
  const value = draft?.value ?? String(reviewed?.value ?? '');
  const note = draft?.note ?? reviewed?.note ?? '';
  const changed =
    draft !== null &&
    (draft.value !== String(draft.reviewed.value) || draft.note !== (draft.reviewed.note ?? ''));
  const retained = state.build.overrides.some((entry) => {
    const target = targets.find((candidate) => candidate.path === entry.path);
    return (
      !target ||
      !target.override ||
      (Array.isArray(target.expected.override) && target.expected.override.length > 1)
    );
  });

  const clearDraft = () => {
    setDraft(null);
    setErrors([]);
  };
  const edit = (field: 'value' | 'note', next: string) => {
    setErrors([]);
    setDraft((previous) => {
      const baseline =
        previous ??
        (current && {
          reviewed: structuredClone(current),
          value: String(current.value),
          note: current.note ?? '',
        });
      return baseline ? { ...baseline, [field]: next } : null;
    });
  };
  const showErrors = (reasons: string[]) => {
    setErrors(reasons);
    requestAnimationFrame(() => errorsRef.current?.focus());
  };

  return (
    <section
      aria-label="Value overrides"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <SectionLabel>Value overrides</SectionLabel>
      <p className="text-sm text-text-muted">
        Record a table-approved exception with a note. Overridden values show ✎; Reset returns them
        to their calculation.
      </p>
      {retained && (
        <p className="text-xs text-text-muted">
          Some saved entries are inactive or unsupported. They stay saved unless you explicitly
          replace or reset that value.
        </p>
      )}
      <form
        aria-label="Override a computed value"
        className="flex min-w-0 flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!reviewed || !changed || stale) return;
          const result = run(
            setValueOverride,
            {
              path: reviewed.path,
              value: reviewed.kind === 'die' ? value : Number(value),
              note,
              expected: reviewed.expected,
            },
            select.current ?? undefined,
            clearDraft,
          );
          if (result.result === 'blocked') showErrors(result.reasons);
        }}
      >
        <Field label="Computed value" htmlFor={`${prefix}-target`} className="min-w-0">
          <select
            ref={select}
            id={`${prefix}-target`}
            value={path}
            onChange={(event) => {
              setPath(event.target.value);
              clearDraft();
            }}
            className={inputClass}
          >
            <option value="">Choose a value…</option>
            {path && !current && (
              <option value={path} disabled>
                {reviewed?.label ?? 'Selected value'} (no longer available)
              </option>
            )}
            {targets.map((target) => (
              <option key={target.path} value={target.path}>
                {target.label}
                {target.override ? ' ✎' : ''}
              </option>
            ))}
          </select>
        </Field>
        {displayed && (
          <>
            {displayed.path === '/level' && (
              <p className="text-sm text-text-muted">
                This changes computed character level. Recorded class levels, class features and
                per-level HP entries stay unchanged.
              </p>
            )}
            <dl className="grid min-w-0 grid-cols-2 gap-3 rounded-btn border border-border p-3 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-text-muted">
                  {current ? 'Current value' : 'Last reviewed value'}
                </dt>
                <dd className="mt-1 wrap-anywhere font-semibold text-text">
                  {displayed.value}
                  {displayed.override && <span aria-label="Manual override"> ✎</span>}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-text-muted">
                  {displayed.kind === 'remaining' ? 'Before correction' : 'Calculated value'}
                </dt>
                <dd className="mt-1 wrap-anywhere font-semibold text-text">
                  {displayed.calculated}
                </dd>
              </div>
            </dl>
            {displayed.note && (
              <p className="wrap-anywhere text-sm text-text-muted">Saved note: {displayed.note}</p>
            )}
            {displayed.hasOverride && !displayed.override && (
              <p className="text-xs text-text-muted">
                The saved entry is inactive. Reset removes it without changing current spending.
              </p>
            )}
          </>
        )}
        {stale && (
          <div role="alert" className="rounded-btn border border-warn p-3 text-sm text-text">
            <p>
              This value changed while you were editing. Your draft is kept. Reload the value to
              review it before applying changes.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!current) setPath('');
                clearDraft();
                select.current?.focus();
              }}
              className={`${button} mt-2`}
            >
              Reload value
            </button>
          </div>
        )}
        {path && !current && !draft && (
          <p role="status" className="text-sm text-text-muted">
            This value is no longer available. Choose another value.
          </p>
        )}
        {reviewed && (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field
                label={reviewed.kind === 'remaining' ? 'Remaining' : 'Override value'}
                htmlFor={`${prefix}-value`}
                className="min-w-0"
                hint={
                  reviewed.kind === 'remaining'
                    ? `Whole number from 0 to ${reviewed.max}.`
                    : reviewed.kind === 'number'
                      ? 'Whole number.'
                      : undefined
                }
              >
                {reviewed.kind === 'die' ? (
                  <select
                    id={`${prefix}-value`}
                    value={value}
                    onChange={(event) => edit('value', event.target.value)}
                    className={inputClass}
                    required
                  >
                    {DieSchema.options.map((die) => (
                      <option key={die} value={die}>
                        {die}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${prefix}-value`}
                    type="number"
                    step={1}
                    min={reviewed.domain.min}
                    max={reviewed.domain.max}
                    value={value}
                    onChange={(event) => edit('value', event.target.value)}
                    className={inputClass}
                    required
                  />
                )}
              </Field>
              <Field label="Override note" htmlFor={`${prefix}-note`} className="min-w-0">
                <textarea
                  id={`${prefix}-note`}
                  rows={2}
                  value={note}
                  onChange={(event) => edit('note', event.target.value)}
                  className={`${inputClass} py-2`}
                  required
                />
              </Field>
            </div>
            {reviewed.kind === 'remaining' && (
              <p className="text-xs text-text-muted">
                Correct remaining updates spending once. Later use and rest recovery work normally.
                Reset restores previous spending while this correction remains active.
              </p>
            )}
            {errors.length > 0 && (
              <div
                ref={errorsRef}
                role="alert"
                tabIndex={-1}
                className="rounded-btn border border-warn p-3 text-sm text-text"
              >
                <ul className="list-disc pl-5">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!current?.hasOverride || stale}
                onClick={() => {
                  if (!reviewed || stale) return;
                  const result = run(
                    resetValueOverride,
                    { path: reviewed.path, expected: reviewed.expected },
                    select.current ?? undefined,
                    clearDraft,
                  );
                  if (result.result === 'blocked') showErrors(result.reasons);
                }}
                className={button}
              >
                Reset override
              </button>
              <button
                type="submit"
                disabled={!changed || stale}
                className={`${button} bg-accent font-semibold text-bg`}
              >
                {reviewed.kind === 'remaining' ? 'Correct remaining' : 'Apply override'}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
