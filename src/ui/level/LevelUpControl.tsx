import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { advancementDetails } from '../../engine/calc/advancement';
import { computeSheet } from '../../engine/calc/sheet';
import { levelUp, type LevelUpPayload } from '../../engine/commands/level';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { SectionLabel } from '../components/SectionLabel';
import { OverrideMarker } from '../components/StatChip';
import { useCharacter } from '../hooks/useCharacter';
import { levelUpChanges, previewLevelUp } from './level-up-model';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/** Only this character's recorded classes advance; the shared frame keeps its one Undo. */
export function LevelUpControl() {
  const { state, sheet } = useCharacter();
  const details = advancementDetails(state, sheet, registry);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLElement>(null);
  const formId = useId();
  const eligible =
    details.canAdvance && (state.campaign.leveling === 'milestone' || details.xp?.ready === true);
  const focusTarget = () =>
    opener.current?.isConnected && !opener.current.disabled ? opener.current : container.current;
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => focusTarget()?.focus());
  };
  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-label="Advancement"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <SectionLabel>Advancement</SectionLabel>
      <p className="text-sm text-text">Recorded character level {details.recordedLevel}</p>
      {details.atMaximum ? (
        <p className="text-sm text-text-muted">Maximum recorded character level.</p>
      ) : state.campaign.leveling === 'milestone' ? (
        <p className="text-sm text-text-muted">Advance when your DM approves the next level.</p>
      ) : details.xp?.ready ? (
        <p role="status" className="text-sm text-accent">
          Ready to advance to recorded level {details.nextLevel}.
        </p>
      ) : (
        <p className="text-sm text-text-muted">
          {details.xp?.current === undefined
            ? 'Record XP in Edit mode to check advancement.'
            : `${details.xp.remaining ?? 'More'} XP needed before the next level.`}
        </p>
      )}
      {details.classes.some((entry) => entry.ambiguous) && (
        <p className="text-sm text-warn">
          Duplicate class entries cannot be advanced. Choose an unambiguous recorded class.
        </p>
      )}
      <div>
        <button
          ref={opener}
          type="button"
          aria-expanded={open}
          aria-controls={formId}
          disabled={!eligible || open}
          onClick={() => setOpen(true)}
          className={`${button} text-accent`}
        >
          Level up
        </button>
      </div>
      {open && <LevelUpForm id={formId} onClose={close} returnFocusTo={focusTarget} />}
    </section>
  );
}

function LevelUpForm({
  id,
  onClose,
  returnFocusTo,
}: {
  id: string;
  onClose: () => void;
  returnFocusTo: () => HTMLElement | null;
}) {
  const { state } = useCharacter();
  const { run, warningOpen } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const [reviewed, setReviewed] = useState(() => ({ state: structuredClone(state), automation }));
  const reviewedSheet = computeSheet(reviewed.state, registry);
  const details = advancementDetails(reviewed.state, reviewedSheet, registry);
  const [classId, setClassId] = useState(
    () => details.classes.find((entry) => !entry.ambiguous)?.classId ?? '',
  );
  const [mode, setMode] = useState<'rolled' | 'average'>(reviewed.state.campaign.hpMethod);
  const [roll, setRoll] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const attempted = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const previewContainer = useRef<HTMLElement>(null);
  const prefix = useId();
  const stale =
    JSON.stringify(state) !== JSON.stringify(reviewed.state) || automation !== reviewed.automation;
  const chosen = details.classes.find((entry) => entry.classId === classId);
  const faces = chosen ? Number(chosen.hitDie.slice(1)) : 0;
  const rollNumber = roll.trim() === '' ? NaN : Number(roll);
  const validRoll =
    mode === 'average' || (Number.isInteger(rollNumber) && rollNumber >= 1 && rollNumber <= faces);
  const payload: LevelUpPayload = {
    classId,
    ...(mode === 'rolled' ? { roll: rollNumber } : {}),
    expected: reviewed.state,
  };
  const preview = previewLevelUp(reviewed.state, registry, payload, reviewed.automation);
  const changes =
    preview.result === 'ok' ? levelUpChanges(reviewed.state, preview.next, registry, classId) : [];
  const qualified =
    details.canAdvance &&
    (reviewed.state.campaign.leveling === 'milestone' || details.xp?.ready === true);
  const canApply =
    !stale &&
    qualified &&
    chosen !== undefined &&
    !chosen.ambiguous &&
    validRoll &&
    preview.result === 'ok';
  useEffect(() => {
    if (!warningOpen) attempted.current = false;
  }, [warningOpen]);
  useEffect(() => {
    const target =
      form.current?.querySelector<HTMLElement>('select') ??
      form.current?.querySelector<HTMLElement>('input[type="number"]') ??
      form.current?.querySelector<HTMLElement>('input[type="radio"]:checked') ??
      form.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <form
      ref={form}
      tabIndex={-1}
      id={id}
      aria-label="Level up character"
      noValidate
      className="flex min-w-0 flex-col gap-4 border-t border-border pt-3"
      onChange={() => errors.length > 0 && setErrors([])}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canApply || warningOpen || attempted.current) return;
        attempted.current = true;
        const result = run(levelUp, payload, () => form.current ?? returnFocusTo(), onClose);
        if (result.result === 'blocked') {
          attempted.current = false;
          setErrors(result.reasons);
        }
      }}
    >
      <p className="text-sm text-text-muted">
        Record one class level and its HP entry. Review any new spell or build choices separately.
      </p>
      {details.classes.length > 1 || !chosen ? (
        <Field label="Class to advance" htmlFor={`${prefix}-class`}>
          <select
            id={`${prefix}-class`}
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className={inputClass}
          >
            {!chosen && (
              <option value={classId} disabled>
                Previously selected class is unavailable
              </option>
            )}
            {details.classes.map((entry, index) => (
              <option
                key={`${entry.classId}-${index}`}
                value={entry.classId}
                disabled={entry.ambiguous}
              >
                {entry.name} {entry.level}
                {entry.ambiguous ? ' (ambiguous entry)' : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="text-sm text-text">
          {chosen?.name ?? 'No eligible class'} {chosen?.level ?? ''}
          {chosen ? ` · Hit Die ${chosen.hitDie}` : ''}
        </p>
      )}
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold text-text">New level HP</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name={`${prefix}-method`}
            aria-label="Roll HP"
            checked={mode === 'rolled'}
            onChange={() => setMode('rolled')}
            className="size-4 accent-(--omni-accent)"
          />
          Roll HP
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="radio"
            name={`${prefix}-method`}
            aria-label="Take average"
            checked={mode === 'average'}
            onChange={() => setMode('average')}
            className="size-4 accent-(--omni-accent)"
          />
          Take average {chosen && <span aria-hidden>({chosen.average})</span>}
        </label>
      </fieldset>
      {mode === 'rolled' ? (
        <Field
          label="Hit Die roll"
          htmlFor={`${prefix}-roll`}
          hint={
            chosen
              ? `Enter a whole number from 1 to ${faces}. CON is added automatically.`
              : undefined
          }
        >
          <input
            id={`${prefix}-roll`}
            type="number"
            inputMode="numeric"
            min={1}
            max={faces || undefined}
            step={1}
            value={roll}
            onChange={(event) => setRoll(event.target.value)}
            className={inputClass}
          />
        </Field>
      ) : (
        chosen && (
          <p className="text-sm text-text">
            Average {chosen.hitDie}: {chosen.average}. CON is added automatically.
          </p>
        )
      )}
      {stale && (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-2 rounded-btn border border-warn p-3 text-sm text-text"
        >
          <p>
            The character or campaign changed after this preview. Your class, HP choice and roll are
            kept. Review the updated character before applying.
          </p>
          <button
            type="button"
            onClick={() => {
              setReviewed({ state: structuredClone(state), automation });
              setErrors([]);
              requestAnimationFrame(() => {
                previewContainer.current?.focus({ preventScroll: true });
                previewContainer.current
                  ?.querySelector<HTMLElement>('[data-level-up-preview-heading]')
                  ?.scrollIntoView({ block: 'center' });
              });
            }}
            className={`${button} self-start`}
          >
            Review updated character
          </button>
        </div>
      )}
      {!qualified && (
        <p className="text-sm text-warn">
          {details.atMaximum
            ? 'Maximum recorded character level reached.'
            : 'The recorded character is not ready to advance.'}
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-warn">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <section
        ref={previewContainer}
        tabIndex={-1}
        aria-label="Level-up preview"
        className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-bg p-3"
      >
        <div data-level-up-preview-heading="">
          <SectionLabel>Level-up preview</SectionLabel>
        </div>
        {preview.warnings.length > 0 && (
          <div role="note" className="text-sm text-warn">
            {preview.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>Apply will ask you to confirm this exception.</p>
          </div>
        )}
        {mode === 'rolled' && !validRoll ? (
          <p role="alert" className="text-sm text-warn">
            Enter a whole Hit Die roll from 1 to {faces || 'the die maximum'}.
          </p>
        ) : preview.result !== 'ok' ? (
          <ul role="alert" className="list-disc pl-5 text-sm text-warn">
            {preview.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <dl className="flex min-w-0 flex-col gap-3">
            {changes.map((change) => (
              <div key={change.label} className="min-w-0 text-sm">
                <dt className="wrap-anywhere text-text-muted">{change.label}</dt>
                <dd className="wrap-anywhere text-text">
                  {change.before}
                  <OverrideMarker
                    override={change.beforeNote ? { note: change.beforeNote } : undefined}
                  />{' '}
                  <span aria-label="becomes">→</span> {change.after}
                  <OverrideMarker
                    override={change.afterNote ? { note: change.afterNote } : undefined}
                  />
                </dd>
                {(change.afterNote ?? change.beforeNote) && (
                  <p className="wrap-anywhere text-xs text-text-muted">
                    Override: {change.afterNote ?? change.beforeNote}
                  </p>
                )}
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-text-muted">
          Recorded spending and game time stay unchanged. A fixed maximum override can keep an
          effective value unchanged.
        </p>
        {reviewed.state.live.hp === 0 && (
          <p className="text-sm text-text-muted">
            Current HP stays at zero. Leveling does not clear death saves or death state.
          </p>
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} disabled={warningOpen} className={button}>
          Cancel level up
        </button>
        <button
          type="submit"
          disabled={!canApply || warningOpen}
          className={`${button} bg-accent font-semibold text-bg`}
        >
          Apply level up
        </button>
      </div>
    </form>
  );
}
