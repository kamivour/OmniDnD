import { useEffect, useRef, useState } from 'react';
import { characterStore } from '../../state/character-store';
import { flushPersistence, storageStatusStore } from '../../state/persistence';
import type {
  ManagementCommand,
  ManagementRunResult,
  ManagementUndoResult,
} from '../../engine/commands/management';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/toast-context';

/** Management actions use the same durable feedback rules as character commands. */
export function useManagement() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState<{ reasons: string[]; confirm: () => void } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);
  const blocked = (): ManagementRunResult | null => {
    if (!storageStatusStore.getState().conflict) return null;
    sequence.current += 1;
    const reasons = ['Another window saved changes. Reload before editing.'];
    toast({ text: reasons[0]! });
    return { result: 'blocked', reasons };
  };
  const finish = (
    result: ManagementRunResult | ManagementUndoResult,
    confirm: () => void,
    onSaved?: () => void,
  ) => {
    const currentSequence = ++sequence.current;
    if (result.result !== 'ok') setPending(false);
    if (result.result === 'warn') {
      opener.current = document.activeElement as HTMLElement;
      setWarning({
        reasons: result.reasons,
        confirm: () => {
          setWarning(null);
          confirm();
        },
      });
    } else if (result.result === 'blocked') toast({ text: result.reasons.join(' · ') });
    else if (result.result === 'ok') {
      setPending(true);
      const valid = () =>
        mounted.current &&
        currentSequence === sequence.current &&
        characterStore.getState().managementEvents.at(-1)?.id === result.event.id;
      void flushPersistence().then(
        () => {
          if (mounted.current && currentSequence === sequence.current) setPending(false);
          if (!valid()) return;
          toast({
            text: result.event.text,
            ...(result.event.command !== 'undo' ? { onUndo: () => undo(result.event.id) } : {}),
          });
          onSaved?.();
        },
        () => {
          if (mounted.current && currentSequence === sequence.current) setPending(false);
          if (!valid()) return;
          toast({ text: 'Changes remain in memory. Check the save status before leaving.' });
        },
      );
    }
  };
  const run = <P,>(
    command: ManagementCommand<P>,
    payload: P,
    onSaved?: () => void,
    force = false,
  ): ManagementRunResult => {
    const stop = blocked();
    if (stop) return stop;
    const result = characterStore.getState().dispatchManagement(command, payload, { force });
    finish(result, () => run(command, payload, onSaved, true), onSaved);
    return result;
  };
  const undo = (expectedId?: string, force = false) => {
    if (blocked()) return;
    const target = characterStore
      .getState()
      .managementEvents.findLast((event) => event.command !== 'undo' && !event.undoneBy);
    if (expectedId && target?.id !== expectedId) {
      toast({ text: 'A newer management change is available. Use Undo management.' });
      return;
    }
    const result = characterStore.getState().undoManagement({ force });
    finish(result, () => undo(expectedId, true));
  };
  const confirmation = (
    <Sheet
      open={warning !== null}
      onOpenChange={(open) => !open && setWarning(null)}
      title="Undo changed data?"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        (opener.current?.isConnected
          ? opener.current
          : (document.getElementById('character-workspace') ??
            document.getElementById('hub-workspace'))
        )?.focus();
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
          className="min-h-11 rounded-btn border border-border"
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
  );
  return { run, undo, confirmation, pending };
}
