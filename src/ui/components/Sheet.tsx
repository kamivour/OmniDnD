import type { ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cx } from '../cx';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Short line under the title. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Bottom sheet on mobile, centered dialog from 640 px. Esc and backdrop close it. */
export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <Dialog.Content
          className={cx(
            'omni-sheet fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-card border-t border-border bg-surface-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop',
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border',
            className,
          )}
        >
          <div className="mb-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-text">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'text-xs text-text-muted' : 'sr-only'}>
                {description ?? 'Details'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-m-2 grid size-11 place-items-center rounded-btn text-text-muted hover:text-text"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
