import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Command, RunResult } from '../../engine/commands';
import { characterStore } from '../../state/character-store';
import { flushPersistence, storageStatusStore } from '../../state/persistence';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/toast-context';
import { CommandContext, type CommandFocusTarget } from './command-context';

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
  const warningFallback = useRef<CommandFocusTarget | null>(null);
  const feedbackSequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      feedbackSequence.current += 1;
    };
  }, []);
  const events = () => characterStore.getState().characters[characterId]?.events ?? [];
  const canPublish = (sequence: number, eventId: string) =>
    mounted.current && feedbackSequence.current === sequence && events().at(-1)?.id === eventId;

  const runUndo = async () => {
    const sequence = ++feedbackSequence.current;
    const result = characterStore.getState().undo(characterId);
    if (result.result === 'ok') {
      setNotes([]);
      try {
        await flushPersistence();
        if (canPublish(sequence, result.event.id)) toast({ text: result.event.text });
      } catch {
        if (canPublish(sequence, result.event.id))
          toast({
            text: storageStatusStore.getState().conflict
              ? 'Save conflict. Undo remains in memory; saved data is unchanged.'
              : 'Undo is in memory. Retry saving before leaving.',
          });
      }
    } else toast({ text: result.reasons.join(' · ') });
  };
  const undo = () => {
    void runUndo();
  };

  const execute = <P,>(
    command: Command<P>,
    payload: P,
    returnFocusTo?: CommandFocusTarget,
    onApplied?: () => void,
    force = false,
  ): RunResult => {
    const sequence = ++feedbackSequence.current;
    if (storageStatusStore.getState().conflict) {
      const reasons = ['Another window saved changes. Reload this window before editing.'];
      toast({ text: reasons[0]! });
      return { result: 'blocked', reasons };
    }
    const result = characterStore.getState().dispatch(characterId, command, payload, { force });
    if (result.result === 'ok') {
      onApplied?.();
      setNotes(result.reasons);
      void flushPersistence().then(
        () => {
          if (canPublish(sequence, result.event.id))
            toast({
              text: result.event.text,
            });
        },
        () => {
          if (canPublish(sequence, result.event.id))
            toast({
              text: storageStatusStore.getState().conflict
                ? 'Save conflict. Changes remain in this window.'
                : 'Changes are in memory. Retry saving before leaving.',
            });
        },
      );
    } else if (result.result === 'warn') {
      warningOpener.current = document.activeElement as HTMLElement;
      warningFallback.current = returnFocusTo ?? null;
      setWarning({
        reasons: result.reasons,
        confirm: () => {
          setWarning(null);
          execute(command, payload, returnFocusTo, onApplied, true);
        },
      });
    } else toast({ text: result.reasons.join(' · ') });
    return result;
  };

  return (
    <CommandContext
      value={{
        run: execute,
        undo,
        warningOpen: warning !== null,
        notes,
        clearNotes: () => setNotes([]),
      }}
    >
      {children}
      <Sheet
        open={warning !== null}
        onOpenChange={(open) => !open && setWarning(null)}
        title="Check this action"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const fallback =
            typeof warningFallback.current === 'function'
              ? warningFallback.current()
              : warningFallback.current;
          const target =
            warningOpener.current?.isConnected &&
            warningOpener.current.getClientRects().length &&
            !warningOpener.current.matches(':disabled')
              ? warningOpener.current
              : fallback?.isConnected &&
                  fallback.getClientRects().length &&
                  !fallback.matches(':disabled')
                ? fallback
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
