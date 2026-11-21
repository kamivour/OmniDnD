import { afterEach, describe, expect, it, vi } from 'vitest';
import { activateWaitingUpdate, UPDATE_CHECK_MS, watchForUpdate } from './app-update';

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

describe('watchForUpdate', () => {
  function setup(waiting: unknown, controller: unknown) {
    const docListeners: Record<string, () => void> = {};
    const document = {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void) => (docListeners[type] = listener),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', document);
    const update = vi.fn(() => Promise.resolve());
    const registration = { update, waiting, installing: null, addEventListener: vi.fn() };
    vi.stubGlobal('navigator', {
      serviceWorker: { controller, getRegistration: () => Promise.resolve(registration) },
    });
    return { update, docListeners };
  }

  afterEach(() => vi.useRealTimers());

  it('reports a waiting update and checks again on return and on a timer', async () => {
    vi.useFakeTimers();
    const onReady = vi.fn();
    const { update, docListeners } = setup({}, {});
    const stop = watchForUpdate(onReady);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledTimes(1);
    docListeners.visibilitychange?.();
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(update).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(UPDATE_CHECK_MS);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('stays quiet on the first install, with no older version running', async () => {
    const onReady = vi.fn();
    const { update } = setup({}, null);
    const stop = watchForUpdate(onReady);
    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(onReady).not.toHaveBeenCalled();
    stop();
  });
});
