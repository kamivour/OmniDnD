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
  // Books already in use are locked on; the table can only add more.
  await expect(sources.getByRole('checkbox', { name: /Tasha's Cauldron/ })).toBeDisabled();
  await expect(
    sources
      .getByRole('group', { name: "Parts of Tasha's Cauldron of Everything", exact: true })
      .getByRole('checkbox', { name: /^Spells/ }),
  ).toBeDisabled();
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
  await expect(campaign(page, 'Campaign #273')).toContainText('PHB, DMG, XGE, TCE');
  await openSettings(page);
  await expect(sources.getByRole('checkbox', { name: /Dungeon Master's Guide/ })).toBeChecked();
  await expect(sources.getByRole('checkbox', { name: /Dungeon Master's Guide/ })).toBeDisabled();
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

test('a new campaign can use only some parts of a book and add more later', async ({ page }) => {
  await page.goto('/');
  await expectSaved(page);
  await page.getByRole('link', { name: 'New campaign', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Chapter One');
  const sources = page.getByRole('group', { name: 'Sources', exact: true });
  await sources.getByRole('checkbox', { name: /Xanathar's Guide/ }).check();
  const parts = sources.getByRole('group', {
    name: "Parts of Xanathar's Guide to Everything",
    exact: true,
  });
  await expect(parts.getByRole('checkbox', { checked: true })).toHaveCount(4);
  await parts.getByRole('checkbox', { name: 'Spells', exact: true }).uncheck();
  await parts.getByRole('checkbox', { name: 'Magic items', exact: true }).uncheck();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  const card = campaign(page, 'Chapter One');
  await expect(card).toContainText('PHB, XGE (classes and origins, feats)');

  await card.getByRole('link', { name: 'Campaign settings', exact: true }).click();
  await expect(sources.getByRole('checkbox', { name: /Xanathar's Guide/ })).toBeDisabled();
  await expect(parts.getByRole('checkbox', { name: /^Feats/ })).toBeDisabled();
  const spells = parts.getByRole('checkbox', { name: 'Spells', exact: true });
  await expect(spells).toBeEnabled();
  await spells.check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expectSaved(page);
  await expect(card).toContainText('PHB, XGE (classes and origins, feats, spells)');
});
