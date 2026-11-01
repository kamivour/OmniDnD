import { useRef, useState, type ReactNode } from 'react';
import type { Command, RunResult } from '../../engine/commands';
import { characterStore } from '../../state/character-store';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/toast-context';
import { CommandContext } from './command-context';

/** Shared command feedback: no UI component writes character values directly. */
export function CommandProvider({
  characterId,
  children,
}: {
  characterId: string;
  children: ReactNode;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<string[]>([]);
  const [warning, setWarning] = useState<{ reasons: string[]; confirm: () => void } | null>(null);
  const warningOpener = useRef<HTMLElement | null>(null);

  const undo = () => {
    const result = characterStore.getState().undo(characterId);
    if (result.result === 'ok') {
      setNotes([]);
      toast({ text: result.event.text });
    } else toast({ text: result.reasons.join(' · ') });
  };

  const execute = <P,>(
    command: Command<P>,
    payload: P,
    returnFocusTo?: HTMLElement,
    force = false,
  ): RunResult => {
    const result = characterStore.getState().dispatch(characterId, command, payload, { force });
    if (result.result === 'ok') {
      setNotes(result.reasons);
      toast({ text: result.event.text, onUndo: undo });
    } else if (result.result === 'warn') {
      warningOpener.current = returnFocusTo ?? (document.activeElement as HTMLElement);
      setWarning({
        reasons: result.reasons,
        confirm: () => {
          setWarning(null);
          execute(command, payload, returnFocusTo, true);
        },
      });
    } else toast({ text: result.reasons.join(' · ') });
    return result;
  };

  return (
    <CommandContext value={{ run: execute, undo, notes, clearNotes: () => setNotes([]) }}>
      {children}
      <Sheet
        open={warning !== null}
        onOpenChange={(open) => !open && setWarning(null)}
        title="Check this action"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = warningOpener.current?.isConnected
            ? warningOpener.current
            : document.getElementById('character-workspace');
          target?.focus();
        }}
      >
        <ul className="mb-4 list-disc space-y-2 pl-5 text-warn">
          {warning?.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="min-h-11 rounded-btn border border-border text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => warning?.confirm()}
            className="min-h-11 rounded-btn bg-accent font-semibold text-bg"
          >
            Do anyway
          </button>
        </div>
      </Sheet>
    </CommandContext>
  );
}

export function CommandNotes() {
  return (
    <CommandContext.Consumer>
      {(actions) =>
        actions &&
        actions.notes.length > 0 && (
          <div
            role="note"
            aria-label="Command notes"
            className="flex items-start gap-3 border-b border-border bg-surface px-4 py-3 text-sm text-magic"
          >
            <ul className="flex-1">
              {actions.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={actions.clearNotes}
              className="min-h-11 px-2 text-text-muted"
            >
              Dismiss
            </button>
          </div>
        )
      }
    </CommandContext.Consumer>
  );
}
