import { useLayoutEffect } from 'react';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';

/** Keep CSS motion tokens in step with the hydrated device preference before painting. */
export function MotionPreference() {
  const reducedMotion = useStore(characterStore, (state) => state.reducedMotion);
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);
  return null;
}
