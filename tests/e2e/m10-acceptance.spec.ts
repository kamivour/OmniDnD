import { expect, test, type Page } from './fixtures';

// M10 gate: an effect with a condition and an AC bonus shows its consequences, Undo restores
// the saved live state exactly, and the result survives a reload.
const ID = 'the-fool';

const main = (page: Page) => page.getByRole('main');
const effects = (page: Page) =>
  main(page).getByRole('region', { name: 'Effects on you', exact: true });
const reminders = (page: Page) =>
  main(page).getByRole('region', { name: 'Roll reminders', exact: true });
const editor = (page: Page) => page.getByRole('dialog');
const hudAc = (page: Page) =>
  page
    .getByRole('banner', { name: 'Character HUD', exact: true })
    .locator('button[title="Armor class"]');

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
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

/** The saved live state; the event log is stored separately. */
async function savedLive(page: Page): Promise<string> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const record = (await value(
        db.transaction('live', 'readonly').objectStore('live').get(id),
      )) as { data: unknown };
      return JSON.stringify(record.data);
    } finally {
      db.close();
    }
  }, ID);
}

test('effect consequences, exact Undo and reload', async ({ page }) => {
  await page.goto(`/characters/${ID}/combat`);
  await saved(page);
  await expect(reminders(page)).toHaveCount(0);
  const acBefore = (await hudAc(page).getAttribute('aria-description')) ?? '';
  const baseAc = Number(acBefore.replace('Armor class ', ''));
  const before = await savedLive(page);

  await effects(page).getByRole('button', { name: 'Add effect', exact: true }).click();
  await editor(page).getByLabel('Name', { exact: true }).fill('Stinking cloud');
  await editor(page).getByLabel('Lasts', { exact: true }).selectOption('rounds');
  await editor(page).getByLabel('Amount', { exact: true }).fill('3');
  await editor(page).locator('summary', { hasText: 'Conditions' }).click();
  await editor(page).getByRole('checkbox', { name: 'Poisoned', exact: true }).check();
  await editor(page).locator('summary', { hasText: 'Bonuses and penalties' }).click();
  await editor(page).getByLabel('AC', { exact: true }).fill('2');
  await noOverflow(page);
  await editor(page).getByRole('button', { name: 'Add effect', exact: true }).click();

  await expect(effects(page)).toContainText('Stinking cloud');
  await expect(hudAc(page)).toHaveAttribute('aria-description', `Armor class ${baseAc + 2}`);
  await expect(reminders(page)).toContainText('Your attacks');
  await expect(reminders(page)).toContainText('poisoned');
  await noOverflow(page);
  await saved(page);

  await page.getByRole('button', { name: 'Undo last command', exact: true }).first().click();
  await expect(effects(page)).not.toContainText('Stinking cloud');
  await expect(reminders(page)).toHaveCount(0);
  await expect(hudAc(page)).toHaveAttribute('aria-description', acBefore);
  await saved(page);
  await expect.poll(() => savedLive(page)).toBe(before);

  await page.reload();
  await expect(effects(page)).toBeVisible();
  await expect(effects(page)).not.toContainText('Stinking cloud');
  await expect(reminders(page)).toHaveCount(0);
});
