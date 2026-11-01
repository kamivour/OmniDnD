import { createContext, useContext } from 'react';

export interface ToastInput {
  text: string;
  /** Shows an Undo button for 5 s. */
  onUndo?: () => void;
}

export const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast needs <ToastProvider>');
  return show;
}
