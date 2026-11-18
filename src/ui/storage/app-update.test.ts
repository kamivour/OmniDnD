import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWaitingUpdate } from './app-update';

function stubWorkers(registration: unknown) {
  const listeners: Record<string, () => void> = {};
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: () => Promise.resolve(registration),
      addEventListener: (type: string, listener: () => void) => (listeners[type] = listener),
    },
  });
  return listeners;
}

afterEach(() => vi.unstubAllGlobals());

describe('activateWaitingUpdate', () => {
  it('asks a waiting version to take over and reloads when it does', async () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    const postMessage = vi.fn();
    const listeners = stubWorkers({
      update: () => Promise.resolve(),
      waiting: { postMessage },
      installing: null,
    });
    expect(await activateWaitingUpdate()).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    listeners.controllerchange?.();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does nothing without a newer version or offline', async () => {
    stubWorkers({
      update: () => Promise.reject(new Error('offline')),
      waiting: null,
      installing: null,
    });
    expect(await activateWaitingUpdate()).toBe(false);
    stubWorkers(undefined);
    expect(await activateWaitingUpdate()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(await activateWaitingUpdate()).toBe(false);
  });
});
