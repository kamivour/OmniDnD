import type { Campaign, CharacterBuild, LiveState, LogEvent } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

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

interface PersistenceTestWindow extends Window {
  __omniWriteProbe?: {
    release: () => Promise<void>;
    messages: string[];
    observer: MutationObserver;
  };
}

const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const hp = (page: Page) => hud(page).getByRole('button', { name: 'Adjust hit points' });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'campaigns', 'events'], 'readonly');
      const [builds, live, campaigns, events] = await Promise.all(
        ['builds', 'live', 'campaigns', 'events'].map((name) =>
          requestValue(transaction.objectStore(name).getAll()),
        ),
      );
      return { builds, live, campaigns, events } as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

test('commands, undo history, and seed records survive reload without reseeding', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  const seed = await readDatabase(page);
  expect(seed.builds).toHaveLength(1);
  expect(seed.campaigns).toHaveLength(1);
  expect(seed.live).toHaveLength(1);
  expect(seed.events).toEqual([]);
  expect(seed.live[0]?.data.clock.seconds).toBe(28800);
  for (const row of [...seed.builds, ...seed.live, ...seed.campaigns])
    expect(row.schemaVersion).toBe(1);

  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('button', { name: '5', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Took 5 damage' })).toBeVisible();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await page.getByRole('link', { name: 'Spells', exact: true }).filter({ visible: true }).click();
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);

  await hud(page).getByRole('button', { name: 'Adjust spell slots' }).click();
  await page
    .getByRole('dialog', { name: 'Spell slots', exact: true })
    .getByRole('button', { name: 'Restore one: Level 1 spell slots' })
    .click();
  await page.keyboard.press('Escape');
  await expect(hud(page).getByRole('img', { name: 'L1: 1 of 4 left', exact: true })).toBeVisible();
  await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await expect(hud(page).getByRole('img', { name: 'L1: 0 of 4 left', exact: true })).toBeVisible();
  const afterSlotUndo = await readDatabase(page);
  const events = afterSlotUndo.events.sort((left, right) => left.order - right.order);
  expect(events.map((row) => row.data.command)).toEqual(['applyDamage', 'adjustSlot', 'undo']);
  expect(events.every((row) => row.schemaVersion === 1)).toBe(true);
  expect(events[1]?.data.undoneBy).toBe(events[2]?.data.id);

  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/11\s*\/\s*19/);
  const restored = await readDatabase(page);
  expect(restored.builds).toEqual(seed.builds);
  expect(restored.campaigns).toEqual(seed.campaigns);
  expect(restored.live).toEqual(seed.live);
  expect(restored.events).toHaveLength(4);
});

test('unsupported saved records show a recoverable error without erasing data', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  const before = await readDatabase(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('omnidnd');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('live', 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        const store = transaction.objectStore('live');
        const request = store.get('the-fool');
        request.onsuccess = () => store.put({ ...request.result, schemaVersion: 999 });
      });
    } finally {
      db.close();
    }
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Local storage unavailable', exact: true }),
  ).toBeVisible();
  await expect(hud(page)).toHaveCount(0);
  const after = await readDatabase(page);
  expect(after.live).toEqual(before.live.map((row) => ({ ...row, schemaVersion: 999 })));
  expect(after.builds).toEqual(before.builds);
  expect(after.campaigns).toEqual(before.campaigns);
  expect(after.events).toEqual(before.events);
});

test('queued writes publish only the latest feedback and Undo reverses that command', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  await page.evaluate(async () => {
    const feedback = document.querySelector('[role="status"][aria-label="Command feedback"]');
    if (!feedback) throw new Error('command feedback not rendered');
    const messages: string[] = [];
    const observer = new MutationObserver(() => {
      const text = feedback.textContent?.trim();
      if (text) messages.push(text);
    });
    observer.observe(feedback, { childList: true, subtree: true, characterData: true });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('omnidnd');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('live', 'readwrite');
    const store = transaction.objectStore('live');
    let released = false;
    const finished = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    (window as PersistenceTestWindow).__omniWriteProbe = {
      messages,
      observer,
      release: async () => {
        released = true;
        try {
          await finished;
        } finally {
          db.close();
        }
      },
    };
    // Keep a real transaction active so application writes wait behind its lock.
    await new Promise<void>((resolve, reject) => {
      const keepAlive = () => {
        const request = store.get('the-fool');
        request.onsuccess = () => {
          resolve();
          if (!released) keepAlive();
        };
        request.onerror = () => reject(request.error);
      };
      keepAlive();
    });
  });

  try {
    await hud(page).getByRole('button', { name: 'Adjust spell slots' }).click();
    const restore = page
      .getByRole('dialog', { name: 'Spell slots', exact: true })
      .getByRole('button', { name: 'Restore one: Level 1 spell slots' });
    await restore.click();
    await restore.click();
    await page.keyboard.press('Escape');
    await expect(
      hud(page).getByRole('img', { name: 'L1: 2 of 4 left', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Saving');
    await expect(page.getByRole('status', { name: 'Command feedback', exact: true })).toBeEmpty();
  } finally {
    await page.evaluate(async () => {
      await (window as PersistenceTestWindow).__omniWriteProbe?.release();
    });
  }

  const feedback = page.getByRole('status', { name: 'Command feedback', exact: true });
  try {
    await expectSaved(page);
    await expect(feedback).toContainText('L1 slots: 2/4 left');
    const messages = await page.evaluate(
      () => (window as PersistenceTestWindow).__omniWriteProbe?.messages ?? [],
    );
    expect(messages.some((message) => message.includes('L1 slots: 2/4 left'))).toBe(true);
    expect(messages.some((message) => message.includes('L1 slots: 1/4 left'))).toBe(false);
    await feedback.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(feedback).toContainText('Undo:');
    await expectSaved(page);
  } finally {
    await page.evaluate(() => {
      (window as PersistenceTestWindow).__omniWriteProbe?.observer.disconnect();
      delete (window as PersistenceTestWindow).__omniWriteProbe;
    });
  }
  await page.reload();
  await expectSaved(page);
  await expect(hud(page).getByRole('img', { name: 'L1: 1 of 4 left', exact: true })).toBeVisible();
  const saved = await readDatabase(page);
  const events = saved.events.sort((left, right) => left.order - right.order);
  expect(events.map((row) => row.data.command)).toEqual(['adjustSlot', 'adjustSlot', 'undo']);
  expect(events[0]?.data.undoneBy).toBeUndefined();
  expect(events[1]?.data.undoneBy).toBe(events[2]?.data.id);
});

test('a stale second window cannot overwrite newer saved commands', async ({ page }) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  const second = await page.context().newPage();
  try {
    await second.goto('/characters/the-fool');
    await expectSaved(second);
    await expect(hp(second)).toHaveText(/11\s*\/\s*19/);

    await hp(page).click();
    const damage = page.getByRole('dialog', { name: 'Hit points', exact: true });
    await damage.getByRole('button', { name: '5', exact: true }).click();
    await damage.getByRole('button', { name: 'Apply', exact: true }).click();
    await expectSaved(page);
    await expect(page.getByRole('status', { name: 'Command feedback', exact: true })).toContainText(
      'Took 5 damage',
    );

    await hud(second).getByRole('button', { name: 'Adjust spell slots' }).click();
    await second
      .getByRole('dialog', { name: 'Spell slots', exact: true })
      .getByRole('button', { name: 'Restore one: Level 1 spell slots' })
      .click();
    await second.keyboard.press('Escape');
    await expect(
      second.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Save conflict');
    await expect(second.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
    await hud(second).getByRole('button', { name: 'Adjust spell slots' }).click();
    await second
      .getByRole('dialog', { name: 'Spell slots', exact: true })
      .getByRole('button', { name: 'Restore one: Level 1 spell slots' })
      .click();
    await second.keyboard.press('Escape');
    await expect(
      hud(second).getByRole('img', { name: 'L1: 1 of 4 left', exact: true }),
    ).toBeVisible();
    const saved = await readDatabase(page);
    expect(saved.live[0]?.data.hp).toBe(6);
    expect(saved.live[0]?.data.slotsUsed[1]).toBe(4);
    expect(saved.events.map((row) => row.data.command)).toEqual(['applyDamage']);

    await page.reload();
    await expectSaved(page);
    await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
    await expect(
      hud(page).getByRole('img', { name: 'L1: 0 of 4 left', exact: true }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});

test('failed writes roll back atomically and Retry saves retained changes', async ({ page }) => {
  await page.goto('/characters/the-fool');
  await expectSaved(page);
  const before = await readDatabase(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'live') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Storage quota test failure', 'QuotaExceededError');
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await hp(page).click();
  const dialog = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await dialog.getByRole('button', { name: '5', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Local save status' })).toContainText(
    'Save failed',
  );
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  expect(await readDatabase(page)).toEqual(before);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  const after = await readDatabase(page);
  expect(after.events.map((row) => row.data.command)).toEqual(['applyDamage']);
  expect(after.builds).toEqual(before.builds);
  expect(after.campaigns).toEqual(before.campaigns);
});
