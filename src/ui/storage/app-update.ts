/**
 * Switch to a newer installed app version if one is waiting. Updates normally wait until
 * every window closes; a locked loading screen cannot reach normal use, so it asks directly.
 * Resolves true when a reload is on its way.
 */
export async function activateWaitingUpdate(): Promise<boolean> {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) return false;
  try {
    const registration = await container.getRegistration();
    if (!registration) return false;
    await registration.update().catch(() => undefined);
    const waiting = registration.waiting ?? (await installed(registration));
    if (!waiting) return false;
    container.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return true;
  } catch {
    return false;
  }
}

/** Wait briefly for a version that is still downloading to finish installing. */
function installed(registration: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
  const worker = registration.installing;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10_000);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') {
        clearTimeout(timer);
        resolve(registration.waiting ?? worker);
      } else if (worker.state === 'redundant') {
        clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

/** How often an open app asks the server for a newer version. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * Report when a newer version has downloaded and is waiting. Checks on start, when the
 * app comes back to the foreground, and every half hour, so long-open windows and
 * installed apps that are never fully closed still learn about updates.
 * Returns a cleanup function.
 */
export function watchForUpdate(onReady: () => void): () => void {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container || typeof document === 'undefined') return () => undefined;
  let registration: ServiceWorkerRegistration | undefined;
  let stopped = false;
  const report = () => {
    // Only an update: the very first install has no older controller to replace.
    if (!stopped && registration?.waiting && container.controller) onReady();
  };
  const track = (worker: ServiceWorker | null) =>
    worker?.addEventListener('statechange', () => worker.state === 'installed' && report());
  const check = () => void registration?.update().catch(() => undefined);
  const onVisible = () => document.visibilityState === 'visible' && check();
  void container
    .getRegistration()
    .then((found) => {
      if (!found || stopped) return;
      registration = found;
      found.addEventListener('updatefound', () => track(found.installing));
      track(found.installing);
      report();
      check();
    })
    .catch(() => undefined);
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(check, UPDATE_CHECK_MS);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(timer);
  };
}
