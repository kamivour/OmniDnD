import { useEffect, useLayoutEffect } from 'react';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { useFxLevel } from '../hooks/useTheme';

/**
 * Keep CSS motion tokens and the theme effect level (data-fx) in step with the device before
 * painting. Until this runs, data-fx is missing, which CSS treats as off. Theme effects also
 * pause while the tab is hidden (data-paused).
 */
export function MotionPreference() {
  const reducedPreference = useStore(characterStore, (state) => state.reducedMotion);
  const fx = useFxLevel();
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedPreference);
  }, [reducedPreference]);
  useLayoutEffect(() => {
    document.documentElement.dataset.fx = fx;
  }, [fx]);
  useEffect(() => {
    const sync = () => {
      document.documentElement.dataset.paused = String(document.hidden);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  return null;
}
