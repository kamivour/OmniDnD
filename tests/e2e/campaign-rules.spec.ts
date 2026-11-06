import { expect, test, type Page } from './fixtures';

const campaign = (page: Page, name: string) => page.getByRole('article', { name, exact: true });

async function expectSaved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function storedCampaigns(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const requestValue = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await requestValue(indexedDB.open('omnidnd'));
    try {
      return await requestValue(
        db.transaction('campaigns', 'readonly').objectStore('campaigns').getAll(),
      );
    } finally {
      db.close();
    }
  });
}

async function openSettings(page: Page) {
  await campaign(page, 'Campaign #273')
    .getByRole('link', { name: 'Campaign settings', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Campaign settings', exact: true })).toBeVisible();
}

test('books and optional rules save, reload and undo', async ({ page }, testInfo) => {
  await page.goto('/');
  await expectSaved(page);
  const before = await storedCampaigns(page);
  await openSettings(page);

  const sources = page.getByRole('group', { name: 'Sources', exact: true });
  const rules = page.getByRole('group', { name: 'Optional rules', exact: true });
  await expect(sources.getByRole('checkbox', { name: /Player's Handbook/ })).toBeChecked();
  await expect(sources.getByRole('checkbox', { name: /Player's Handbook/ })).toBeDisabled();
  await expect(rules.getByRole('checkbox', { checked: true })).toHaveCount(0);

  await sources.getByRole('checkbox', { name: /Dungeon Master's Guide/ }).check();
  await sources.getByRole('checkbox', { name: /Tasha's Cauldron/ }).uncheck();
  // Turning on a book never turns on its optional rules.
  await expect(rules.getByRole('checkbox', { checked: true })).toHaveCount(0);
  await rules.getByRole('checkbox', { name: /^Feats/ }).check();
  await rules.getByRole('checkbox', { name: /^Potions as a bonus action/ }).check();
  await page
    .getByRole('group', { name: 'Encumbrance', exact: true })
    .getByRole('radio', { name: /^Variant/ })
    .check();
  await page
    .getByRole('group', { name: 'Rest length', exact: true })
    .getByRole('radio', { name: /^Gritty realism/ })
    .check();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('campaign-rules.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);

  await page.reload();
  await expectSaved(page);
  await expect(campaign(page, 'Campaign #273')).toContainText('PHB, DMG, XGE');
  await openSettings(page);
  await expect(sources.getByRole('checkbox', { name: /Dungeon Master's Guide/ })).toBeChecked();
  await expect(sources.getByRole('checkbox', { name: /Tasha's Cauldron/ })).not.toBeChecked();
  await expect(rules.getByRole('checkbox', { name: /^Feats/ })).toBeChecked();
  await expect(rules.getByRole('checkbox', { name: /^Multiclassing/ })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: /^Variant/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Gritty realism/ })).toBeChecked();

  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Undo management', exact: true }).click();
  await expectSaved(page);
  await page.reload();
  await expectSaved(page);
  expect(await storedCampaigns(page)).toEqual(before);
});
