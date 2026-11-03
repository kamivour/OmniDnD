import { useRef, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useCommand } from '../commands/command-context';
import { LogList } from '../components/LogList';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { canUndoCommand, characterLogEntries } from './log-model';

/** Sticky summary and the complete saved history share the ordinary linear Undo. */
export function CharacterLogBar({
  label = 'Combat log',
  undoLabel = 'Undo last combat command',
}: {
  label?: string;
  undoLabel?: string;
}) {
  const { events } = useCharacter();
  const { undo } = useCommand();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const entries = characterLogEntries(events);
  return (
    <section
      aria-label={label}
      className="sticky top-22 z-10 flex min-w-0 items-center gap-2 rounded-card border border-border bg-surface px-3 shadow-pop @min-[900px]:col-span-2"
    >
      <button
        ref={opener}
        type="button"
        aria-label="View full log"
        onClick={() => setOpen(true)}
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center text-left"
      >
        <span className="text-xs text-accent">Log · View full log</span>
        <span className="w-full truncate text-sm text-text">
          {entries[0]?.text ?? 'No commands yet.'}
        </span>
      </button>
      <button
        type="button"
        aria-label={undoLabel}
        disabled={!canUndoCommand(events)}
        onClick={(event) => {
          const control = event.currentTarget;
          control.focus();
          undo();
          requestAnimationFrame(() => {
            if (control.matches(':disabled')) opener.current?.focus();
          });
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-btn px-2 text-sm text-accent disabled:opacity-40"
      >
        <Undo2 size={16} aria-hidden />
        Undo
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        description="Newest first. Game times show when each command started. Undo always reverts the latest command that has not been undone."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <LogList entries={entries} label="Command history" />
      </Sheet>
    </section>
  );
}

/** A short desktop view; the sticky summary opens every retained event. */
export function RecentCharacterLog() {
  const { events } = useCharacter();
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Recent commands">
      <SectionLabel>Recent log</SectionLabel>
      <LogList entries={characterLogEntries(events).slice(0, 5)} label="Recent command history" />
    </section>
  );
}
