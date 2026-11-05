import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import type { WorkspaceRows } from '../../src/db/database';
import {
  ExportFileSchema,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface Stored<T> {
  id: string;
  schemaVersion: number;
  data: T;
}

interface BackupData {
  reason: string;
  capturedAt: string;
  workspace: WorkspaceRows;
}

interface DatabaseSnapshot {
  builds: Stored<CharacterBuild>[];
  live: Stored<LiveState>[];
  campaigns: Stored<Campaign>[];
  events: (Stored<LogEvent> & { characterId: string; order: number })[];
  settings: Stored<unknown>[];
  backups: Stored<BackupData>[];
}

interface ResetTestWindow extends Window {
  __failedResetBackup?: Stored<BackupData>;
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Reset character', exact: true });
const opener = (page: Page) => page.getByRole('button', { name: 'Review reset', exact: true });
const confirm = (page: Page) =>
  dialog(page).getByRole('checkbox', {
    name: 'I understand this resets current resources and effects',
    exact: true,
  });
const apply = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Reset character', exact: true });
const preview = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Reset preview', exact: true });
const change = (page: Page, label: string) =>
  preview(page).getByText(label, { exact: true }).locator('..').locator('dd');
const hud = (page: Page) => page.getByRole('banner', { name: 'Character HUD', exact: true });
const hp = (page: Page) => hud(page).getByRole('button', { name: 'Adjust hit points' });
const undo = (page: Page) => page.getByRole('button', { name: 'Undo last command', exact: true });

async function saved(page: Page) {
  await expect(page.locator('[role="status"][aria-label="Local save status"]')).toContainText(
    'Saved locally',
  );
}

async function readDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async () => {
    const value = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await value(indexedDB.open('omnidnd'));
    try {
      const stores = ['builds', 'live', 'campaigns', 'events', 'settings', 'backups'];
      const transaction = db.transaction(stores, 'readonly');
      return Object.fromEntries(
        await Promise.all(
          stores.map(async (name) => [name, await value(transaction.objectStore(name).getAll())]),
        ),
      ) as unknown as DatabaseSnapshot;
    } finally {
      db.close();
    }
  });
}

function workspace(snapshot: DatabaseSnapshot): WorkspaceRows {
  const setting = (id: string) => snapshot.settings.find((row) => row.id === id)?.data;
  return {
    builds: snapshot.builds,
    live: snapshot.live,
    events: snapshot.events,
    campaigns: snapshot.campaigns,
    automation: setting('automation'),
    reducedMotion: setting('reducedMotion'),
    managementEvents: setting('managementEvents'),
    bookmarks: setting('bookmarks'),
    activityOrder: setting('activityOrder'),
  } as WorkspaceRows;
}

function normalized(rows: WorkspaceRows) {
  const byId = <T extends { id: string }>(values: T[]) =>
    [...values].sort((left, right) => left.id.localeCompare(right.id));
  return {
    ...rows,
    builds: byId(rows.builds),
    live: byId(rows.live),
    events: byId(rows.events),
    campaigns: byId(rows.campaigns),
  };
}

function character(snapshot: DatabaseSnapshot, id: string) {
  return {
    build: snapshot.builds.find((row) => row.id === id)!.data,
    live: snapshot.live.find((row) => row.id === id)!.data,
    events: snapshot.events
      .filter((row) => row.characterId === id)
      .sort((left, right) => left.order - right.order)
      .map((row) => row.data),
  };
}

function resetFixture(): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.campaign.id = 'reset-campaign';
  file.campaign.name = 'Reset campaign';
  file.campaign.leveling = 'xp';
  file.build.campaignId = file.campaign.id;
  file.build.id = 'reset-caster';
  file.build.name = 'Reset prepared caster';
  file.build.xp = 36000;
  file.build.classes.push(
    { classId: 'class.cleric', level: 3 },
    { classId: 'class.warlock', level: 2 },
  );
  file.build.hpEntries.push(
    ...Array.from({ length: 5 }, (_, index) => ({
      level: index + 4,
      classId: index < 3 ? 'class.cleric' : 'class.warlock',
      value: 4,
      method: 'rolled' as const,
    })),
  );
  file.build.spells.push(
    { classId: 'class.cleric', known: ['spell.guidance'], prepared: ['spell.bless'] },
    { classId: 'class.warlock', known: ['spell.eldritch-blast', 'spell.hellish-rebuke'] },
  );
  file.build.overrides = [{ path: '/ac', value: 17, note: 'DM armor blessing' }];
  file.live.characterId = file.build.id;
  file.live.hp = 0;
  file.live.tempHp = 4;
  file.live.inspiration = false;
  file.live.deathSaves = { success: 0, fail: 3 };
  file.live.exhaustion = 4;
  file.live.conditions = ['poisoned', 'prone'];
  file.live.slotsUsed = [0, 3, 1, 1, 0, 0, 0, 0, 0, 0];
  file.live.pactSlotsUsed = 2;
  file.live.hitDiceSpent = { d8: 6 };
  file.live.featureUsesSpent = {
    'feature.bard.bardic-inspiration': 4,
    'feature.cleric.channel-divinity': 1,
  };
  file.live.clock.seconds = 98765;
  file.live.lastLongRestEnd = 24680;
  file.live.currency = { cp: 11, sp: 12, ep: 13, gp: 14, pp: 15 };
  const firstItem = file.build.items[0]!.instanceId;
  file.live.items[firstItem] = { qty: 2, charges: 1, equipped: true, attuned: true };
  file.live.effects = [
    {
      id: 'reset-invisibility',
      name: 'Invisibility',
      sourceId: 'spell.invisibility',
      endsAt: 100000,
      concentration: true,
      conditions: ['invisible'],
      modifiers: [],
    },
    {
      id: 'reset-ward',
      name: 'Camp ward',
      concentration: false,
      conditions: [],
      modifiers: [{ target: 'saves', value: 1 }],
    },
  ];
  file.live.concentration = {
    spellId: 'spell.invisibility',
    slotLevel: 2,
    endsAt: 100000,
    effectId: 'reset-invisibility',
    pendingSaves: [{ id: 'before-reset-save', dc: 11 }],
  };
  file.live.combat = {
    round: 3,
    turnActive: true,
    economy: {
      actionUsed: true,
      bonusUsed: true,
      reactionUsed: true,
      movementUsed: 15,
      dashCount: 1,
      objectInteractionUsed: true,
      bonusActionSpellCast: true,
      otherSpellCast: false,
    },
  };
  file.events = [];
  return ExportFileSchema.parse(file);
}

async function setupCaster(page: Page) {
  const file = resetFixture();
  await page.goto('/');
  await saved(page);
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'reset-caster.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const importing = page.getByRole('dialog', { name: 'Import character', exact: true });
  await importing.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(importing).toBeHidden();
  await saved(page);
  // Keep a real prior command in the character history without changing its session effects.
  await page.goto(`/characters/${file.build.id}/sheet`);
  await saved(page);
  await page.getByRole('checkbox', { name: 'Inspiration', exact: true }).check();
  await saved(page);
  await page.goto(`/characters/${file.build.id}/settings`);
  await saved(page);
  return file.build.id;
}

async function openReset(page: Page) {
  await opener(page).focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(confirm(page)).not.toBeChecked();
  await expect(apply(page)).toBeDisabled();
}

async function applyReset(page: Page) {
  await openReset(page);
  await confirm(page).check();
  await expect(apply(page)).toBeEnabled();
  await apply(page).click();
  await expect(dialog(page)).toBeHidden();
}

async function undoAfterReload(page: Page, id: string, before: DatabaseSnapshot) {
  const original = character(before, id);
  await page.reload();
  await saved(page);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await undo(page).click();
  await saved(page);
  const after = await readDatabase(page);
  const restored = character(after, id);
  expect(restored.build).toEqual(original.build);
  expect(restored.live).toEqual(original.live);
  expect(restored.events.slice(0, original.events.length)).toEqual(original.events);
  expect(restored.events.at(-2)?.command).toBe('resetCharacter');
  expect(restored.events.at(-2)?.undoneBy).toBe(restored.events.at(-1)?.id);
  expect(restored.events.at(-1)?.command).toBe('undo');
  expect(character(after, 'the-fool')).toEqual(character(before, 'the-fool'));
  await page.reload();
  await saved(page);
  expect(character(await readDatabase(page), id)).toEqual(restored);
}

test('hub selection opens the correct reset preview; Cancel and Escape keep every saved record', async ({
  page,
  isMobile,
}) => {
  const id = await setupCaster(page);
  await page.goto('/settings');
  await saved(page);
  await page.getByRole('combobox', { name: 'Character', exact: true }).selectOption(id);
  const link = page.getByRole('link', {
    name: 'Review reset for Reset prepared caster',
    exact: true,
  });
  await expect(link).toHaveAttribute('href', `/characters/${id}/settings`);
  const before = await readDatabase(page);
  await link.click();
  await expect(page).toHaveURL(`/characters/${id}/settings`);
  await saved(page);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  await openReset(page);
  await expect(change(page, 'HP')).toHaveText('0 / 22 → 44 / 44');
  for (const [label, text] of [
    ['Temporary HP', '4 → 0'],
    ['Exhaustion', '4 → 0'],
    ['Death saves', '0 successes / 3 failures → 0 successes / 0 failures'],
    ['d8 Hit Dice', '2 / 8 → 8 / 8'],
    ['Level 1 slots', '1 / 4 → 4 / 4'],
    ['Pact slots (level 1)', '0 / 2 → 2 / 2'],
    ['Bardic Inspiration', '1 / 5 → 5 / 5'],
    ['Pending concentration checks', '1 → 0'],
    ['Combat', 'In combat · round 3 → Not in combat'],
  ] as const)
    await expect(change(page, label)).toHaveText(text);
  await expect(change(page, 'Game clock')).toContainText('Day 2, 03:26');
  await expect(preview(page)).toContainText('Invisibility');
  await expect(preview(page)).toContainText('Camp ward');
  await expect(preview(page)).toContainText('poisoned');
  expect(await readDatabase(page)).toEqual(before);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: test.info().outputPath(`reset-preview-${isMobile ? 375 : 1440}.png`),
    fullPage: false,
  });
  await confirm(page).check();
  await expect(apply(page)).toBeEnabled();
  await apply(page).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath(`reset-confirmation-${isMobile ? 375 : 1440}.png`),
    fullPage: false,
  });
  expect(await readDatabase(page)).toEqual(before);
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readDatabase(page)).toEqual(before);
  await openReset(page);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(opener(page)).toBeFocused();
  expect(await readDatabase(page)).toEqual(before);
});

test('confirmed reset refills a prepared multiclass caster, keeps choices and time, and undoes exactly', async ({
  page,
}) => {
  const id = await setupCaster(page);
  const before = await readDatabase(page);
  const original = character(before, id);
  await applyReset(page);
  await saved(page);
  await expect(opener(page)).toBeFocused();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1);
  const after = await readDatabase(page);
  const reset = character(after, id);
  const expectedLive = {
    ...original.live,
    hp: 44,
    tempHp: 0,
    deathSaves: { success: 0, fail: 0 },
    exhaustion: 0,
    hitDiceSpent: {},
    slotsUsed: Array<number>(10).fill(0),
    featureUsesSpent: {},
    conditions: [],
    effects: [],
  };
  delete expectedLive.pactSlotsUsed;
  delete expectedLive.concentration;
  delete expectedLive.combat;
  expect(reset.live).toEqual(expectedLive);
  expect(reset.live.inspiration).toBe(true);
  expect(reset.build).toEqual(original.build);
  expect(reset.events.slice(0, -1)).toEqual(original.events);
  expect(reset.events.at(-1)?.command).toBe('resetCharacter');
  expect(character(after, 'the-fool')).toEqual(character(before, 'the-fool'));
  expect(after.campaigns).toEqual(before.campaigns);
  expect(after.backups).toHaveLength(before.backups.length + 1);
  const backup = after.backups.find((row) => row.data.reason === 'before-reset')!;
  expect(normalized(backup.data.workspace)).toEqual(normalized(workspace(before)));
  await undoAfterReload(page, id, before);
  expect((await readDatabase(page)).backups).toEqual(after.backups);
});

test('a failed reset save keeps the original recovery point through Retry and reload Undo', async ({
  page,
}) => {
  const id = await setupCaster(page);
  const before = await readDatabase(page);
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'backups' && (value as Stored<BackupData>).data.reason === 'before-reset') {
        (window as ResetTestWindow).__failedResetBackup = structuredClone(
          value,
        ) as Stored<BackupData>;
        IDBObjectStore.prototype.add = add;
        throw new DOMException('Reset backup quota test failure', 'QuotaExceededError');
      }
      return key === undefined ? add.call(this, value) : add.call(this, value, key);
    };
  });
  await applyReset(page);
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Save failed',
  );
  await expect(hp(page)).toHaveText(/44\s*\/\s*44/);
  expect(await readDatabase(page)).toEqual(before);
  const intended = await page.evaluate(() => (window as ResetTestWindow).__failedResetBackup);
  expect(intended?.data.reason).toBe('before-reset');
  expect(normalized(intended!.data.workspace)).toEqual(normalized(workspace(before)));
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await saved(page);
  const after = await readDatabase(page);
  expect(after.backups.filter((row) => row.data.reason === 'before-reset')).toEqual([intended]);
  expect(character(after, id).live.hp).toBe(44);
  await undoAfterReload(page, id, before);
  expect((await readDatabase(page)).backups).toEqual(after.backups);
});

test('a stale window cannot commit reset or its backup over a newer saved command', async ({
  page,
}) => {
  await page.goto('/characters/the-fool/settings');
  await saved(page);
  const second = await page.context().newPage();
  try {
    await second.goto('/characters/the-fool');
    await saved(second);
    await openReset(page);
    await confirm(page).check();
    await hp(second).click();
    const damage = second.getByRole('dialog', { name: 'Hit points', exact: true });
    await damage.getByRole('button', { name: '3', exact: true }).click();
    await damage.getByRole('button', { name: 'Apply', exact: true }).click();
    await saved(second);
    const newer = await readDatabase(second);
    await apply(page).click();
    await expect(dialog(page)).toBeHidden();
    await expect(
      page.getByRole('status', { name: 'Local save status', exact: true }),
    ).toContainText('Save conflict');
    await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
    expect(await readDatabase(page)).toEqual(newer);
    expect(newer.backups).toEqual([]);
    await page.reload();
    await saved(page);
    await expect(hp(page)).toHaveText(/8\s*\/\s*19/);
  } finally {
    await second.close();
  }
});
