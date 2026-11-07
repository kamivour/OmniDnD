import { expect, test, type Page } from './fixtures';

const ID = 'the-fool';

const main = (page: Page) => page.getByRole('main');
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function noOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(0);
}

async function navigateToJournal(page: Page) {
  if (page.viewportSize()!.width < 640) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('link', { name: 'Journal', exact: true })
      .click();
  } else {
    await page.getByRole('link', { name: 'Journal', exact: true }).click();
  }
  await expect(page).toHaveURL(`/characters/${ID}/journal`);
  await saved(page);
}

test('journal screen displays narrative, manages quests, npcs, notes, and undo restores state', async ({
  page,
  isMobile,
}, info) => {
  await page.goto(`/characters/${ID}`);
  await saved(page);

  // Navigate to Journal
  await navigateToJournal(page);
  await expect(main(page).getByRole('heading', { name: 'Journal', exact: true })).toBeVisible();

  // --- 1. Story & Traits tab: check The Fool's seeded traits ----------------
  await expect(main(page).getByText(/Quiet and observant without the mask/)).toBeVisible();
  await expect(main(page).getByText(/No magic or authority is absolute/)).toBeVisible();
  await expect(main(page).getByText(/Veyne Lobien/)).toBeVisible();

  // Edit story & traits
  await main(page).getByRole('button', { name: 'Edit story & traits', exact: true }).click();
  const storySheet = page.getByRole('dialog', { name: 'Edit story & traits', exact: true });
  await storySheet.getByLabel('Relationships', { exact: true }).fill('Allied with the Harpers');
  await storySheet.getByRole('button', { name: 'Save story', exact: true }).click();
  await expect(storySheet).toBeHidden();
  await saved(page);

  await expect(
    main(page).getByRole('region', { name: 'Relationships & Allies', exact: true }),
  ).toContainText('Allied with the Harpers');

  // --- 2. Quests tab: add quest, complete it, undo --------------------------
  await main(page).getByRole('button', { name: 'Quests', exact: true }).click();
  await expect(main(page).getByText('No active quests.')).toBeVisible();

  await main(page).getByRole('button', { name: 'Add quest', exact: true }).click();
  const questSheet = page.getByRole('dialog', { name: 'New quest', exact: true });
  await questSheet.getByLabel('Title', { exact: true }).fill('Infiltrate Cragmaw Castle');
  await questSheet.getByLabel('Notes', { exact: true }).fill('Look for Gundren Rockseeker');
  await questSheet.getByRole('button', { name: 'Add quest', exact: true }).click();
  await expect(questSheet).toBeHidden();
  await saved(page);

  await expect(main(page).getByText('Infiltrate Cragmaw Castle')).toBeVisible();
  await expect(main(page).getByText('Look for Gundren Rockseeker')).toBeVisible();

  // Complete the quest
  await main(page)
    .getByRole('button', { name: 'Complete quest: Infiltrate Cragmaw Castle', exact: true })
    .click();
  await saved(page);
  await expect(main(page).getByRole('heading', { name: 'Completed Quests (1)' })).toBeVisible();

  // --- 3. World tab: add NPC and Location ----------------------------------
  await main(page).getByRole('button', { name: 'NPCs & Locations', exact: true }).click();
  await expect(main(page).getByText('No NPCs recorded yet.')).toBeVisible();

  // Add NPC
  await main(page).getByRole('button', { name: 'Add NPC', exact: true }).click();
  const npcSheet = page.getByRole('dialog', { name: 'New NPC', exact: true });
  await npcSheet.getByLabel('Name', { exact: true }).fill('Sister Garaele');
  await npcSheet.getByLabel('Relationship', { exact: true }).fill('Harper contact');
  await npcSheet.getByLabel('Location', { exact: true }).fill('Shrine of Luck');
  await npcSheet.getByRole('button', { name: 'Add NPC', exact: true }).click();
  await expect(npcSheet).toBeHidden();
  await saved(page);

  await expect(main(page).getByText('Sister Garaele')).toBeVisible();
  await expect(main(page).getByText('Harper contact')).toBeVisible();

  // Add Location
  await main(page).getByRole('button', { name: 'Add location', exact: true }).click();
  const locSheet = page.getByRole('dialog', { name: 'New location', exact: true });
  await locSheet.getByLabel('Name', { exact: true }).fill('Tresendar Manor');
  await locSheet.getByLabel('Notes', { exact: true }).fill('Redbrand hideout ruins');
  await locSheet.getByRole('button', { name: 'Add location', exact: true }).click();
  await expect(locSheet).toBeHidden();
  await saved(page);

  await expect(main(page).getByText('Tresendar Manor')).toBeVisible();
  await expect(main(page).getByText('Redbrand hideout ruins')).toBeVisible();

  // --- 4. Session Log tab: add session note --------------------------------
  await main(page).getByRole('button', { name: 'Session Log', exact: true }).click();
  await expect(main(page).getByText('No session notes recorded yet.')).toBeVisible();

  await main(page).getByRole('button', { name: 'Add session note', exact: true }).click();
  const noteSheet = page.getByRole('dialog', { name: 'New session note', exact: true });
  await noteSheet.getByLabel('Title', { exact: true }).fill('Session 3: Ambush');
  await noteSheet.getByLabel('Notes', { exact: true }).fill('Ambushed on the Triboar Trail.');
  await noteSheet.getByRole('button', { name: 'Add session note', exact: true }).click();
  await expect(noteSheet).toBeHidden();
  await saved(page);

  await expect(main(page).getByText('Session 3: Ambush')).toBeVisible();
  await expect(main(page).getByText('Ambushed on the Triboar Trail.')).toBeVisible();

  // Screenshot and overflow check
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`journal-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });

  // --- 5. Undo restores the last change ------------------------------------
  await undo(page).click();
  await saved(page);
  await expect(main(page).getByText('No session notes recorded yet.')).toBeVisible();

  // --- 6. Reload keeps persisted changes -----------------------------------
  await page.reload();
  await saved(page);

  // Check World tab persists
  await main(page).getByRole('button', { name: 'NPCs & Locations', exact: true }).click();
  await expect(main(page).getByText('Sister Garaele')).toBeVisible();
  await expect(main(page).getByText('Tresendar Manor')).toBeVisible();

  // Check Quests tab persists
  await main(page).getByRole('button', { name: 'Quests', exact: true }).click();
  await expect(main(page).getByText('Infiltrate Cragmaw Castle')).toBeVisible();

  // Check Story tab persists
  await main(page).getByRole('button', { name: 'Story & Traits', exact: true }).click();
  await expect(main(page).getByText('Allied with the Harpers')).toBeVisible();
});

test('journal notes show formatting and never run typed HTML', async ({ page }) => {
  await page.goto(`/characters/${ID}`);
  await saved(page);
  await navigateToJournal(page);
  await main(page).getByRole('button', { name: 'Edit story & traits', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit story & traits', exact: true });
  await sheet
    .getByLabel('General Notes', { exact: true })
    .fill(
      '**Bold clue**\n\n- first\n- second\n\n<b id="injected">raw</b> [bad](javascript:alert(1))',
    );
  await sheet.getByRole('button', { name: 'Save story', exact: true }).click();
  await expect(sheet).toBeHidden();
  const notes = main(page).getByRole('region', { name: 'Freeform Notes', exact: true });
  await expect(notes.locator('strong')).toHaveText('Bold clue');
  await expect(notes.getByRole('listitem')).toHaveText(['first', 'second']);
  await expect(notes).toContainText('<b id="injected">raw</b>');
  await expect(page.locator('#injected')).toHaveCount(0);
  await expect(notes.locator('a')).toHaveCount(0);
});
