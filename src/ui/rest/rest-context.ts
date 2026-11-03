import { createContext, useContext } from 'react';

export const RestContext = createContext<{
  openShortRest: (opener?: HTMLElement) => void;
} | null>(null);

export function useRest() {
  const value = useContext(RestContext);
  if (!value) throw new Error('Rests require the character frame');
  return value;
}
