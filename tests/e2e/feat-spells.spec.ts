import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type LiveState } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

const ID = 'fey-touched-fool';
const main = (page: Page) => page.getByRole('main');

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readLive(page: Page): Promise<LiveState> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const live = db.transaction('live', 'readonly').objectStore('live').get(id);
      return ((await value(live)) as { data: LiveState }).data;
    } finally {
      db.close();
    }
  }, ID);
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

/** The Fool, fully rested, with Fey Touched raising Charisma. */
function feyTouched() {
  const file = ExportFileSchema.parse(seed);
  file.build.id = ID;
  file.build.name = 'Fey Fool';
  file.build.featureIds = [...file.build.featureIds, 'feature.feat.fey-touched'];
  file.build.abilityScores.bonuses.push({ ability: 'CHA', value: 1, source: 'Feat: Fey Touched' });
  file.live.characterId = ID;
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.events = [];
  return file;
}

test('Fey Touched: pick its spell in To do, then cast Misty Step free once', async ({ page }) => {
  await page.goto('/settings');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${ID}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(feyTouched())),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await saved(page);

  await page.goto(`/characters/${ID}/todo`);
  const item = main(page).getByRole('listitem').filter({ hasText: 'Fey Touched: choose spells' });
  await item.getByRole('button', { name: 'Choose', exact: true }).click();
  await expect(item.getByRole('checkbox', { name: 'Cure Wounds' })).toHaveCount(0);
  await item.getByRole('checkbox', { name: 'Bless', exact: true }).check();
  await item.getByRole('button', { name: 'Save choice', exact: true }).click();
  await saved(page);
  await expect(item).toHaveCount(0);
  await noOverflow(page);

  await page.goto(`/characters/${ID}/spells`);
  await saved(page);
  const row = main(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^Misty Step\b/ }) });
  await expect(row).toContainText('Fey Touched');
  await row.getByRole('button', { name: /^Cast\b/ }).click();
  const flow = page.getByRole('dialog', { name: 'Cast Misty Step', exact: true });
  await expect(flow.getByRole('button', { name: /^Free/ })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('button', { name: 'Cast Misty Step (free)', exact: true }).click();
  await expect(flow).toHaveCount(0);
  await saved(page);
  const live = await readLive(page);
  expect(live.featSpellsUsed).toEqual({ 'feature.feat.fey-touched|spell.misty-step': 1 });
  expect(live.slotsUsed.every((used) => used === 0)).toBe(true);

  // The free casting is spent; a level 2 slot still works.
  await row.getByRole('button', { name: /^Cast\b/ }).click();
  await expect(flow.getByRole('button', { name: /^Free/ })).toBeDisabled();
  await expect(
    flow.getByRole('button', { name: 'Cast Misty Step (L2)', exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});
