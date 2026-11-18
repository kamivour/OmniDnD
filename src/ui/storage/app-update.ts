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
