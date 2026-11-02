import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';

/** Desktop-style preview: wide enough and a real hover pointer. Otherwise use sheets. */
export const POPOVER_QUERY = '(min-width: 640px) and (hover: hover)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the OS asks for reduced motion or the Settings toggle is on. */
export function useReducedMotion(): boolean {
  const os = useMediaQuery(REDUCED_MOTION_QUERY);
  const preference = useStore(characterStore, (state) => state.reducedMotion);
  return os || preference;
}
