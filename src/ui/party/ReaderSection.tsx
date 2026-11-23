import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { DetailSurface } from '../layout/DetailPanel';
import { cx } from '../cx';

export type OpenReaderDetail = (id: string, opener: HTMLElement) => void;
export type ReaderDetail = { title: string; body: ReactNode };

export function ReaderSection({
  id,
  label,
  detail,
  children,
}: {
  id: string;
  label: string;
  detail?: (id: string) => ReaderDetail | undefined;
  children: (open: OpenReaderDetail, selected?: string) => ReactNode;
}) {
  const [selection, setSelection] = useState<{ id: string; opener: HTMLElement; open: boolean }>();
  const selected = selection?.open ? selection.id : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const restore = useCallback(() => {
    const target = selection?.opener;
    (target?.isConnected && target.getClientRects().length ? target : heading.current)?.focus();
  }, [selection]);
  const close = useCallback(() => {
    setSelection((current) => current && { ...current, open: false });
    requestAnimationFrame(restore);
  }, [restore]);
  const current = selection && detail?.(selection.id);
  return (
    <div className="flex min-w-0 gap-4 [--character-header-height:0px]">
      <section
        id={`party-reader-${id}`}
        aria-labelledby={`party-reader-${id}-title`}
        className="grid min-w-0 flex-1 content-start gap-4 rounded-card border border-border bg-surface p-3 sm:p-4"
      >
        <h2
          ref={heading}
          tabIndex={-1}
          id={`party-reader-${id}-title`}
          className="font-display text-base text-text"
        >
          {label}
        </h2>
        {children((id, opener) => setSelection({ id, opener, open: true }), selected)}
      </section>
      <DetailSurface
        open={selected !== undefined}
        title={current?.title ?? 'Entry unavailable'}
        onClose={close}
        restoreFocus={restore}
        focusTitle
      >
        {current?.body ?? (
          <p className="text-sm text-text-muted">
            This entry is no longer on the shared character.
          </p>
        )}
      </DetailSurface>
    </div>
  );
}

export function ReaderRow({
  id,
  name,
  icon,
  meta,
  open,
  selected,
}: {
  id: string;
  name: string;
  icon?: ReactNode;
  meta?: ReactNode;
  open: OpenReaderDetail;
  selected?: string;
}) {
  const description = useId();
  return (
    <button
      type="button"
      aria-label={name}
      aria-describedby={meta ? description : undefined}
      aria-expanded={selected === id}
      onClick={(event) => open(id, event.currentTarget)}
      className={cx(
        'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-btn border px-2.5 py-1.5 text-left hover:bg-surface-2 focus-visible:outline-accent',
        selected === id ? 'border-accent bg-surface-2' : 'border-border',
      )}
    >
      {icon}
      <span className="grid min-w-0 flex-1 gap-0.5 wrap-anywhere">
        <span className="text-sm font-semibold text-text">{name}</span>
        {meta && (
          <span id={description} className="text-xs text-text-muted">
            {meta}
          </span>
        )}
      </span>
      <ChevronRight className="shrink-0 text-text-muted" size={16} aria-hidden />
    </button>
  );
}
