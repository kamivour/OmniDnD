import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface SavedGame {
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const row = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${name}`) });
const rowCast = (page: Page, name: string) =>
  row(page, name).locator('..').getByRole('button', { name: 'Cast', exact: true });
const slot = (detail: Locator, level: number) =>
  detail.getByRole('button', { name: new RegExp(`^L${level} `) });
const ritual = (detail: Locator) =>
  detail.getByRole('checkbox', { name: 'Cast as ritual (+10 minutes)', exact: true });
const applyToMe = (detail: Locator) =>
  detail.getByRole('checkbox', { name: 'Apply to me', exact: true });
const healingRoll = (detail: Locator) => detail.getByLabel('Healing dice total', { exact: true });

async function expectSaved(page: Page) {
  await expect(
    page.getByRole('status', { name: 'Local save status', exact: true, includeHidden: true }),
  ).toContainText('Saved locally');
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function readSavedGame(page: Page, characterId = 'the-fool'): Promise<SavedGame> {
  return page.evaluate(async (id) => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const transaction = db.transaction(['live', 'events'], 'readonly');
      const [record, events] = await Promise.all([
        value(transaction.objectStore('live').get(id)) as Promise<{ data: LiveState }>,
        value(transaction.objectStore('events').getAll()) as Promise<
          { characterId: string; order: number; data: LogEvent }[]
        >,
      ]);
      return {
        live: record.data,
        events: events
          .filter((event) => event.characterId === id)
          .sort((left, right) => left.order - right.order)
          .map(({ data }) => data),
      };
    } finally {
      db.close();
    }
  }, characterId);
}

async function openCast(page: Page, spellName: string) {
  await rowCast(page, spellName).click();
  const dialog = page.getByRole('dialog', { name: `Cast ${spellName}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openPreview(page: Page, spellName: string, isMobile: boolean) {
  if (isMobile) await row(page, spellName).tap();
  else await row(page, spellName).click();
  const detail = isMobile
    ? page.getByRole('dialog', { name: spellName, exact: true })
    : page.getByRole('complementary', { name: 'Pinned detail', exact: true });
  await expect(detail).toBeVisible();
  return detail;
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Undo last command', exact: true }).click();
  await expectSaved(page);
}

async function importCharacter(page: Page, file: ExportFile) {
  await page.goto('/');
  await expectSaved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: `${file.build.id}.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(ExportFileSchema.parse(file))),
  });
  await page
    .getByRole('dialog', { name: 'Import character', exact: true })
    .getByRole('button', { name: 'Add character', exact: true })
    .click();
  await expectSaved(page);
  await page.goto(`/characters/${file.build.id}/spells`);
  await expectSaved(page);
}

function importedSeed(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  return file;
}

test('row Cast upcasts once, persists, and Undo restores the entire cast', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);
  const opener = rowCast(page, 'Dissonant Whispers');
  const dialog = await openCast(page, 'Dissonant Whispers');
  await expect(slot(dialog, 1)).toBeDisabled();
  await expect(slot(dialog, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog).toContainText('Upcast to L2: +1d6 per slot level above 1.');
  await expect(dialog).toContainText('4d6');
  await expect(applyToMe(dialog)).toHaveCount(0);
  await expect(ritual(dialog)).toHaveCount(0);
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`upcast-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Cast Dissonant Whispers (L2)', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expectSaved(page);
  const cast = await readSavedGame(page);
  expect(cast.live).toEqual({
    ...initial.live,
    slotsUsed: initial.live.slotsUsed.map((used, level) => (level === 2 ? used + 1 : used)),
  });
  expect(cast.events).toHaveLength(1);
  expect(cast.events[0]).toMatchObject({
    command: 'castSpell',
    text: 'Cast Dissonant Whispers (L2 slot)',
  });
  await expect(hud(page).getByRole('img', { name: 'L2: 1 of 2 left', exact: true })).toBeVisible();
  await page.reload();
  await expectSaved(page);
  expect(await readSavedGame(page)).toEqual(cast);
  await undo(page);
  const undone = await readSavedGame(page);
  expect(undone.live).toEqual(initial.live);
  expect(undone.events.map((event) => event.command)).toEqual(['castSpell', 'undo']);
  expect(undone.events[0]?.undoneBy).toBe(undone.events[1]?.id);
});

test('a cantrip casts from the mobile preview or pinned detail without spending a slot', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);
  const detail = await openPreview(page, 'Vicious Mockery', isMobile);
  await expect(detail.getByRole('group', { name: 'Slot level', exact: true })).toHaveCount(0);
  await expect(applyToMe(detail)).toHaveCount(0);
  await expect(ritual(detail)).toHaveCount(0);
  await detail.getByRole('button', { name: 'Cast Vicious Mockery', exact: true }).click();
  if (isMobile) {
    await expect(detail).toBeHidden();
    await expect(row(page, 'Vicious Mockery')).toBeFocused();
  }
  await expectSaved(page);
  const cast = await readSavedGame(page);
  expect(cast.live).toEqual(initial.live);
  expect(cast.events).toHaveLength(1);
  expect(cast.events[0]).toMatchObject({ command: 'castSpell', text: 'Cast Vicious Mockery' });
});

test('other-target healing leaves HP manual; self healing rejects an invalid roll and previews HP', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);
  const other = await openCast(page, 'Healing Word');
  await expect(applyToMe(other)).not.toBeChecked();
  await expect(healingRoll(other)).toHaveCount(0);
  await other.getByRole('button', { name: 'Cast Healing Word (L2)', exact: true }).click();
  await expect(other).toBeHidden();
  await expectSaved(page);
  const castOther = await readSavedGame(page);
  expect(castOther.live.hp).toBe(initial.live.hp);
  expect(castOther.live.slotsUsed[2]).toBe(1);
  expect(castOther.events).toHaveLength(1);
  await undo(page);
  const beforeSelf = await readSavedGame(page);
  expect(beforeSelf.live).toEqual(initial.live);

  const self = await openCast(page, 'Healing Word');
  await applyToMe(self).check();
  await expect(self).toContainText('Healing dice: 2d4. Casting modifier +5.');
  await expect(healingRoll(self)).toHaveAttribute('min', '2');
  await expect(healingRoll(self)).toHaveAttribute('max', '8');
  await healingRoll(self).fill('9');
  await self.getByRole('button', { name: 'Cast Healing Word (L2)', exact: true }).click();
  await expect(self.getByRole('alert')).toContainText(
    'Healing roll must be a whole number from 2 to 8',
  );
  await expectSaved(page);
  expect(await readSavedGame(page)).toEqual(beforeSelf);
  await healingRoll(self).fill('2');
  await expect(self.getByRole('status', { name: 'Healing preview', exact: true })).toHaveText(
    'Healing: 7 HP. Your HP: 11 → 18.',
  );
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`healing-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await self.getByRole('button', { name: 'Cast Healing Word (L2)', exact: true }).click();
  await expect(self).toBeHidden();
  await expectSaved(page);
  const castSelf = await readSavedGame(page);
  expect(castSelf.live.hp).toBe(18);
  expect(castSelf.live.slotsUsed[2]).toBe(1);
  expect(castSelf.events.map((event) => event.command)).toEqual(['castSpell', 'undo', 'castSpell']);
  await expect(hud(page).getByRole('button', { name: 'Adjust hit points' })).toHaveText(
    /18\s*\/\s*19/,
  );
});

test('pinned healing clears the rolled total after success before the next cast', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'pinned desktop controls stay open after a cast');
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const detail = await openPreview(page, 'Healing Word', false);
  await applyToMe(detail).check();
  await healingRoll(detail).fill('2');
  const castButton = detail.getByRole('button', { name: 'Cast Healing Word (L2)', exact: true });
  await castButton.click();
  await expectSaved(page);
  await expect(detail).toBeVisible();
  await expect(healingRoll(detail)).toHaveValue('');
  await expect(applyToMe(detail)).toBeChecked();
  const afterFirst = await readSavedGame(page);
  expect(afterFirst.live.hp).toBe(18);
  expect(afterFirst.live.slotsUsed[2]).toBe(1);
  expect(afterFirst.events).toHaveLength(1);
  await castButton.click();
  await expect(detail.getByRole('alert')).toContainText('Healing roll');
  await expectSaved(page);
  expect(await readSavedGame(page)).toEqual(afterFirst);
  await healingRoll(detail).fill('2');
  await castButton.click();
  await expectSaved(page);
  const afterSecond = await readSavedGame(page);
  expect(afterSecond.live.hp).toBe(19);
  expect(afterSecond.live.slotsUsed[2]).toBe(2);
  expect(afterSecond.events).toHaveLength(2);
});

test('Invisibility targets, concentration replacement, and Undo preserve the correct self effect', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);
  const other = await openCast(page, 'Invisibility');
  await expect(applyToMe(other)).not.toBeChecked();
  await other.getByRole('button', { name: 'Cast Invisibility (L2)', exact: true }).click();
  await expect(other).toBeHidden();
  await expectSaved(page);
  const onOther = await readSavedGame(page);
  expect(onOther.live.concentration).toMatchObject({ spellId: 'spell.invisibility', slotLevel: 2 });
  expect(onOther.live.concentration?.effectId).toBeUndefined();
  expect(onOther.live.effects).toEqual([]);
  await undo(page);
  expect((await readSavedGame(page)).live).toEqual(initial.live);

  const self = await openCast(page, 'Invisibility');
  await applyToMe(self).check();
  await self.getByRole('button', { name: 'Cast Invisibility (L2)', exact: true }).click();
  await expect(self).toBeHidden();
  await expectSaved(page);
  const onSelf = await readSavedGame(page);
  expect(onSelf.live.concentration).toMatchObject({
    spellId: 'spell.invisibility',
    slotLevel: 2,
    effectId: 'spell.invisibility',
  });
  expect(onSelf.live.effects).toMatchObject([
    { id: 'spell.invisibility', sourceId: 'spell.invisibility', conditions: ['invisible'] },
  ]);
  await expect(row(page, 'Invisibility')).toContainText('Active');
  const replacement = await openCast(page, 'Faerie Fire');
  await expect(applyToMe(replacement)).not.toBeChecked();
  await replacement.getByRole('button', { name: 'Cast Faerie Fire (L2)', exact: true }).click();
  await expect(replacement).toBeHidden();
  await expectSaved(page);
  const swapped = await readSavedGame(page);
  expect(swapped.live.concentration).toMatchObject({ spellId: 'spell.faerie-fire', slotLevel: 2 });
  expect(swapped.live.effects).toEqual([]);
  await expect(row(page, 'Faerie Fire')).toContainText('Active');
  await expect(row(page, 'Invisibility')).not.toContainText('Active');
  await undo(page);
  expect((await readSavedGame(page)).live).toEqual(onSelf.live);
  await expect(row(page, 'Invisibility')).toContainText('Active');
  await expect(row(page, 'Faerie Fire')).not.toContainText('Active');
});

test('Disguise Self applies its self effect automatically without concentration', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/spells');
  await expectSaved(page);
  const initial = await readSavedGame(page);
  const dialog = await openCast(page, 'Disguise Self');
  await expect(applyToMe(dialog)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cast Disguise Self (L2)', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectSaved(page);
  const cast = await readSavedGame(page);
  expect(cast.live.effects).toMatchObject([
    {
      id: 'spell.disguise-self',
      sourceId: 'spell.disguise-self',
      name: 'Disguise Self',
      concentration: false,
      endsAt: initial.live.clock.seconds + 3600,
    },
  ]);
  expect(cast.live.concentration).toBeUndefined();
  expect(cast.live.slotsUsed[2]).toBe(1);
  expect(cast.events).toHaveLength(1);
  await expect(
    hud(page).getByRole('button', { name: 'Adjust conditions and effects' }),
  ).toContainText('Disguise Self');
});

test('a known bard ritual needs no slot and advances the clock by ten minutes', async ({
  page,
  isMobile,
}, info) => {
  const file = importedSeed('ritual-bard');
  file.build.spells[0]!.known = file.build.spells[0]!.known.map((id) =>
    id === 'spell.disguise-self' ? 'spell.comprehend-languages' : id,
  );
  file.live.slotsUsed[2] = 2;
  await importCharacter(page, file);
  const initial = await readSavedGame(page, file.build.id);
  const dialog = await openCast(page, 'Comprehend Languages');
  await expect(
    dialog.getByRole('button', { name: 'Cast Comprehend Languages (L1)' }),
  ).toBeDisabled();
  await ritual(dialog).check();
  await expect(dialog.getByRole('group', { name: 'Slot level', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Ritual casting uses no spell slot.');
  const castButton = dialog.getByRole('button', {
    name: 'Cast Comprehend Languages (ritual)',
    exact: true,
  });
  await expect(castButton).toBeEnabled();
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`ritual-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await castButton.click();
  await expect(dialog).toBeHidden();
  await expectSaved(page);
  const cast = await readSavedGame(page, file.build.id);
  expect(cast.live).toEqual({
    ...initial.live,
    clock: { seconds: initial.live.clock.seconds + 600 },
  });
  expect(cast.events).toHaveLength(1);
  expect(cast.events[0]).toMatchObject({
    command: 'castSpell',
    text: 'Cast Comprehend Languages (ritual)',
  });
  expect(cast.events[0]?.override).toBeUndefined();
  await undo(page);
  expect((await readSavedGame(page, file.build.id)).live).toEqual(initial.live);
});

for (const scenario of ['different casting class', 'combat'] as const) {
  test(`ritual casting is unavailable for ${scenario}`, async ({ page }) => {
    const file = importedSeed(scenario === 'combat' ? 'ritual-combat' : 'ritual-sorcerer');
    if (scenario === 'different casting class') {
      // A Bard level must not lend its ritual feature to the Sorcerer association.
      file.build.classes = [
        { classId: 'class.bard', level: 2 },
        { classId: 'class.sorcerer', level: 1 },
      ];
      file.build.hpEntries[2]!.classId = 'class.sorcerer';
      file.build.spells.push({ classId: 'class.sorcerer', known: ['spell.comprehend-languages'] });
    } else {
      file.build.spells[0]!.known.push('spell.comprehend-languages');
      file.live.combat = {
        round: 1,
        turnActive: true,
        economy: {
          actionUsed: false,
          bonusUsed: false,
          reactionUsed: false,
          movementUsed: 0,
          objectInteractionUsed: false,
          bonusActionSpellCast: false,
          otherSpellCast: false,
        },
      };
    }
    await importCharacter(page, file);
    const initial = await readSavedGame(page, file.build.id);
    const dialog = await openCast(page, 'Comprehend Languages');
    await expect(ritual(dialog)).toHaveCount(0);
    await expect(dialog).toContainText(
      scenario === 'combat'
        ? 'Ritual casting is not offered during combat.'
        : 'Sorcerer does not grant ritual casting',
    );
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await readSavedGame(page, file.build.id)).toEqual(initial);
  });
}

test('warning Cancel preserves casting choices; Do anyway commits once and closes with focus', async ({
  page,
  isMobile,
}, info) => {
  const file = importedSeed('warning-bard');
  file.live.combat = {
    round: 1,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      objectInteractionUsed: false,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importCharacter(page, file);
  const initial = await readSavedGame(page, file.build.id);
  const opener = rowCast(page, 'Invisibility');
  const dialog = await openCast(page, 'Invisibility');
  await applyToMe(dialog).check();
  await slot(dialog, 2).click();
  const castButton = dialog.getByRole('button', { name: 'Cast Invisibility (L2)', exact: true });
  await castButton.click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText('Action already used');
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(castButton).toBeFocused();
  await expect(applyToMe(dialog)).toBeChecked();
  await expect(slot(dialog, 2)).toHaveAttribute('aria-pressed', 'true');
  await expect(slot(dialog, 2)).toContainText('2 left');
  expect(await readSavedGame(page, file.build.id)).toEqual(initial);
  await castButton.click();
  await expect(warning).toContainText('Action already used');
  await expectNoOverflow(page);
  await page.screenshot({
    path: info.outputPath(`cast-warning-${isMobile ? '375' : '1440'}.png`),
    animations: 'disabled',
  });
  await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expectSaved(page);
  const cast = await readSavedGame(page, file.build.id);
  expect(cast.events).toHaveLength(1);
  expect(cast.events[0]).toMatchObject({ command: 'castSpell', override: true });
  expect(cast.live.slotsUsed[2]).toBe(1);
  expect(cast.live.concentration?.effectId).toBe('spell.invisibility');
  expect(cast.live.effects).toMatchObject([
    { id: 'spell.invisibility', conditions: ['invisible'] },
  ]);
});

test('a pinned warning cast spending the last slot restores focus to the workspace', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'pinned desktop controls remain mounted after success');
  const file = importedSeed('last-slot-warning-bard');
  file.live.slotsUsed[2] = 1;
  file.live.combat = {
    round: 1,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: false,
      reactionUsed: false,
      movementUsed: 0,
      objectInteractionUsed: false,
      bonusActionSpellCast: false,
      otherSpellCast: false,
    },
  };
  await importCharacter(page, file);
  const detail = await openPreview(page, 'Invisibility', false);
  await expect(slot(detail, 2)).toContainText('1 left');
  await applyToMe(detail).check();
  const castButton = detail.getByRole('button', { name: 'Cast Invisibility (L2)', exact: true });
  await castButton.click();
  const warning = page.getByRole('dialog', { name: 'Check this action', exact: true });
  await expect(warning).toContainText('Action already used');
  await warning.getByRole('button', { name: 'Do anyway', exact: true }).click();
  await expect(warning).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(castButton).toBeDisabled();
  await expect(page.locator('#character-workspace')).toBeFocused();
  await expectSaved(page);
  const cast = await readSavedGame(page, file.build.id);
  expect(cast.live.slotsUsed[1]).toBe(4);
  expect(cast.live.slotsUsed[2]).toBe(2);
  expect(cast.events).toHaveLength(1);
  expect(cast.events[0]).toMatchObject({ command: 'castSpell', override: true });
  await expect(hud(page).getByRole('img', { name: 'L2: 0 of 2 left', exact: true })).toBeVisible();
});
