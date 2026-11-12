import { deviceStore, type FxChoice, type ThemeChoice } from './device-settings';
import type { ThemeId } from '../theme/themes';

/** "System" follows the device: a light device gets Parchment, a dark one gets Dark. */
export function resolveTheme(choice: ThemeChoice, deviceIsLight: boolean): ThemeId {
  if (choice === 'system') return deviceIsLight ? 'parchment' : 'dark';
  return choice;
}

/**
 * Theme effect level on <html data-fx>. Off: nothing moves. Lite (phones): still title and
 * background, short tap feedback only. Full (computers): animated title and background.
 */
export type FxLevel = 'off' | 'lite' | 'full';

/** A computer: real hover, a fine pointer and a wide window. */
export const DESKTOP_FX_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';

export function resolveFx(
  choice: FxChoice,
  { reducedMotion, desktop }: { reducedMotion: boolean; desktop: boolean },
): FxLevel {
  if (reducedMotion || choice === 'off') return 'off';
  if (choice === 'full') return 'full';
  return desktop ? 'full' : 'lite';
}

/** Keep data-theme and the browser bar colour in step with the saved choice. Call before render. */
export function startThemeSync(): void {
  const query =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : undefined;
  const apply = () => {
    const root = document.documentElement;
    root.dataset.theme = resolveTheme(deviceStore.getState().theme, query?.matches ?? false);
    const bar = getComputedStyle(root).getPropertyValue('--omni-bg').trim();
    if (bar) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
  };
  apply();
  deviceStore.subscribe(apply);
  query?.addEventListener('change', apply);
}
