import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type Bookmark,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface ToolbarWriteGateWindow extends Window {
  __toolbarWriteGate?: {
    release: () => Promise<void>;
    messages: string[];
    observer: MutationObserver;
  };
}

const toolbar = (page: Page) => page.getByRole('region', { name: 'Character log', exact: true });
const latest = (page: Page) =>
  toolbar(page).getByRole('button', { name: 'View full log', exact: true });
const undo = (page: Page) =>
  toolbar(page).getByRole('button', { name: 'Undo last command', exact: true });
const history = (page: Page) => page.getByRole('dialog', { name: 'Character log', exact: true });
const feedback = (page: Page) =>
  page.getByRole('status', { name: 'Command feedback', exact: true });
const hp = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .getByRole('button', { name: 'Adjust hit points', exact: true });
const motion = (page: Page) =>
  page.getByRole('checkbox', { name: 'Always reduce motion', exact: true });

async function saved(page: Page) {
  // Modal sheets hide the background status from the accessibility tree.
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, id = 'the-fool') {
  return page.evaluate(async (characterId) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'events', 'settings'], 'readonly');
      const [build, live, events, settings] = await Promise.all([
        value(transaction.objectStore('builds').get(characterId)) as Promise<{
          data: CharacterBuild;
        }>,
        value(transaction.objectStore('live').get(characterId)) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
        value(transaction.objectStore('settings').getAll()) as Promise<
          { id: string; data: unknown }[]
        >,
      ]);
      return {
        build: build.data,
        live: live.data,
        events: events
          .filter((event) => event.characterId === characterId)
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
        reducedMotion: (settings.find((entry) => entry.id === 'reducedMotion')?.data ??
          false) as boolean,
        bookmarks: (settings.find((entry) => entry.id === 'bookmarks')?.data ?? []) as Bookmark[],
      };
    } finally {
      db.close();
    }
  }, id);
}

async function takeDamage(page: Page, amount = 5) {
  await hp(page).click();
  const editor = page.getByRole('dialog', { name: 'Hit points', exact: true });
  await editor.getByRole('tab', { name: 'Damage', exact: true }).click();
  for (const digit of String(amount))
    await editor.getByRole('button', { name: digit, exact: true }).click();
  await editor.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor).toBeHidden();
}

async function addBookmark(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add bookmark', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add bookmark', exact: true });
  await editor.getByLabel('Title', { exact: true }).fill(title);
  await editor.getByLabel('URL', { exact: true }).fill('https://example.com/toolbar-notes');
  await editor.getByRole('button', { name: 'Save bookmark', exact: true }).click();
  await expect(editor).toBeHidden();
  await saved(page);
}

async function importCharacter(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await saved(page);
  await page.goto(`/characters/${file.build.id}`);
  await saved(page);
}

async function oneUndo(page: Page) {
  await expect(page.getByRole('button', { name: /^Undo\b/ })).toHaveCount(1);
  // An aria-hidden background button must also stop drawing behind a modal.
  await expect(
    page.getByRole('button', { name: /^Undo\b/, includeHidden: true }).filter({ visible: true }),
  ).toHaveCount(1);
}

async function settledLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function fullyInViewport(page: Page, control: Locator) {
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await control.boundingBox();
      return box
        ? Math.max(
            0,
            -box.x,
            -box.y,
            box.x + box.width - viewport.width,
            box.y + box.height - viewport.height,
          )
        : Infinity;
    })
    .toBeLessThanOrEqual(0.5);
}

async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

test('every built and placeholder character route shares one compact log and Undo at 375, 640 and 1440 pixels', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const routes = [
    '',
    'sheet',
    'spells',
    'combat',
    'explore',
    'inventory',
    'features',
    'companions',
    'journal',
    'reference',
    'reference/credits',
    'reference/tools',
    'settings',
    'unknown-screen',
  ];
  for (const width of [375, 640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/characters/the-fool');
    await saved(page);
    await takeDamage(page, 1);
    await saved(page);
    await expect(feedback(page)).toContainText('Took 1 damage');
    await expect(feedback(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await oneUndo(page);
    for (const route of routes) {
      await page.goto(`/characters/the-fool${route ? `/${route}` : ''}`);
      await saved(page);
      await settledLayout(page);
      await expect(toolbar(page)).toHaveCount(1);
      await expect(
        page.getByRole('main').getByRole('region', { name: 'Character log', exact: true }),
      ).toHaveCount(0);
      await expect(latest(page)).toContainText('Took 1 damage');
      await expect(undo(page)).toBeEnabled();
      await oneUndo(page);
      await fullyInViewport(page, latest(page));
      await fullyInViewport(page, undo(page));
      await expect(page.getByRole('button', { name: 'Open details', exact: true })).toBeVisible();
      await noOverflow(page);
      if (width === 375) {
        await expect
          .poll(async () => (await page.getByRole('main').boundingBox())?.y ?? Infinity)
          .toBeLessThanOrEqual(150);
        if (['', 'sheet', 'spells', 'combat'].includes(route))
          await page.screenshot({
            path: test.info().outputPath(`character-toolbar-${route || 'dashboard'}-375.png`),
          });
      }
    }
    if (width === 640) {
      await expect(page.getByRole('button', { name: 'Short Rest', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Long Rest', exact: true })).toBeVisible();
    }
  }
});

test('empty and exhausted history retain one disabled Undo and Escape returns focus to the log entry', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await expect(latest(page)).toContainText('No commands yet');
  await expect(undo(page)).toBeDisabled();
  await latest(page).click();
  await expect(history(page)).toContainText('No commands yet');
  await oneUndo(page);
  await expect(
    history(page).getByRole('button', { name: 'Undo last command', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(history(page)).toBeHidden();
  await expect(latest(page)).toBeFocused();

  await takeDamage(page);
  await saved(page);
  await latest(page).click();
  const entry = history(page).getByRole('listitem').filter({ hasText: 'Took 5 damage' });
  await expect(entry).toContainText('Character');
  await oneUndo(page);
  const historyUndo = history(page).getByRole('button', { name: 'Undo last command', exact: true });
  await historyUndo.click();
  await saved(page);
  await expect(historyUndo).toBeDisabled();
  await expect(history(page)).toContainText('Undo: Took 5 damage');
  expect((await readSaved(page)).live.hp).toBe(11);
  await oneUndo(page);
  await page.keyboard.press('Escape');
  await expect(latest(page)).toBeFocused();
  await expect(undo(page)).toBeDisabled();
  await expect(latest(page)).toContainText('Undo: Took 5 damage');
});

test('long latest entries truncate without overflow and log and Undo stay reachable after a long scroll', async ({
  page,
}, info) => {
  const title = `Table rulings ${'UnbrokenCampaignReference'.repeat(20)}`;
  await page.goto('/characters/the-fool/reference');
  await saved(page);
  await addBookmark(page, title);
  await expect(latest(page)).toContainText(title);
  for (const width of [375, 640, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/characters/the-fool/sheet');
    await saved(page);
    // Screens load on first open; scroll only once the sheet has rendered.
    await expect(page.getByRole('button', { name: 'Edit character', exact: true })).toBeVisible();
    await settledLayout(page);
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await settledLayout(page);
    await fullyInViewport(page, latest(page));
    await fullyInViewport(page, undo(page));
    await oneUndo(page);
    for (const control of [latest(page), undo(page)]) {
      const bounds = await control.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await expect
      .poll(() =>
        latest(page).evaluate((element) =>
          [element, ...element.querySelectorAll<HTMLElement>('*')].some(
            (node) =>
              getComputedStyle(node).textOverflow === 'ellipsis' &&
              node.scrollWidth > node.clientWidth,
          ),
        ),
      )
      .toBe(true);
    await noOverflow(page);
  }
  await page.getByRole('button', { name: 'Open details', exact: true }).click();
  const pinned = page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(pinned).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
  );
  const closeDetails = pinned.getByRole('button', { name: 'Close details', exact: true });
  await fullyInViewport(page, closeDetails);
  await expect
    .poll(async () => {
      const row = await toolbar(page).boundingBox();
      const heading = await pinned
        .getByRole('heading', { name: 'Details', exact: true })
        .boundingBox();
      return heading && row ? heading.y - (row.y + row.height) : -Infinity;
    })
    .toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: info.outputPath('character-toolbar-long-entry.png') });
  await closeDetails.click();
  await latest(page).click();
  await expect(history(page).getByRole('listitem').filter({ hasText: title })).toContainText(
    'Workspace',
  );
  await page.keyboard.press('Escape');
  await expect(latest(page)).toBeFocused();
});

test('interleaved character, preference and bookmark changes Undo in local order across reloads', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await takeDamage(page);
  await saved(page);
  await page.goto('/characters/the-fool/settings');
  await saved(page);
  await page.evaluate(async () => {
    const feedback = document.querySelector('[role="status"][aria-label="Command feedback"]');
    if (!feedback) throw new Error('Command feedback is missing');
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
    (window as ToolbarWriteGateWindow).__toolbarWriteGate = {
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
    // Hold a real lock so preference and Undo saves queue without changing their data.
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
  const preferences = page.getByRole('group', { name: 'Preferences', exact: true });
  try {
    await motion(page).check();
    await expect(preferences).toHaveAttribute('aria-busy', 'true');
    await expect(latest(page)).toContainText('Settings:');
    await expect(undo(page)).toBeEnabled();
    await undo(page).click();
    await expect(motion(page)).not.toBeChecked();
    await expect(latest(page)).toContainText('Undo: Settings:');
  } finally {
    await page.evaluate(async () => {
      await (window as ToolbarWriteGateWindow).__toolbarWriteGate?.release();
    });
  }
  try {
    await saved(page);
    await expect(preferences).toHaveAttribute('aria-busy', 'false');
    await expect(feedback(page)).toContainText('Undo: Settings:');
    const messages = await page.evaluate(
      () => (window as ToolbarWriteGateWindow).__toolbarWriteGate?.messages ?? [],
    );
    expect(messages.some((message) => /^Settings:/.test(message))).toBe(false);
  } finally {
    await page.evaluate(() => {
      (window as ToolbarWriteGateWindow).__toolbarWriteGate?.observer.disconnect();
      delete (window as ToolbarWriteGateWindow).__toolbarWriteGate;
    });
  }
  // The screen's own management hook must re-enable after the toolbar supersedes its save.
  await motion(page).check();
  await saved(page);
  await expect(motion(page)).toBeChecked();
  await expect(latest(page)).toContainText('Settings:');
  await expect(feedback(page)).toContainText('Settings:');
  await oneUndo(page);
  await page.goto('/characters/the-fool/reference');
  await saved(page);
  await addBookmark(page, 'Toolbar order');
  await expect(latest(page)).toContainText('Add bookmark: Toolbar order');
  await expect(feedback(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await oneUndo(page);
  await latest(page).click();
  await expect(
    history(page).getByRole('listitem').filter({ hasText: 'Took 5 damage' }),
  ).toContainText('Character');
  const preferenceEntries = history(page).getByRole('listitem').filter({ hasText: 'Settings:' });
  await expect(preferenceEntries).toHaveCount(3);
  for (const entry of await preferenceEntries.all()) await expect(entry).toContainText('Workspace');
  await expect(
    history(page).getByRole('listitem').filter({ hasText: 'Add bookmark: Toolbar order' }),
  ).toContainText('Workspace');
  await page.keyboard.press('Escape');

  for (const [lastText, expectedHp, reducedMotion, bookmarks] of [
    ['Undo: Add bookmark: Toolbar order', 6, true, 0],
    ['Undo: Settings:', 6, false, 0],
    ['Undo: Took 5 damage', 11, false, 0],
  ] as const) {
    await page.reload();
    await saved(page);
    await undo(page).click();
    await saved(page);
    await expect(latest(page)).toContainText(lastText);
    const state = await readSaved(page);
    expect(state.live.hp).toBe(expectedHp);
    expect(state.reducedMotion).toBe(reducedMotion);
    expect(state.bookmarks).toHaveLength(bookmarks);
    await oneUndo(page);
  }
  await expect(undo(page)).toBeDisabled();
  await expect(latest(page)).toBeFocused();
  await page.reload();
  await saved(page);
  await expect(latest(page)).toContainText('Undo: Took 5 damage');
  await expect(undo(page)).toBeDisabled();
});

test('future dates in imported history cannot outrank subsequent local character and workspace changes', async ({
  page,
}) => {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'toolbar-future-history';
  file.build.name = 'Future history';
  file.live.characterId = file.build.id;
  // A valid legacy export can contain a clock far ahead of this device's local clock.
  file.events = [
    {
      id: 'future-imported-damage',
      characterId: file.build.id,
      realTime: '2099-01-01T00:00:00.000Z',
      gameSeconds: file.live.clock.seconds,
      command: 'applyDamage',
      text: 'Took 2 damage (HP 13 → 11)',
      patches: [{ op: 'replace', path: ['live', 'hp'], value: 11 }],
      inversePatches: [{ op: 'replace', path: ['live', 'hp'], value: 13 }],
    },
  ];
  await importCharacter(page, file);
  await takeDamage(page);
  await saved(page);
  await expect(latest(page)).toContainText('Took 5 damage');
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  await motion(page).check();
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(latest(page)).toContainText('Settings:');
  await undo(page).click();
  await saved(page);
  const afterPreferenceUndo = await readSaved(page, file.build.id);
  expect(afterPreferenceUndo.reducedMotion).toBe(false);
  expect(afterPreferenceUndo.live.hp).toBe(6);
  await expect(latest(page)).toContainText('Undo: Settings:');
  await page.reload();
  await saved(page);
  await undo(page).click();
  await saved(page);
  const afterDamageUndo = await readSaved(page, file.build.id);
  expect(afterDamageUndo.live.hp).toBe(11);
  expect(afterDamageUndo.events[0]?.realTime).toBe('2099-01-01T00:00:00.000Z');
  expect(afterDamageUndo.events[0]?.undoneBy).toBeUndefined();
  await expect(latest(page)).toContainText('Undo: Took 5 damage');
});

test('Manage spells keeps one physically drawn and accessible functional Undo while the global button is hidden', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/settings');
  await saved(page);
  await takeDamage(page, 1);
  await saved(page);
  await motion(page).check();
  await saved(page);
  await page.goto('/characters/the-fool/spells');
  await saved(page);
  const before = await readSaved(page);
  await page.getByRole('main').getByRole('button', { name: 'Manage', exact: true }).click();
  const manager = page.getByRole('dialog', { name: 'Manage spells', exact: true });
  await expect(manager).toBeVisible();
  await oneUndo(page);
  const managerUndo = manager.getByRole('button', { name: 'Undo last command', exact: true });
  await expect(managerUndo).toHaveAttribute('title', /Workspace: Settings:/);
  await managerUndo.click();
  await saved(page);
  const afterWorkspaceUndo = await readSaved(page);
  expect(afterWorkspaceUndo.reducedMotion).toBe(false);
  expect(afterWorkspaceUndo.live.hp).toBe(before.live.hp);
  expect(afterWorkspaceUndo.build.spells).toEqual(before.build.spells);
  await manager.getByRole('button', { name: 'Remove known Disguise Self', exact: true }).click();
  await saved(page);
  await expect(
    manager.getByRole('button', { name: 'Remove known Disguise Self', exact: true }),
  ).toHaveCount(0);
  await oneUndo(page);
  await expect(feedback(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await manager.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await saved(page);
  await expect(
    manager.getByRole('button', { name: 'Remove known Disguise Self', exact: true }),
  ).toBeVisible();
  expect((await readSaved(page)).build.spells).toEqual(before.build.spells);
  await oneUndo(page);
  await manager.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(manager).toBeHidden();
  await expect(undo(page)).toBeVisible();
  await oneUndo(page);
});

test('full history keeps its single Undo visible while reading the oldest retained entries', async ({
  page,
}) => {
  const file = ExportFileSchema.parse(seed);
  file.build.id = 'toolbar-long-history';
  file.build.name = 'Long history';
  file.live.characterId = file.build.id;
  file.events = Array.from({ length: 80 }, (_, index) => ({
    id: `retained-${index}`,
    characterId: file.build.id,
    realTime: '2026-11-01T00:00:00.000Z',
    gameSeconds: file.live.clock.seconds,
    command: 'manualAdjust',
    text: `Retained command ${index}: a previous character correction`,
    patches: [],
    inversePatches: [],
  }));
  await importCharacter(page, file);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await latest(page).click();
    const historyUndo = history(page).getByRole('button', {
      name: 'Undo last command',
      exact: true,
    });
    await history(page).getByRole('listitem').last().scrollIntoViewIfNeeded();
    await fullyInViewport(page, historyUndo);
    await expect(historyUndo).toBeInViewport({ ratio: 1 });
    await oneUndo(page);
    await page.keyboard.press('Escape');
    await expect(latest(page)).toBeFocused();
  }
});

test('a failed save retains Retry, details and one Undo without a second action in command feedback', async ({
  page,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'live') {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Toolbar save failure', 'QuotaExceededError');
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await takeDamage(page);
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Save failed',
  );
  await expect(feedback(page)).toContainText('Retry saving');
  await expect(feedback(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(latest(page)).toContainText('Took 5 damage');
  await oneUndo(page);
  await expect(page.getByRole('button', { name: 'Open details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(hp(page)).toHaveText(/6\s*\/\s*19/);
  await oneUndo(page);
});

test('a cross-window conflict keeps its explanation, log, details and single Undo visible', async ({
  page,
  context,
}) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const stale = await context.newPage();
  try {
    await stale.goto('/characters/the-fool');
    await saved(stale);
    await takeDamage(page, 1);
    await saved(page);
    await takeDamage(stale, 1);
    const status = stale.getByRole('status', { name: 'Local save status', exact: true });
    await expect(status).toContainText('Save conflict');
    await expect(status).toContainText(/Reload this window before editing/i);
    await expect(stale.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
    await expect(latest(stale)).toContainText('Took 1 damage');
    await fullyInViewport(stale, latest(stale));
    await fullyInViewport(stale, undo(stale));
    await expect(stale.getByRole('button', { name: 'Open details', exact: true })).toBeVisible();
    await oneUndo(stale);
    await noOverflow(stale);
  } finally {
    await stale.close();
  }
});

test('hub management retains its inline and transient Undo behavior', async ({ page }) => {
  await page.goto('/reference');
  await saved(page);
  await addBookmark(page, 'Hub management remains available');
  await expect(toolbar(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo management', exact: true })).toBeEnabled();
  const toastUndo = feedback(page).getByRole('button', { name: 'Undo', exact: true });
  await expect(toastUndo).toBeVisible();
  await toastUndo.click();
  await saved(page);
  await expect(
    page.getByRole('article', { name: 'Hub management remains available', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo management', exact: true })).toBeDisabled();
});
