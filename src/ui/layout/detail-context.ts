import { createContext, useContext, type ReactNode } from 'react';

export interface DetailState {
  content: ReactNode;
  open: boolean;
  setOpen: (open: boolean) => void;
  pin: (content: ReactNode) => void;
  restoreFocus: () => void;
}

export const DetailContext = createContext<DetailState | null>(null);

export function useDetail() {
  const detail = useContext(DetailContext);
  if (!detail) throw new Error('Details require the character frame');
  return detail;
}
