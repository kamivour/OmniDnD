import { useRef, useState } from 'react';
import { Moon, PanelRight, Tent, Undo2 } from 'lucide-react';
import { formatClock } from '../../engine/clock';
import { LogList } from '../components/LogList';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { FindLauncher } from '../find/FindLauncher';
import { useDetail } from '../layout/detail-context';
import { useRest } from '../rest/rest-context';
import { StorageStatus } from '../storage/StorageStatus';
import { characterLogEntries } from './log-model';
import { useCharacterHistory } from './useCharacterHistory';

/** One persistent row owns status, history and Undo on every character route. */
export function CharacterToolbar() {
  const { activity, target, undo, pending, confirmation } = useCharacterHistory();
  const details = useDetail();
  const { openShortRest, openLongRest } = useRest();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const historyBody = useRef<HTMLDivElement>(null);
  const entries = activity.map(({ scope, event }) => ({
    id: `${scope}:${event.id}`,
    source: scope,
    text: event.text,
    ...(scope === 'character'
      ? {
          time: `${formatClock(event.gameSeconds)}:${String(event.gameSeconds % 60).padStart(2, '0')}`,
        }
      : {}),
    override: event.override === true,
    undone: event.undoneBy !== undefined,
  }));
  const undoButton = (inDialog = false) => (
    <button
      type="button"
      aria-label="Undo last command"
      title={
        target
          ? `${target.scope === 'workspace' ? 'Workspace' : 'Character'}: ${target.event.text}`
          : 'No change to undo'
      }
      data-character-toolbar-undo={inDialog ? undefined : ''}
      data-character-dialog-undo={inDialog ? '' : undefined}
      disabled={!target || pending}
      onClick={(event) => {
        const control = event.currentTarget;
        control.focus();
        undo();
        requestAnimationFrame(() => {
          if (control.matches(':disabled'))
            (inDialog ? historyBody.current : opener.current)?.focus();
        });
      }}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-btn px-2 text-xs text-accent disabled:opacity-40"
    >
      <Undo2 size={16} aria-hidden />
      Undo
    </button>
  );
  return (
    <section
      aria-label="Character log"
      className="flex min-w-0 flex-wrap items-center gap-1 border-b border-border bg-bg px-3 sm:gap-2 sm:px-4"
    >
      <StorageStatus compact />
      <button
        ref={opener}
        type="button"
        aria-label="View full log"
        onClick={() => setOpen(true)}
        title={entries[0]?.text ?? 'No commands yet.'}
        className="flex min-h-11 min-w-0 flex-1 items-center text-left"
      >
        <span className="w-full truncate text-xs text-text">
          {entries[0] && (
            <span className="text-text-muted">
              {entries[0].source === 'workspace' ? 'Workspace' : 'Character'} ·{' '}
            </span>
          )}
          {entries[0]?.text ?? 'No commands yet.'}
        </span>
      </button>
      <button
        type="button"
        onClick={(event) => openShortRest(event.currentTarget)}
        className="hidden min-h-11 items-center gap-1 text-xs text-text-muted sm:flex lg:hidden"
      >
        <Tent size={16} aria-hidden />
        Short Rest
      </button>
      <button
        type="button"
        onClick={(event) => openLongRest(event.currentTarget)}
        className="hidden min-h-11 items-center gap-1 text-xs text-text-muted sm:flex lg:hidden"
      >
        <Moon size={16} aria-hidden />
        Long Rest
      </button>
      {undoButton()}
      <FindLauncher withCharacter />
      <button
        id="detail-toggle"
        type="button"
        aria-label={details.open ? 'Hide details' : 'Open details'}
        aria-expanded={details.open}
        aria-controls="character-details"
        onClick={() => details.setOpen(!details.open)}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-btn text-xs text-text-muted hover:text-text"
      >
        <PanelRight size={18} aria-hidden />
        <span className="hidden sm:inline">{details.open ? 'Hide details' : 'Open details'}</span>
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Character log"
        description="Character actions and shared workspace changes. New actions appear first; earlier histories keep their saved order. Game times show when character commands started."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <div ref={historyBody} tabIndex={-1}>
          <div className="sticky top-0 z-10 mb-3 flex justify-end bg-surface-2">
            {undoButton(true)}
          </div>
          <LogList entries={entries} label="Command history" />
        </div>
      </Sheet>
      {confirmation}
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
