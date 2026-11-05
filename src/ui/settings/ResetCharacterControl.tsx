import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import type { CharacterState } from '../../engine/calc/sheet';
import { equalData } from '../../engine/commands/management';
import { resetCharacter, runCommand } from '../../engine/commands';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { restChanges } from '../rest/rest-model';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/** Review a discarded engine result; only confirmation dispatches the shared command. */
export function ResetCharacterControl() {
  const { state } = useCharacter();
  const { run } = useCommand();
  const { pending: pendingWrites, conflict } = useStore(storageStatusStore);
  const pending = pendingWrites > 0;
  const [reviewed, setReviewed] = useState<CharacterState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const attempted = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLElement>(null);
  const introduction = useRef<HTMLParagraphElement>(null);
  const restoreWhenReady = useRef(false);
  const titleId = useId();
  const open = reviewed !== null;
  const stale = reviewed !== null && !equalData(state, reviewed);
  const preview = useMemo(() => {
    if (!reviewed) return null;
    const result = runCommand(resetCharacter, reviewed, { expected: reviewed }, registry, {
      eventId: 'preview.reset-character',
      realTime: '1970-01-01T00:00:00.000Z',
    });
    if (result.result !== 'ok') return { result, changes: [], clearedNotes: 0 };
    const changes = restChanges(reviewed, result.next, registry);
    if (!changes.some(({ label }) => label === 'Conditions'))
      changes.push({ label: 'Conditions', before: 'None', after: 'None' });
    changes.push(
      {
        label: 'Effects',
        before: `${reviewed.live.effects.length} active`,
        after: '0 active',
      },
      {
        label: 'Combat',
        before: reviewed.live.combat
          ? `In combat · round ${reviewed.live.combat.round}`
          : 'Not in combat',
        after: 'Not in combat',
      },
    );
    const economy = reviewed.live.combat?.economy;
    if (economy) {
      const spent = [
        economy.actionUsed && 'Action',
        economy.bonusUsed && 'Bonus action',
        economy.reactionUsed && 'Reaction',
        economy.objectInteractionUsed && 'Object interaction',
      ].filter(Boolean);
      changes.push({
        label: 'Turn economy',
        before: `${spent.length ? `${spent.join(', ')} spent` : 'No actions spent'}; ${economy.movementUsed} ft moved`,
        after: 'Not in combat',
      });
    }
    return {
      result,
      changes,
      clearedNotes: reviewed.build.overrides.length - result.next.build.overrides.length,
    };
  }, [reviewed]);

  const review = () => {
    setReviewed(structuredClone(state));
    setConfirmed(false);
    setErrors([]);
    attempted.current = false;
  };
  const close = () => setReviewed(null);
  const canApply = confirmed && !stale && !pending && !conflict && preview?.result.result === 'ok';

  useEffect(() => {
    if (open || pending || conflict || !restoreWhenReady.current) return;
    restoreWhenReady.current = false;
    if (document.activeElement === container.current) opener.current?.focus();
  }, [open, pending, conflict]);

  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 id={titleId} className="text-base font-semibold">
        Reset character
      </h2>
      <p className="text-sm text-text-muted">
        Refill current HP and resources, and clear combat, conditions and effects. Review the
        changes before confirming.
      </p>
      <div>
        <button
          ref={opener}
          type="button"
          disabled={pending || conflict}
          onClick={review}
          className={`${button} text-danger`}
        >
          Review reset
        </button>
      </div>
      {conflict && (
        <p className="text-sm text-warn">
          Reload this window before resetting; another window saved changes.
        </p>
      )}
      <Sheet
        open={open}
        onOpenChange={(next) => !next && close()}
        title="Reset character"
        description={`Review resources and effects for ${reviewed?.build.name ?? state.build.name}.`}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          introduction.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current && !opener.current.disabled) {
            restoreWhenReady.current = false;
            opener.current.focus();
          } else {
            restoreWhenReady.current = true;
            container.current?.focus();
          }
        }}
      >
        {reviewed && preview && (
          <form
            aria-label="Confirm character reset"
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canApply || attempted.current) return;
              attempted.current = true;
              const result = run(
                resetCharacter,
                { expected: reviewed },
                () => opener.current,
                close,
              );
              if (result.result !== 'ok') {
                attempted.current = false;
                setErrors(result.reasons);
              }
            }}
          >
            <p ref={introduction} tabIndex={-1} className="text-sm text-text-muted">
              Build choices, inventory, money, game time and history stay. Item charges, Inspiration
              and the last long rest also stay.
            </p>
            <p className="text-sm text-text-muted">
              Reset saves a local backup. Use the screen’s Undo to restore this character. Notes on
              corrected resources clear when spending changes; fixed overrides stay.
            </p>
            {stale && (
              <div role="alert" className="flex flex-col gap-2 text-sm text-warn">
                <p>The character or campaign changed. Refresh the preview before resetting.</p>
                <button type="button" onClick={review} className={button}>
                  Refresh preview
                </button>
              </div>
            )}
            <section
              aria-label="Reset preview"
              className="rounded-card border border-border bg-surface p-3"
            >
              <h3 className="mb-3 text-sm font-semibold">Reset preview</h3>
              {preview.result.result === 'ok' ? (
                <dl className="flex flex-col gap-3">
                  {preview.changes.map((change, index) => (
                    <div key={index} className="min-w-0 text-sm">
                      <dt className="wrap-anywhere text-text-muted">{change.label}</dt>
                      <dd
                        className={`wrap-anywhere ${change.before === change.after ? 'text-text-muted' : 'text-text'}`}
                      >
                        {change.before} <span aria-label="becomes">→</span> {change.after}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <ul role="alert" className="list-disc space-y-1 pl-4 text-sm text-warn">
                  {preview.result.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              {preview.clearedNotes > 0 && (
                <p className="mt-3 text-sm text-text-muted">
                  {preview.clearedNotes} current resource correction{' '}
                  {preview.clearedNotes === 1 ? 'note clears' : 'notes clear'}.
                </p>
              )}
            </section>
            {errors.length > 0 && (
              <p role="alert" className="text-sm text-warn">
                {errors.join(' · ')}
              </p>
            )}
            <label className="flex min-h-11 items-start gap-3 rounded-card border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={stale || pending || conflict}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-(--omni-accent)"
              />
              I understand this resets current resources and effects
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={close} className={button}>
                Cancel
              </button>
              <button type="submit" disabled={!canApply} className={`${button} text-danger`}>
                Reset character
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </section>
  );
}
