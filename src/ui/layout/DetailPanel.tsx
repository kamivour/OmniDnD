import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Sheet } from '../components/Sheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { DetailContext, useDetail } from './detail-context';

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

export function DetailPanel() {
  const { content, open, setOpen, restoreFocus } = useDetail();
  const body = content ?? (
    <p className="text-sm text-text-muted">
      Nothing pinned yet. Click a spell, resource or action to see it here.
    </p>
  );
  return (
    <DetailSurface
      open={open}
      title="Details"
      onClose={() => setOpen(false)}
      restoreFocus={restoreFocus}
    >
      {body}
    </DetailSurface>
  );
}

/** Shared responsive detail layout. The screen owns selection and content. */
export function DetailSurface({
  open,
  title,
  onClose,
  restoreFocus,
  focusTitle = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  restoreFocus: () => void;
  focusTitle?: boolean;
  children: ReactNode;
}) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (desktop && open && focusTitle) heading.current?.focus({ preventScroll: true });
  }, [desktop, open, focusTitle]);
  useEffect(() => {
    if (!desktop || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      onClose();
    };
    // The opener can retain focus after pinning. Bubble after Radix/Floating UI so
    // their dialogs and previews consume Escape before dismissing these details.
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [desktop, open, onClose]);

  if (!desktop) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={title}
        placement="detail"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <div id="character-details">{children}</div>
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
      <div className="sticky top-[calc(var(--character-header-height,132px)+16px)] max-h-[calc(100dvh-var(--character-header-height,132px)-32px)] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2
            ref={heading}
            tabIndex={focusTitle ? -1 : undefined}
            className="font-display text-base wrap-anywhere"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-btn text-text-muted hover:text-text"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}
