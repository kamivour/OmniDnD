import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { completeLongRest } from '../../engine/commands';
import { characterStore } from '../../state/character-store';
import { useCommand, type CommandFocusTarget } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';
import { preparedRestClassIds, previewLongRest, restChanges } from './rest-model';
import { RestPreview } from './RestPreview';

export function LongRestForm({
  onClose,
  onApplied,
  returnFocusTo,
}: {
  onClose: () => void;
  onApplied: (preparedClassId?: string) => void;
  returnFocusTo?: CommandFocusTarget;
}) {
  const { state } = useCharacter();
  const { run } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const preparedClasses = preparedRestClassIds(state, registry);
  const [reviewPrepared, setReviewPrepared] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const preview = previewLongRest(state, registry, automation);
  const changes = preview.result === 'ok' ? restChanges(state, preview.next, registry) : [];
  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-text-muted">
        Review recovery before applying a completed eight-hour rest. Sleep, interruptions, food and
        drink are resolved at the table.
      </p>
      <p className="text-sm text-text-muted">
        Recover up to half your total Hit Dice, rounded down (minimum one), largest spent dice
        first.
      </p>
      <RestPreview duration="8 h" result={preview} changes={changes} warnings={preview.warnings} />
      {preparedClasses.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={reviewPrepared}
            onChange={(event) => setReviewPrepared(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Review prepared spells after resting
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-btn border border-border text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={preview.result !== 'ok'}
          onClick={(event) => {
            event.currentTarget.focus();
            run(completeLongRest, null, returnFocusTo ?? container.current ?? undefined, () =>
              onApplied(reviewPrepared ? preparedClasses[0] : undefined),
            );
          }}
          className="min-h-14 rounded-btn bg-accent px-2 font-semibold text-bg disabled:opacity-40"
        >
          Apply Long Rest
        </button>
      </div>
    </div>
  );
}
