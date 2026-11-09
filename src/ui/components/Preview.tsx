import { useEffect, useState, type ReactNode } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  size,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  useTransitionStyles,
} from '@floating-ui/react';
import { POPOVER_QUERY, useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery';
import { Sheet } from './Sheet';

export interface PreviewTrigger {
  ref: (node: Element | null) => void;
  /** Spread onto the trigger element (hover, focus, click handlers, aria). */
  props: Record<string, unknown>;
}

export type PreviewFooter =
  ReactNode | ((controls: { close: () => void; trigger?: HTMLElement }) => ReactNode);

interface PreviewProps {
  title: string;
  /** Card body shown in both the popover and the sheet. */
  content: ReactNode;
  /** Extra controls for the mobile sheet (big Cast button, slot picker, links). */
  sheetFooter?: PreviewFooter;
  /** Desktop click: pin full detail in the side panel. */
  onPin?: () => void;
  children: (trigger: PreviewTrigger) => ReactNode;
}

/**
 * One preview API (DESIGN.md §6). Desktop: hover (250 ms) or keyboard focus opens a popover,
 * click pins. Touch or narrow screens: tap opens a bottom sheet.
 */
export function Preview({ title, content, sheetFooter, onPin, children }: PreviewProps) {
  const popover = useMediaQuery(POPOVER_QUERY);
  const sidebar = useMediaQuery('(min-width: 640px)');
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  const {
    refs: { setReference, setFloating, domReference },
    elements,
    floatingStyles,
    context,
  } = useFloating({
    open: popover && open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [
      offset(6),
      flip({ fallbackPlacements: ['top-start'] }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.max(0, availableHeight)}px`,
            overflowY: 'auto',
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    enabled: popover,
    mouseOnly: true,
    delay: { open: 250, close: 0 },
    handleClose: safePolygon(),
  });
  const focus = useFocus(context, { enabled: popover, visibleOnly: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const { isMounted, styles } = useTransitionStyles(context, {
    duration: reduced ? 0 : 120,
    initial: { opacity: 0, transform: 'scale(0.97)' },
  });

  // Escape closes the popover first. A window capture listener runs before Radix Dialog's
  // document listener, so a popover inside a sheet closes without closing the sheet too.
  const popoverOpen = popover && open;
  useEffect(() => {
    if (!popoverOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      context.onOpenChange(false, event, 'escape-key');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [popoverOpen, context]);

  const onClick = () => {
    if (sidebar && onPin) {
      setOpen(false);
      onPin?.();
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      {children({
        ref: setReference,
        props: getReferenceProps({ onClick }),
      })}
      {popover && isMounted && (
        <FloatingPortal>
          <div
            ref={setFloating}
            style={floatingStyles}
            className="z-50 w-80 max-w-[calc(100vw-16px)]"
            {...getFloatingProps()}
          >
            <div
              style={styles}
              className="rounded-card border border-border bg-surface-2 p-3 shadow-pop"
            >
              {content}
              {onPin && <p className="mt-2 text-xs text-text-muted">Click to pin</p>}
            </div>
          </div>
        </FloatingPortal>
      )}
      {!popover && !(sidebar && onPin) && (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={title}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = domReference.current;
            const target =
              opener instanceof HTMLElement && opener.isConnected && opener.getClientRects().length
                ? opener
                : (document.getElementById('character-workspace') ??
                  document.getElementById('detail-toggle'));
            target?.focus();
          }}
        >
          {content}
          {sheetFooter && (
            <div className="mt-4">
              {typeof sheetFooter === 'function'
                ? sheetFooter({
                    close: () => setOpen(false),
                    trigger:
                      elements.domReference instanceof HTMLElement &&
                      elements.domReference.isConnected &&
                      elements.domReference.getClientRects().length
                        ? elements.domReference
                        : undefined,
                  })
                : sheetFooter}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
