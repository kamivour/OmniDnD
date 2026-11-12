import { useLayoutEffect } from 'react';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { deviceStore } from '../../state/device-settings';
import { DESKTOP_FX_QUERY, resolveFx } from '../../state/theme';
import { useMediaQuery, useReducedMotion } from '../hooks/useMediaQuery';

/**
 * Keep CSS motion tokens and the theme effect level (data-fx) in step with the device before
 * painting. Until this runs, data-fx is missing, which CSS treats as off.
 */
export function MotionPreference() {
  const reducedPreference = useStore(characterStore, (state) => state.reducedMotion);
  const reducedMotion = useReducedMotion();
  const desktop = useMediaQuery(DESKTOP_FX_QUERY);
  const fxChoice = useStore(deviceStore, (state) => state.fx);
  const fx = resolveFx(fxChoice, { reducedMotion, desktop });
  useLayoutEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedPreference);
  }, [reducedPreference]);
  useLayoutEffect(() => {
    document.documentElement.dataset.fx = fx;
  }, [fx]);
  return null;
}
