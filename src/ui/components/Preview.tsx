import { useState, type ReactNode } from 'react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
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

interface PreviewProps {
  title: string;
  /** Card body shown in both the popover and the sheet. */
  content: ReactNode;
  /** Extra controls for the mobile sheet (big Cast button, slot picker, links). */
  sheetFooter?: ReactNode;
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
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  const {
    refs: { setReference, setFloating },
    floatingStyles,
    context,
  } = useFloating({
    open: popover && open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [offset(6), flip({ fallbackPlacements: ['top-start'] }), shift({ padding: 8 })],
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

  const onClick = () => {
    if (popover) {
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
      {!popover && (
        <Sheet open={open} onOpenChange={setOpen} title={title}>
          {content}
          {sheetFooter && <div className="mt-4">{sheetFooter}</div>}
        </Sheet>
      )}
    </>
  );
}
