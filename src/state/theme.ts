import { deviceStore, type ThemeChoice } from './device-settings';

/** "System" follows the device: a light device gets Parchment, a dark one gets Dark. */
export function resolveTheme(choice: ThemeChoice, deviceIsLight: boolean): 'dark' | 'parchment' {
  if (choice === 'system') return deviceIsLight ? 'parchment' : 'dark';
  return choice;
}

/** Keep data-theme on <html> in step with the saved choice. Call once before the first render. */
export function startThemeSync(): void {
  const query =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : undefined;
  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(
      deviceStore.getState().theme,
      query?.matches ?? false,
    );
  };
  apply();
  deviceStore.subscribe(apply);
  query?.addEventListener('change', apply);
}
