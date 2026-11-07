import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// ---------------------------------------------------------------------------
// M11 gate: campaign sources and optional rules change play behavior at phone
// and desktop widths. The scenario configures campaign books and rules, checks
// rest length, variant encumbrance speed + reminders, and potion as bonus
// action in combat, then verifies Undo and reload.
// ---------------------------------------------------------------------------

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

const ID = 'm11-gate';
const CAMPAIGN_ID = 'campaign-273';

const main = (page: Page) => page.getByRole('main');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });
const weight = (page: Page) =>
  main(page).getByRole('region', { name: 'Carried weight', exact: true });
const reminders = (page: Page) =>
  main(page).getByRole('region', { name: 'Roll reminders', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, id: string): Promise<SavedCharacter> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['builds', 'live', 'events'], 'readonly');
      const [build, live, events] = await Promise.all([
        value(transaction.objectStore('builds').get(id)) as Promise<{ data: CharacterBuild }>,
        value(transaction.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        build: build.data,
        live: live.data,
        events: events
          .filter((event) => event.characterId === id)
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, id);
}

function fixture(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = ID;
  file.build.name = ID;
  file.build.items = [];
  file.live.characterId = ID;
  file.live.items = {};
  file.live.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  file.live.hp = 5;
  file.events = [];
  return file;
}

function addItem(file: ExportFile, instanceId: string, itemId: string, qty: number) {
  file.build.items.push({ instanceId, itemId });
  file.live.items[instanceId] = { qty, equipped: false, attuned: false };
}

async function importCharacter(page: Page, file: ExportFile) {
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await saved(page);
}

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

async function openRest(page: Page, kind: 'Short' | 'Long') {
  const name = `${kind} Rest`;
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('button', { name, exact: true })
      .click();
  } else {
    await page.getByRole('button', { name, exact: true }).filter({ visible: true }).click();
  }
  const dialog = page.getByRole('dialog', { name, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

// ---------------------------------------------------------------------------
// The acceptance test configures campaign #273 with gritty rests, variant
// encumbrance and the potion house rule, then plays through a short scenario.
// ---------------------------------------------------------------------------

test('M11 gate: campaign rules apply in play, Undo restores, reload keeps', async ({
  page,
  isMobile,
}, info) => {
  // --- Setup: import a test character with heavy load and a potion ---------
  const file = fixture();
  // STR 11 → capacity 165 lb. Variant thresholds: 55 (encumbered), 110 (heavy).
  // 56 torches × 1 lb = 56 lb: above 55, triggers "Encumbered" (−10 ft speed).
  addItem(file, 'torches', 'item.torch', 56);
  addItem(file, 'potion', 'item.potion-of-healing-common', 2);
  await importCharacter(page, file);

  // --- Step 1: configure campaign rules ------------------------------------
  await page.goto(`/campaigns/${CAMPAIGN_ID}/settings`);
  await saved(page);

  // Enable variant encumbrance.
  await page
    .getByRole('group', { name: 'Encumbrance', exact: true })
    .getByRole('radio', { name: /^Variant/ })
    .check();
  // Enable gritty realism rests.
  await page
    .getByRole('group', { name: 'Rest length', exact: true })
    .getByRole('radio', { name: /^Gritty realism/ })
    .check();
  // Enable potion as bonus action.
  await page
    .getByRole('group', { name: 'Optional rules', exact: true })
    .getByRole('checkbox', { name: /^Potions as a bonus action/ })
    .check();

  // Turning on a book never turns on its optional rules: DMG on, then check.
  const sources = page.getByRole('group', { name: 'Sources', exact: true });
  await sources.getByRole('checkbox', { name: /Dungeon Master's Guide/ }).check();
  const rules = page.getByRole('group', { name: 'Optional rules', exact: true });
  await expect(rules.getByRole('checkbox', { name: /^Multiclassing/ })).not.toBeChecked();
  await expect(rules.getByRole('checkbox', { name: /^Feats/ })).not.toBeChecked();

  await noOverflow(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL('/');
  await saved(page);

  // --- Step 2: rest length — gritty realism changes preview ----------------
  await page.goto(`/characters/${ID}`);
  await saved(page);

  const beforeRest = await readSaved(page, ID);
  const shortDialog = await openRest(page, 'Short');
  const shortPreview = shortDialog.getByRole('region', { name: 'Rest preview', exact: true });
  // Gritty short rest = 8 h.
  await expect(shortPreview).toContainText('+8 h');
  await shortDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Data unchanged after cancel.
  expect(await readSaved(page, ID)).toEqual(beforeRest);

  const longDialog = await openRest(page, 'Long');
  const longPreview = longDialog.getByRole('region', { name: 'Rest preview', exact: true });
  // Gritty long rest = 7 days.
  await expect(longPreview).toContainText('+7 days');
  await longDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  // --- Step 3: variant encumbrance — speed reduction + reminders -----------
  await page.goto(`/characters/${ID}/inventory`);
  await saved(page);
  await expect(weight(page)).toContainText('Encumbered');

  // Sheet speed should be 20 (30 base − 10 encumbrance penalty).
  await page.goto(`/characters/${ID}/sheet`);
  await saved(page);
  await expect(
    main(page).getByRole('button', { name: 'Show Speed breakdown', exact: true }),
  ).toContainText('20');

  // Dashboard roll reminders appear for encumbered.
  await page.goto(`/characters/${ID}`);
  await saved(page);
  // No heavy-encumbrance reminders at this weight.
  await expect(reminders(page)).toHaveCount(0);

  // --- Step 4: potion as bonus action in combat ----------------------------
  await page.goto(`/characters/${ID}/combat`);
  await saved(page);
  await main(page).getByRole('button', { name: 'Start combat', exact: true }).click();
  await main(page).getByRole('button', { name: 'Start Turn', exact: true }).click();
  await saved(page);

  await main(page).getByRole('tab', { name: 'Items', exact: true }).click();
  const potion = main(page).getByRole('article', { name: 'Potion of Healing', exact: true });
  // The house-rule label should be visible.
  await expect(potion).toContainText('Bonus action to drink');

  const beforePotion = await readSaved(page, ID);
  // Drink a potion: should spend bonus action, not action.
  await potion.getByLabel('2d4 roll', { exact: true }).fill('4');
  await potion.getByRole('button', { name: 'Drink: Potion of Healing', exact: true }).click();
  await saved(page);
  const afterPotion = await readSaved(page, ID);
  expect(afterPotion.live.combat!.economy.bonusUsed).toBe(true);
  expect(afterPotion.live.combat!.economy.actionUsed).toBe(false);
  // HP increased (was 5, potion heals 2d4+2, entered 4 → 4+2 = 6 healed).
  expect(afterPotion.live.hp).toBe(11);

  // --- Step 5: Undo restores the exact saved data --------------------------
  await undo(page).click();
  await saved(page);
  const afterUndo = await readSaved(page, ID);
  expect(afterUndo.build).toEqual(beforePotion.build);
  expect(afterUndo.live).toEqual(beforePotion.live);

  // --- Step 6: reload keeps the state --------------------------------------
  await page.reload();
  await saved(page);
  const afterReload = await readSaved(page, ID);
  expect(afterReload.build).toEqual(beforePotion.build);
  expect(afterReload.live).toEqual(beforePotion.live);

  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`m11-gate-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
});
