import { useStore } from 'zustand';
import { deviceStore } from '../../state/device-settings';
import { DESKTOP_FX_QUERY, resolveFx, resolveTheme, type FxLevel } from '../../state/theme';
import { themeInfo, type ThemeInfo } from '../../theme/themes';
import { characterStore } from '../../state/character-store';
import { useMediaQuery } from './useMediaQuery';

/** The theme on screen now (System resolved against the device). */
export function useActiveTheme(): ThemeInfo {
  const choice = useStore(deviceStore, (state) => state.theme);
  const light = useMediaQuery('(prefers-color-scheme: light)');
  return themeInfo(resolveTheme(choice, light));
}

/** The theme effect level for this device (docs/DESIGN.md §1). */
export function useFxLevel(): FxLevel {
  const choice = useStore(deviceStore, (state) => state.fx);
  const alwaysReduce = useStore(characterStore, (state) => state.reducedMotion);
  const desktop = useMediaQuery(DESKTOP_FX_QUERY);
  return resolveFx(choice, { alwaysReduce, desktop });
}
