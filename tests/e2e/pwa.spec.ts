import { expect, test, type Page } from './fixtures';
import type { Campaign, CharacterBuild, LiveState, LogEvent } from '../../src/engine/schema';

// Deliberately use native Playwright, without fixtures.ts's optional HTTP forwarding.
// Service-worker installation and offline navigation must use Chromium's own network stack.
interface Stored<T> {
  id: string;
  schemaVersion: number;
  data: T;
}

interface StoredEvent extends Stored<LogEvent> {
  characterId: string;
  order: number;
}

interface DatabaseSnapshot {
  builds: Stored<CharacterBuild>[];
  live: Stored<LiveState>[];
  campaigns: Stored<Campaign>[];
  events: StoredEvent[];
}

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const hp = (page: Page) =>
  hud(page).getByRole('button', { name: 'Adjust hit points', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

// Read the actual durable records, including history provenance; never seed or alter them.
async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'campaigns', 'events'], 'readonly');
      const [builds, live, campaigns, events] = await Promise.all(
        ['builds', 'live', 'campaigns', 'events'].map((name) =>
          value(transaction.objectStore(name).getAll()),
        ),
      );
      return {
        builds,
        live,
        campaigns,
        events: (events as StoredEvent[]).sort((left, right) => left.order - right.order),
      } as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

async function controlled(page: Page) {
  const registration = await page.evaluate(async () => {
    const worker = await navigator.serviceWorker.ready;
    return { scope: worker.scope, script: worker.active?.scriptURL };
  });
  expect(new URL(registration.scope).pathname).toBe('/');
  expect(new URL(registration.script!).pathname).toBe('/sw.js');
  // ready may resolve while the active worker is still activating; wait for client control.
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state))
    .toBe('activated');
}

async function fontsLoaded(page: Page) {
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts)
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replace(/['"]/g, ''));
  });
  expect(families).toContain('Inter Variable');
  expect(families).toContain('Cinzel Variable');
}

async function offlineNavigation(page: Page, path?: string) {
  const response = path ? await page.goto(path) : await page.reload();
  expect(response, 'offline document is served by the installed worker').not.toBeNull();
  expect(response!.fromServiceWorker()).toBe(true);
  expect(response!.status()).toBe(200);
  await saved(page);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await controlled(page);
  await fontsLoaded(page);
  await expect(hp(page)).toHaveText(/8\s*\/\s*19/);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('production manifest, decoded icons, precache and native installability are ready', async ({
  page,
  context,
  browserName,
}) => {
  await page.goto('/');
  await saved(page);
  await page.getByRole('heading', { name: 'Campaigns', exact: true }).click();
  await controlled(page);
  await fontsLoaded(page);

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifestUrl = new URL(href!, page.url()).href;
  const manifest = await page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Manifest fetch failed: ${response.status}`);
    return (await response.json()) as Manifest;
  }, manifestUrl);
  expect(manifest.name).toBe('OmniDnD');
  expect(manifest.short_name).toBe('OmniDnD');
  expect(manifest.description).toContain('2014');
  expect(manifest.display).toBe('standalone');
  for (const field of ['id', 'start_url', 'scope'] as const)
    expect(new URL(manifest[field], manifestUrl).href).toBe(new URL('/', page.url()).href);
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'any' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png', purpose: 'maskable' }),
    ]),
  );

  for (const icon of manifest.icons) {
    const image = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Icon fetch failed: ${response.status}`);
      const blob = await response.blob();
      const bytes = await blob.arrayBuffer();
      const png = new DataView(bytes);
      const decoded = await createImageBitmap(blob);
      const result = {
        type: blob.type,
        signature: Array.from(new Uint8Array(bytes, 0, 8)),
        width: png.getUint32(16),
        height: png.getUint32(20),
        decodedWidth: decoded.width,
        decodedHeight: decoded.height,
      };
      decoded.close();
      return result;
    }, new URL(icon.src, manifestUrl).href);
    expect(image.type).toBe('image/png');
    expect(image.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(icon.sizes.split(' ')).toContain(`${image.width}x${image.height}`);
    expect(image.decodedWidth).toBe(image.width);
    expect(image.decodedHeight).toBe(image.height);
  }

  const assets = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const entries = await Promise.all(
      cacheNames.map(async (name) =>
        (await (await caches.open(name)).keys()).map(({ url }) => url),
      ),
    );
    return {
      cached: entries.flat().map((url) => new URL(url).pathname),
      essential: [
        ...Array.from(
          document.querySelectorAll<HTMLScriptElement>('script[src]'),
          ({ src }) => src,
        ),
        ...Array.from(
          document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
          ({ href }) => href,
        ),
        ...performance
          .getEntriesByType('resource')
          .filter(({ name }) => new URL(name).pathname.endsWith('.woff2'))
          .map(({ name }) => name),
      ].map((url) => new URL(url).pathname),
    };
  });
  expect(assets.cached).toContain('/index.html');
  for (const suffix of ['.js', '.css', '.woff2']) {
    expect(assets.essential.some((path) => path.endsWith(suffix))).toBe(true);
    expect(assets.cached.some((path) => path.endsWith(suffix))).toBe(true);
  }
  for (const path of assets.essential) expect(assets.cached).toContain(path);
  for (const icon of manifest.icons)
    expect(assets.cached).toContain(new URL(icon.src, manifestUrl).pathname);

  if (browserName === 'chromium') {
    const cdp = await context.newCDPSession(page);
    try {
      // Check browser install criteria after manifest parsing and worker activation settle.
      // Do not invoke an OS installation dialog.
      await expect
        .poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors, {
          timeout: 15_000,
        })
        .toEqual([]);
    } finally {
      await cdp.detach();
    }
  }
});

test('offline deep links preserve commands, reference data and exact durable Undo', async ({
  page,
  context,
  isMobile,
}) => {
  test.setTimeout(60_000);
  await page.goto('/characters/the-fool');
  await saved(page);
  await controlled(page);
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  const initial = await readDatabase(page);
  expect(initial.builds).toHaveLength(1);
  expect(initial.live).toHaveLength(1);
  expect(initial.campaigns).toHaveLength(1);
  expect(initial.events).toEqual([]);
  expect(initial.live[0]?.data.hp).toBe(11);
  for (const record of [...initial.builds, ...initial.live, ...initial.campaigns])
    expect(record.schemaVersion).toBe(1);

  // The optional loopback forwarder fetches from Node, which ignores browser offline mode.
  if (process.env.OMNI_E2E_FORWARD_HTTP === '1') await context.unrouteAll({ behavior: 'wait' });
  await context.setOffline(true);
  const probe = await page.evaluate(async () => {
    const url = new URL(`/offline-network-probe-${crypto.randomUUID()}.txt`, location.href).href;
    const cached = !!(await caches.match(url));
    try {
      await fetch(url, { cache: 'no-store' });
      return { online: navigator.onLine, cached, rejected: false };
    } catch {
      return { online: navigator.onLine, cached, rejected: true };
    }
  });
  expect(probe).toEqual({ online: false, cached: false, rejected: true });

  const sheetResponse = await page.goto('/characters/the-fool/sheet');
  expect(sheetResponse?.fromServiceWorker()).toBe(true);
  await saved(page);
  await expect(page.getByRole('heading', { name: 'Character sheet', exact: true })).toBeVisible();
  expect(await readDatabase(page)).toEqual(initial);
  await hp(page).click();
  const adjustment = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await adjustment.getByRole('tab', { name: 'Damage', exact: true }).click();
  await adjustment.getByRole('button', { name: '3', exact: true }).click();
  await adjustment.getByRole('button', { name: 'Apply', exact: true }).click();
  await saved(page);
  const damaged = await readDatabase(page);
  expect(damaged.builds).toEqual(initial.builds);
  expect(damaged.campaigns).toEqual(initial.campaigns);
  expect(damaged.live).toEqual(
    initial.live.map((record) => ({ ...record, data: { ...record.data, hp: 8 } })),
  );
  expect(damaged.events).toHaveLength(1);
  const damage = damaged.events[0]!;
  expect(damage).toMatchObject({
    id: damage.data.id,
    characterId: 'the-fool',
    schemaVersion: 1,
    order: 0,
    data: { characterId: 'the-fool', command: 'applyDamage', text: 'Took 3 damage (HP 11 → 8)' },
  });
  expect(damage.data.undoneBy).toBeUndefined();

  await offlineNavigation(page);
  expect(await readDatabase(page)).toEqual(damaged);
  for (const [path, title] of [
    ['explore', 'Explore'],
    ['spells', 'Spells'],
    ['combat', 'Combat'],
  ]) {
    await offlineNavigation(page, `/characters/the-fool/${path}`);
    await expect(
      page.getByRole('main').getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    expect(await readDatabase(page)).toEqual(damaged);
    await offlineNavigation(page);
    expect(await readDatabase(page)).toEqual(damaged);
    if (path === 'explore') {
      await expect(page.getByRole('region', { name: 'Game clock', exact: true })).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Utility spells and rituals', exact: true })
          .getByRole('button', { name: /^Minor Illusion\b/ }),
      ).toBeVisible();
    }
    if (path === 'spells') {
      await page.getByRole('searchbox', { name: 'Search spells', exact: true }).fill('Dissonant');
      await page
        .getByRole('main')
        .getByRole('button', { name: /^Dissonant Whispers\b/ })
        .click();
      const detail = isMobile
        ? page.getByRole('dialog', { name: 'Dissonant Whispers', exact: true })
        : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
      await expect(detail).toContainText('WIS save DC 15');
      await expect(detail).toContainText('A deafened creature succeeds automatically.');
      await expect(
        detail.getByRole('button', { name: 'Cast Dissonant Whispers (L2)' }),
      ).toBeEnabled();
      await detail
        .getByRole('button', { name: isMobile ? 'Close' : 'Close details', exact: true })
        .click();
      expect(await readDatabase(page)).toEqual(damaged);
    }
  }

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  const restored = await readDatabase(page);
  expect(restored.builds).toEqual(initial.builds);
  expect(restored.live).toEqual(initial.live);
  expect(restored.campaigns).toEqual(initial.campaigns);
  expect(restored.events).toHaveLength(damaged.events.length + 1);
  const reversal = restored.events.at(-1)!;
  expect(restored.events[0]).toEqual({
    ...damage,
    data: { ...damage.data, undoneBy: reversal.data.id },
  });
  expect(reversal).toMatchObject({
    id: reversal.data.id,
    characterId: 'the-fool',
    schemaVersion: 1,
    order: 1,
    data: {
      characterId: 'the-fool',
      command: 'undo',
      text: `Undo: ${damage.data.text}`,
      patches: damage.data.inversePatches,
      inversePatches: damage.data.patches,
    },
  });
  expect(reversal.data.id).not.toBe(damage.data.id);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker()).toBe(true);
  await saved(page);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  expect(await readDatabase(page)).toEqual(restored);
  await fontsLoaded(page);
});

test('an updated worker waits for the open draft to close before activating', async ({
  page,
  context,
}) => {
  await page.goto('/characters/the-fool/sheet');
  await saved(page);
  await controlled(page);
  const initial = await readDatabase(page);
  await page.getByRole('button', { name: 'Edit character', exact: true }).click();
  const name = page
    .getByRole('form', { name: 'Edit character build', exact: true })
    .getByLabel('Character name', { exact: true });
  await name.fill('An unsaved session draft');
  const documentStarted = await page.evaluate(() => performance.timeOrigin);
  const originalWorker = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);

  // A new script URL forces a real browser update lifecycle, using the actual built worker.
  // No requests or worker responses are intercepted.
  const updateUrl = new URL(`/sw.js?update-test=${Date.now()}`, page.url()).href;
  const nextWorker = context.waitForEvent('serviceworker', {
    predicate: (worker) => worker.url() === updateUrl,
  });
  await page.evaluate(async (url) => {
    await navigator.serviceWorker.register(url, { scope: '/' });
  }, updateUrl);
  const worker = await nextWorker;
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { url: registration?.waiting?.scriptURL, state: registration?.waiting?.state };
      }),
    )
    .toEqual({ url: updateUrl, state: 'installed' });
  expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(
    originalWorker,
  );
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStarted);
  await expect(name).toHaveValue('An unsaved session draft');
  expect(await readDatabase(page)).toEqual(initial);

  await page.close();
  await expect
    .poll(() =>
      worker.evaluate(() => {
        const { registration } = globalThis as unknown as {
          registration: ServiceWorkerRegistration;
        };
        return { url: registration.active?.scriptURL, state: registration.active?.state };
      }),
    )
    .toEqual({ url: updateUrl, state: 'activated' });
  const reopened = await context.newPage();
  const response = await reopened.goto('/characters/the-fool/sheet');
  expect(response?.fromServiceWorker()).toBe(true);
  await saved(reopened);
  await controlled(reopened);
  expect(await readDatabase(reopened)).toEqual(initial);
});
