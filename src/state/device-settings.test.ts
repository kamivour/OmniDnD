import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'omnidnd.device';

async function load(saved?: unknown) {
  vi.resetModules();
  const store = new Map<string, string>();
  if (saved !== undefined) store.set(KEY, JSON.stringify(saved));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  const { deviceStore } = await import('./device-settings');
  return { deviceStore, store };
}

describe('device settings', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('starts with step-by-step creation and beginner hints on', async () => {
    const { deviceStore } = await load();
    expect(deviceStore.getState()).toMatchObject({ creationMode: 'steps', beginnerHints: true });
  });

  it('remembers the creation mode and hints choice', async () => {
    const { deviceStore, store } = await load();
    deviceStore.getState().setCreationMode('page');
    deviceStore.getState().setBeginnerHints(false);
    expect(JSON.parse(store.get(KEY)!)).toMatchObject({
      creationMode: 'page',
      beginnerHints: false,
    });
    const again = await load(JSON.parse(store.get(KEY)!));
    expect(again.deviceStore.getState()).toMatchObject({
      creationMode: 'page',
      beginnerHints: false,
    });
  });

  it('ignores unknown saved values', async () => {
    const { deviceStore } = await load({ creationMode: 'wizard', beginnerHints: 'no' });
    expect(deviceStore.getState()).toMatchObject({ creationMode: 'steps', beginnerHints: true });
  });
});
