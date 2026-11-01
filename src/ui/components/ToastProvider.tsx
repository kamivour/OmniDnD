import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ToastContext, type ToastInput } from './toast-context';

const TOAST_MS = 5000;

interface ActiveToast extends ToastInput {
  key: number;
}

/** One toast at a time, bottom of the screen, above the mobile nav. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);

  const show = useCallback((input: ToastInput) => setToast({ ...input, key: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
      >
        {toast && (
          <div
            key={toast.key}
            className="pointer-events-auto flex min-h-11 max-w-sm items-center gap-3 rounded-card border border-border bg-surface-2 py-1 pr-1 pl-3 shadow-pop"
          >
            <span className="flex-1 text-text">{toast.text}</span>
            {toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  setToast(null);
                }}
                className="min-h-11 rounded-btn px-3 font-semibold text-accent hover:bg-surface"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
