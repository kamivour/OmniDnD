import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { resolveConcentrationSave } from '../../engine/commands';
import { characterStore } from '../../state/character-store';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';

/** One durable, route-independent queue view. Arrival never steals focus or opens a dialog. */
export function ConcentrationSaveBanner() {
  const { state, events } = useCharacter();
  const { run } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const [review, setReview] = useState(false);
  const concentration = state.live.concentration;
  const pending = concentration?.pendingSaves ?? [];
  const first = pending[0];
  const summary = useRef<HTMLParagraphElement>(null);
  const container = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      (
        summary.current ??
        container.current ??
        document.getElementById('character-workspace')
      )?.focus();
    }
  }, [events]);

  if (!first || !concentration) return null;
  const spell = registry.get('spell', concentration.spellId);
  const expanded = automation === 'assisted' || review;
  return (
    <section
      ref={container}
      tabIndex={-1}
      aria-label="Concentration saves"
      className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3 lg:px-6"
    >
      {expanded ? (
        <>
          <div className="min-w-0 flex-1">
            <p ref={summary} tabIndex={-1} className="break-words text-sm text-warn">
              Concentration save · {spell.name} · CON DC {first.dc}
            </p>
            <p className="text-xs text-text-muted">
              {pending.length} pending. Enter the result you resolved at the table.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['pass', 'fail'] as const).map((outcome) => (
              <button
                key={outcome}
                type="button"
                className="min-h-14 min-w-20 rounded-btn border border-border bg-surface-2 px-3 font-semibold text-text"
                onClick={(event) => {
                  event.currentTarget.focus();
                  run(
                    resolveConcentrationSave,
                    { saveId: first.id, outcome },
                    container.current ?? undefined,
                    () => {
                      restoreFocus.current = true;
                    },
                  );
                }}
              >
                {outcome === 'pass' ? 'Pass' : 'Fail'}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="min-h-11 rounded-btn border border-border px-3 text-text"
            onClick={() => setReview(true)}
          >
            Review concentration saves
          </button>
          <p className="text-xs text-text-muted">
            {pending.length} saved {pending.length === 1 ? 'check' : 'checks'}.
          </p>
        </>
      )}
    </section>
  );
}
