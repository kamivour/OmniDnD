import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanelRight, Tent, Undo2, X } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DetailContext, useDetail } from './detail-context';
import { useCommand } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';
import { StorageStatus } from '../storage/StorageStatus';
import { useRest } from '../rest/rest-context';

/** One selection follows the character across screens. Closing keeps the selection. */
export function DetailProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [open, setIsOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = useCallback(() => {
    const target =
      opener.current?.isConnected && opener.current.getClientRects().length
        ? opener.current
        : document.getElementById('detail-toggle');
    target?.focus();
  }, []);
  const setOpen = useCallback(
    (next: boolean) => {
      if (next) opener.current = document.activeElement as HTMLElement;
      setIsOpen(next);
      if (!next) requestAnimationFrame(restoreFocus);
    },
    [restoreFocus],
  );
  const pin = useCallback(
    (next: ReactNode) => {
      setContent(next);
      setOpen(true);
    },
    [setOpen],
  );
  const value = useMemo(
    () => ({ content, open, setOpen, pin, restoreFocus }),
    [content, open, setOpen, pin, restoreFocus],
  );
  return <DetailContext value={value}>{children}</DetailContext>;
}

export function DetailToggle() {
  const { open, setOpen } = useDetail();
  const { undo } = useCommand();
  const { openShortRest } = useRest();
  const { events } = useCharacter();
  const canUndo = events.some((event) => event.command !== 'undo' && !event.undoneBy);
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-b border-border px-4">
      <StorageStatus />
      <button
        type="button"
        onClick={(event) => openShortRest(event.currentTarget)}
        className="hidden min-h-11 items-center gap-1 text-xs text-text-muted sm:flex lg:hidden"
      >
        <Tent size={16} aria-hidden /> Short Rest
      </button>
      <button
        type="button"
        aria-label="Undo last command"
        disabled={!canUndo}
        onClick={undo}
        className="flex min-h-11 items-center gap-1 text-xs text-accent disabled:opacity-40"
      >
        <Undo2 size={18} aria-hidden />
        Undo
      </button>
      <button
        id="detail-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="character-details"
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-2 text-xs text-text-muted hover:text-text"
      >
        <PanelRight size={18} aria-hidden />
        {open ? 'Hide details' : 'Open details'}
      </button>
    </div>
  );
}

export function DetailPanel() {
  const { content, open, setOpen, restoreFocus } = useDetail();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const body = content ?? (
    <p className="text-text-muted">Select a spell, resource, or action to see its details.</p>
  );

  if (!desktop) {
    return (
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Details"
        placement="detail"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <div id="character-details">{body}</div>
      </Sheet>
    );
  }
  if (!open) return null;
  return (
    <aside
      id="character-details"
      aria-label="Pinned detail"
      className="w-90 shrink-0 border-l border-border bg-surface p-4"
    >
      <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base">Details</h2>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setOpen(false)}
            className="grid size-11 place-items-center rounded-btn text-text-muted hover:text-text"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {body}
      </div>
    </aside>
  );
}
