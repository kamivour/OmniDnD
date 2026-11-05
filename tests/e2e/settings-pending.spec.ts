import type { ManagementEvent } from '../../src/engine/commands/management';
import { expect, test, type Page } from './fixtures';

interface Stored<T> {
  id: string;
  data: T;
}

interface SavedPreferences {
  automation: string;
  reducedMotion: boolean;
  managementEvents: ManagementEvent[];
}

interface SettingsPendingWindow extends Window {
  __omniSettingsWrite?: { release: () => Promise<void> };
}

const automation = (page: Page, name: 'Assisted' | 'Manual') =>
  page.getByRole('radio', { name: new RegExp(`^${name}`) });
const reducedMotion = (page: Page) =>
  page.getByRole('checkbox', { name: 'Always reduce motion', exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readPreferences(page: Page): Promise<SavedPreferences> {
  return page.evaluate(async () => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      const rows: Stored<unknown>[] = await requestValue(
        db.transaction('settings', 'readonly').objectStore('settings').getAll(),
      );
      return {
        automation: rows.find((row) => row.id === 'automation')?.data,
        reducedMotion: rows.find((row) => row.id === 'reducedMotion')?.data,
        managementEvents: rows.find((row) => row.id === 'managementEvents')?.data,
      } as SavedPreferences;
    } finally {
      db.close();
    }
  });
}

async function holdSave(page: Page) {
  await page.evaluate(async () => {
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
    (window as SettingsPendingWindow).__omniSettingsWrite = {
      release: async () => {
        released = true;
        try {
          await finished;
        } finally {
          db.close();
        }
      },
    };
    // Hold a real write lock, as in persistence.spec.ts, without changing saved records.
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
}

async function releaseSave(page: Page) {
  await page.evaluate(async () => {
    await (window as SettingsPendingWindow).__omniSettingsWrite?.release();
    delete (window as SettingsPendingWindow).__omniSettingsWrite;
  });
}

for (const settings of [
  { route: '/settings', first: 'automation' },
  { route: '/characters/the-fool/settings', first: 'motion' },
] as const) {
  test(`${settings.route} natively disables preferences during saving and restores usable commands`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(settings.route);
    await expectSaved(page);
    const before = await readPreferences(page);
    expect(before.automation).toBe('assisted');
    expect(before.reducedMotion).toBe(false);
    expect(before.managementEvents).toEqual([]);

    const assisted = automation(page, 'Assisted');
    const manual = automation(page, 'Manual');
    const motion = reducedMotion(page);
    const preferences = page.getByRole('group', { name: 'Preferences', exact: true });
    const saving = page.getByRole('status', { name: 'Preference save status', exact: true });
    const leaveSettings = page
      .getByRole('link', { name: 'All campaigns', exact: true })
      .filter({ visible: true })
      .last();
    const firstAutomation = settings.first === 'automation' ? 'manual' : 'assisted';
    const firstMotion = settings.first === 'motion';

    await holdSave(page);
    try {
      if (settings.first === 'automation') {
        await manual.focus();
        await expect(manual).toBeFocused();
        await page.keyboard.press('Space');
      } else await motion.check();
      await expect(saving).toContainText('Saving changes. Preferences will be available');
      await expect(preferences).toHaveAttribute('disabled', '');
      await expect(preferences).toHaveAttribute('aria-busy', 'true');
      for (const input of [assisted, manual, motion]) {
        await expect(input).toBeDisabled();
        // aria-disabled alone passes accessibility checks but does not disable native inputs.
        expect(await input.evaluate((element) => element.matches(':disabled'))).toBe(true);
      }

      if (settings.first === 'motion') {
        // Disabled clicks can focus the workspace; test keyboard restoration without them above.
        // Real pointer activation still reaches these controls and must not change preferences.
        await manual.click({ force: true });
        await motion.click({ force: true });
      }
      await expect(
        automation(page, firstAutomation === 'manual' ? 'Manual' : 'Assisted'),
      ).toBeChecked();
      await expect(motion).toBeChecked({ checked: firstMotion });
      if (settings.first === 'motion') await leaveSettings.focus();
    } finally {
      await releaseSave(page);
    }

    await expectSaved(page);
    await expect(saving).toHaveCount(0);
    for (const input of [assisted, manual, motion]) await expect(input).toBeEnabled();
    await expect(settings.first === 'automation' ? manual : leaveSettings).toBeFocused();
    const saved = await readPreferences(page);
    expect(saved.automation).toBe(firstAutomation);
    expect(saved.reducedMotion).toBe(firstMotion);
    expect(saved.managementEvents.map((event) => event.command)).toEqual(['updatePreferences']);

    const second = settings.first === 'automation' ? motion : manual;
    await second.focus();
    await page.keyboard.press('Space');
    await expectSaved(page);
    await expect(second).toBeFocused();
    const changedAgain = await readPreferences(page);
    expect(changedAgain.automation).toBe('manual');
    expect(changedAgain.reducedMotion).toBe(true);
    expect(changedAgain.managementEvents.map((event) => event.command)).toEqual([
      'updatePreferences',
      'updatePreferences',
    ]);

    const undo =
      settings.route === '/settings'
        ? page.getByRole('button', { name: 'Undo management', exact: true })
        : page
            .getByRole('region', { name: 'Character log', exact: true })
            .getByRole('button', { name: 'Undo last command', exact: true });
    await undo.click();
    await expectSaved(page);
    const undone = await readPreferences(page);
    expect(undone.automation).toBe(firstAutomation);
    expect(undone.reducedMotion).toBe(firstMotion);
    await undo.click();
    await expectSaved(page);
    await page.reload();
    await expectSaved(page);
    await expect(automation(page, 'Assisted')).toBeChecked();
    await expect(reducedMotion(page)).not.toBeChecked();
    const restored = await readPreferences(page);
    expect(restored.automation).toBe(before.automation);
    expect(restored.reducedMotion).toBe(before.reducedMotion);
    expect(restored.managementEvents.map((event) => event.command)).toEqual([
      'updatePreferences',
      'updatePreferences',
      'undo',
      'undo',
    ]);
  });
}
