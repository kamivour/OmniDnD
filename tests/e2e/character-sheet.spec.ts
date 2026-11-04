import type { Locator } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import {
  ExportFileSchema,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

interface SavedCharacter {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

const main = (page: Page) => page.getByRole('main');
const section = (page: Page, name: string) => main(page).getByRole('region', { name, exact: true });
const number = (page: Page, label: string) =>
  main(page).getByRole('button', { name: `Show ${label} breakdown`, exact: true });
const sheetLog = (page: Page) => section(page, 'Sheet log');
const inspiration = (page: Page) =>
  section(page, 'Identity').getByRole('checkbox', { name: 'Inspiration', exact: true });

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Local save status', exact: true })).toContainText(
    'Saved locally',
  );
}

async function readSaved(page: Page, characterId: string): Promise<SavedCharacter> {
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
  }, characterId);
}

function sheetFile(id: string): ExportFile {
  const file = ExportFileSchema.parse(seed);
  file.build.id = id;
  file.build.name = id;
  file.live.characterId = id;
  file.events = [];
  return file;
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
  await page.goto(`/characters/${file.build.id}/sheet`);
  await expect(
    main(page).getByRole('heading', { name: 'Character sheet', exact: true }),
  ).toBeVisible();
  await saved(page);
}

async function noOverflow(page: Page) {
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(16, 21, 33)');
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function numericValue(page: Page, label: string, value: string | number) {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const display = new RegExp(`^${escaped}(?: ft| lb|d\\d+|/\\d+)?$`);
  await expect(number(page, label).locator('span').last()).toHaveText(display);
  await expect(number(page, label)).toHaveAccessibleDescription(display);
}

async function tooltipFor(page: Page, label: string) {
  const trigger = number(page, label);
  // An open preview adds its tooltip ID after the independently described numeric value.
  await expect(trigger).toHaveAttribute('aria-describedby', /\S+\s+\S+/);
  const ids = (await trigger.getAttribute('aria-describedby'))!.trim().split(/\s+/);
  const describedElements = page.locator(ids.map((id) => `[id=${JSON.stringify(id)}]`).join(', '));
  const detail = page.locator('[role="tooltip"]').and(describedElements);
  await expect(detail).toBeVisible();
  return detail;
}

async function inViewport(page: Page, locator: Locator) {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect
    .poll(async () => {
      const bounds = await locator.boundingBox();
      if (!bounds) return Infinity;
      return Math.max(
        0,
        -bounds.x,
        -bounds.y,
        bounds.x + bounds.width - viewport!.width,
        bounds.y + bounds.height - viewport!.height,
      );
    })
    .toBeLessThanOrEqual(0.5);
}

async function openBreakdown(page: Page, label: string, isMobile: boolean) {
  const trigger = number(page, label);
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  if (isMobile) await trigger.tap();
  else await trigger.hover();
  const detail = isMobile
    ? page.getByRole('dialog', { name: label, exact: true })
    : await tooltipFor(page, label);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Total');
  return detail;
}

async function closeBreakdown(page: Page, label: string, isMobile: boolean) {
  const detail = isMobile
    ? page.getByRole('dialog', { name: label, exact: true })
    : await tooltipFor(page, label);
  await page.keyboard.press('Escape');
  if (isMobile) {
    await expect(detail).toBeHidden();
    await expect(number(page, label)).toBeFocused();
  } else {
    await page.mouse.move(0, 0);
    await expect(detail).toBeHidden();
  }
}

test('Sheet navigation shows every Fool ability, save, skill, combat value and saved identity', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool');
  await saved(page);
  const initial = await readSaved(page, 'the-fool');
  const navigation = page
    .getByRole('navigation', { name: 'Main', exact: true })
    .filter({ visible: true });
  if (isMobile) {
    await navigation.getByRole('button', { name: 'More', exact: true }).tap();
    await page
      .getByRole('dialog', { name: 'More', exact: true })
      .getByRole('link', { name: 'Sheet', exact: true })
      .tap();
  } else {
    await navigation.getByRole('link', { name: 'Sheet', exact: true }).click();
  }
  await expect(page).toHaveURL('/characters/the-fool/sheet');
  await expect(
    main(page).getByRole('heading', { name: 'Character sheet', exact: true }),
  ).toBeVisible();
  const identity = section(page, 'Identity');
  for (const text of ['The Fool', 'Half-Elf', 'Bard', 'Lore', 'Charlatan', 'Chaotic Neutral']) {
    await expect(identity).toContainText(text);
  }
  await expect(identity.getByText('XP', { exact: true })).toHaveCount(0);
  await expect(number(page, 'Next level XP')).toHaveCount(0);
  await expect(inspiration(page)).not.toBeChecked();
  await numericValue(page, 'Level', 3);
  await numericValue(page, 'Proficiency bonus', '+2');
  const abilities = [
    ['STR', 11, '+0', '+0', false],
    ['DEX', 15, '+2', '+4', true],
    ['CON', 13, '+1', '+1', false],
    ['INT', 12, '+1', '+1', false],
    ['WIS', 12, '+1', '+1', false],
    ['CHA', 20, '+5', '+7', true],
  ] as const;
  for (const [ability, score, modifier, save, proficient] of abilities) {
    await numericValue(page, `${ability} score`, score);
    await numericValue(page, `${ability} modifier`, modifier);
    await numericValue(page, `${ability} save`, save);
    const row = section(page, 'Abilities')
      .getByRole('listitem')
      .filter({
        has: page.getByRole('button', { name: `Show ${ability} score breakdown`, exact: true }),
      });
    if (proficient) await expect(row).toContainText('Proficient');
    else await expect(row).not.toContainText('Proficient');
  }
  const skills = [
    ['Acrobatics', '+4', 'Proficient'],
    ['Animal Handling', '+2', 'Jack of All Trades'],
    ['Arcana', '+2', 'Jack of All Trades'],
    ['Athletics', '+1', 'Jack of All Trades'],
    ['Deception', '+9', 'Expertise'],
    ['History', '+2', 'Jack of All Trades'],
    ['Insight', '+3', 'Proficient'],
    ['Intimidation', '+7', 'Proficient'],
    ['Investigation', '+3', 'Proficient'],
    ['Medicine', '+2', 'Jack of All Trades'],
    ['Nature', '+2', 'Jack of All Trades'],
    ['Perception', '+3', 'Proficient'],
    ['Performance', '+7', 'Proficient'],
    ['Persuasion', '+7', 'Proficient'],
    ['Religion', '+2', 'Jack of All Trades'],
    ['Sleight of Hand', '+6', 'Expertise'],
    ['Stealth', '+4', 'Proficient'],
    ['Survival', '+2', 'Jack of All Trades'],
  ] as const;
  await expect(section(page, 'Skills').getByRole('listitem')).toHaveCount(18);
  for (const [skill, value, marker] of skills) {
    await numericValue(page, skill, value);
    await expect(
      section(page, 'Skills')
        .getByRole('listitem')
        .filter({
          has: page.getByRole('button', { name: `Show ${skill} breakdown`, exact: true }),
        }),
    ).toContainText(marker);
  }
  for (const skill of ['Perception', 'Investigation', 'Insight'])
    await numericValue(page, `Passive ${skill}`, 13);
  for (const [label, value] of [
    ['Maximum HP', 19],
    ['Armor class', 13],
    ['Initiative', '+3'],
    ['Speed', 30],
    ['Carrying capacity', 165],
    ['Darkvision', 60],
    ['d8 Hit Dice maximum', 3],
    ['d8 Hit Dice remaining', 3],
    ['Rapier attack', '+4'],
    ['Rapier damage', '1d8+2'],
    ['Dagger attack', '+4'],
    ['Dagger damage', '1d4+2'],
    ['Bard spell save DC', 15],
    ['Bard spell attack', '+7'],
  ] as const)
    await numericValue(page, label, value);
  const combat = section(page, 'Combat statistics');
  await expect(combat).toContainText(/HP\s*11\/19/);
  await expect(combat).toContainText(/Temp HP\s*0/);
  await expect(combat).toContainText('Death saves: 0 successes · 0 failures');
  await expect(combat).toContainText('piercing');
  await expect(combat).toContainText(/20\s*\/\s*60/);
  const proficiencies = section(page, 'Proficiencies');
  for (const text of [
    'Light',
    'Simple',
    'Crossbow, hand',
    'Longsword',
    'Rapier',
    'Shortsword',
    'Flute',
    'Lute',
    'Drum',
    'Disguise Kit',
    'Forgery Kit',
    'Common',
    'Elvish',
    'Celestial',
  ]) {
    await expect(proficiencies).toContainText(new RegExp(text, 'i'));
  }
  const defenses = section(page, 'Senses and defenses');
  await expect(defenses).toContainText('Magical sleep');
  await expect(defenses).toContainText(/charmed/i);
  await expect(defenses).not.toContainText(/immune to (?:being )?charmed/i);
  await expect(defenses.getByText('Not recorded', { exact: true })).toHaveCount(3);
  await expect(
    sheetLog(page).getByRole('button', { name: 'Undo last sheet command', exact: true }),
  ).toBeDisabled();
  await noOverflow(page);
  await identity.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`sheet-identity-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await section(page, 'Skills').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`sheet-skills-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await combat.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(`sheet-combat-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  expect(await readSaved(page, 'the-fool')).toEqual(initial);
});

test('computed breakdowns expose source parts through pointer, keyboard and touch without saving changes', async ({
  page,
  isMobile,
}, info) => {
  await page.goto('/characters/the-fool/sheet');
  await saved(page);
  const initial = await readSaved(page, 'the-fool');
  const cases = [
    ['CHA score', ['Base', '18', 'Half-Elf', '+2']],
    ['DEX score', ['Base', '14', 'Half-Elf', '+1']],
    ['CHA modifier', ['20']],
    ['DEX save', ['DEX', '+2', 'Proficiency']],
    ['STR save', ['STR', '+0']],
    ['Deception', ['CHA', '+5', 'Expertise', '+4']],
    ['Athletics', ['STR', 'Jack of All Trades', '+1']],
    ['Passive Perception', ['Base', '10', 'WIS', 'Proficiency']],
    ['Maximum HP', ['Level 1', 'Level 2', 'Level 3', 'CON']],
    ['Armor class', ['Leather Armor', '11', 'DEX', '+2']],
    ['Initiative', ['DEX', '+2', 'Jack of All Trades', '+1']],
    ['Carrying capacity', ['STR', '11', '15']],
    ['Rapier attack', ['DEX', 'Proficiency']],
    ['Rapier damage', ['DEX', '1d8']],
    ['Bard spell save DC', ['Base', '8', 'Proficiency', 'CHA']],
    ['Bard spell attack', ['Proficiency', 'CHA']],
  ] as const;
  for (const [label, parts] of cases) {
    const detail = await openBreakdown(page, label, isMobile);
    for (const part of parts) await expect(detail).toContainText(part);
    if (label === 'STR save') await expect(detail).not.toContainText('Jack of All Trades');
    await inViewport(page, detail);
    if (label === 'Maximum HP')
      await page.screenshot({
        path: info.outputPath(`sheet-hp-breakdown-${isMobile ? 375 : 1440}.png`),
        animations: 'disabled',
      });
    await closeBreakdown(page, label, isMobile);
  }
  const trigger = number(page, 'Initiative');
  await trigger.evaluate((element) =>
    element.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  await trigger.focus();
  // Enter focus from the keyboard so Floating UI's visible-only focus behavior is exercised.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  if (!isMobile) {
    const detail = await tooltipFor(page, 'Initiative');
    await expect(detail).toContainText('Jack of All Trades');
    await expect(trigger).toHaveAccessibleDescription(/DEX/);
    await expect(trigger).toHaveAccessibleDescription(/Jack of All Trades/);
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await expect(trigger).toBeFocused();
    for (const key of ['Enter', 'Space']) {
      await page.keyboard.press(key);
      await expect(detail).toContainText('Jack of All Trades');
      await page.keyboard.press('Escape');
      await expect(detail).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  } else {
    await page.keyboard.press('Enter');
    const detail = page.getByRole('dialog', { name: 'Initiative', exact: true });
    await expect(detail).toContainText('Jack of All Trades');
    await detail.getByRole('button', { name: 'Close', exact: true }).tap();
    await expect(detail).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Space');
    await expect(detail).toBeVisible();
    await closeBreakdown(page, 'Initiative', true);
  }
  for (const control of await main(page)
    .getByRole('button', { name: /^Show .+ breakdown$/ })
    .all()) {
    const bounds = await control.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await noOverflow(page);
  expect(await readSaved(page, 'the-fool')).toEqual(initial);
});

test('ordinary Inspiration logs once, survives reload and Undo restores the legacy absent field without spending Bardic Inspiration', async ({
  page,
  isMobile,
}) => {
  await page.goto('/characters/the-fool/sheet');
  await saved(page);
  const initial = await readSaved(page, 'the-fool');
  expect(initial.live).not.toHaveProperty('inspiration');
  const toggle = inspiration(page);
  await expect(toggle).not.toBeChecked();
  if (isMobile) await toggle.tap();
  else {
    await toggle.focus();
    await page.keyboard.press('Space');
  }
  await expect(toggle).toBeChecked();
  await saved(page);
  const changed = await readSaved(page, 'the-fool');
  expect(changed.build).toEqual(initial.build);
  expect(changed.live).toEqual({ ...initial.live, inspiration: true });
  expect(changed.events).toHaveLength(initial.events.length + 1);
  expect(changed.events.at(-1)?.command).toBe('setInspiration');
  expect(changed.live.featureUsesSpent).toEqual(initial.live.featureUsesSpent);
  await expect(sheetLog(page)).toContainText(/inspiration/i);
  await page.reload();
  await saved(page);
  await expect(inspiration(page)).toBeChecked();
  expect(await readSaved(page, 'the-fool')).toEqual(changed);
  await sheetLog(page)
    .getByRole('button', { name: 'Undo last sheet command', exact: true })
    .click();
  await saved(page);
  const undone = await readSaved(page, 'the-fool');
  expect(undone.build).toEqual(initial.build);
  expect(undone.live).toEqual(initial.live);
  expect(undone.live).not.toHaveProperty('inspiration');
  expect(undone.events.at(-2)?.undoneBy).toBe(undone.events.at(-1)?.id);
  await expect(inspiration(page)).not.toBeChecked();
  await page.reload();
  await saved(page);
  expect(await readSaved(page, 'the-fool')).toEqual(undone);
  await noOverflow(page);
});

test('an XP High Elf Fighter displays its own subrace, subclass, choices and empty attack and casting states', async ({
  page,
}) => {
  const file = sheetFile('sheet-high-elf-fighter');
  file.campaign.id = 'sheet-xp-campaign';
  file.campaign.name = 'Sheet XP campaign';
  file.campaign.leveling = 'xp';
  file.build.campaignId = file.campaign.id;
  file.build.name = 'Aster of the North';
  file.build.raceId = 'race.elf';
  file.build.subraceId = 'race.high-elf';
  file.build.backgroundId = 'background.acolyte';
  file.build.alignment = 'Lawful Good';
  file.build.classes = [
    { classId: 'class.fighter', subclassId: 'subclass.fighter.champion', level: 3 },
  ];
  file.build.xp = 900;
  file.build.abilityScores = {
    base: { STR: 16, DEX: 10, CON: 10, INT: 13, WIS: 8, CHA: 13 },
    bonuses: [
      { source: 'race.high-elf', ability: 'DEX', value: 2 },
      { source: 'race.high-elf', ability: 'INT', value: 1 },
    ],
  };
  file.build.hpEntries = [
    { level: 1, classId: 'class.fighter', value: 10, method: 'max' },
    { level: 2, classId: 'class.fighter', value: 6, method: 'rolled' },
    { level: 3, classId: 'class.fighter', value: 6, method: 'rolled' },
  ];
  file.build.proficiencies = {
    saves: ['STR', 'CON'],
    skills: ['athletics', 'perception'],
    expertise: [],
    armor: ['medium'],
    weapons: ['martial', 'item.quarterstaff'],
    tools: ['item.flute'],
    languages: ['Common', 'Elvish', 'Draconic'],
  };
  file.build.spells = [];
  file.build.items = [];
  file.live.items = {};
  file.live.hp = 22;
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.live.featureUsesSpent = {};
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  const identity = section(page, 'Identity');
  for (const text of [
    'Aster of the North',
    'Elf',
    'High Elf',
    'Fighter',
    'Champion',
    'Acolyte',
    'Lawful Good',
    '900',
    '2700',
  ])
    await expect(identity).toContainText(text);
  await expect(identity.getByText('XP', { exact: true })).toBeVisible();
  await expect(identity).not.toContainText(/The Fool|Charlatan|Lore|Bard/);
  for (const [label, value] of [
    ['STR score', 16],
    ['DEX score', 12],
    ['INT score', 14],
    ['Maximum HP', 22],
    ['Initiative', '+1'],
    ['Armor class', 11],
    ['Athletics', '+5'],
    ['Deception', '+1'],
    ['d10 Hit Dice maximum', 3],
    ['d10 Hit Dice remaining', 3],
    ['Carrying capacity', 240],
  ] as const)
    await numericValue(page, label, value);
  await expect(section(page, 'Skills')).not.toContainText(/Expertise|Jack of All Trades/);
  const proficiencies = section(page, 'Proficiencies');
  for (const text of ['Medium', 'Martial', 'Quarterstaff', 'Flute', 'Draconic'])
    await expect(proficiencies).toContainText(new RegExp(text, 'i'));
  await expect(
    proficiencies.getByRole('definition').filter({
      hasText: /\b(?:Celestial|Disguise Kit|Forgery Kit|Lute|Drum)\b/i,
    }),
  ).toHaveCount(0);
  await expect(number(page, 'Rapier attack')).toHaveCount(0);
  await expect(number(page, 'Dagger attack')).toHaveCount(0);
  await expect(section(page, 'Combat statistics')).toContainText('No equipped weapon attacks.');
  await expect(section(page, 'Spellcasting')).toContainText('No spellcasting class.');
  await expect(section(page, 'Spellcasting')).not.toContainText(/Bard|\+7|15/);
  await expect(
    section(page, 'Spellcasting').getByRole('button', { name: /^Show .+ breakdown$/ }),
  ).toHaveCount(0);
  await noOverflow(page);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('CON entries, 2014 exhaustion and named live modifiers appear in computed values and breakdowns', async ({
  page,
  isMobile,
}, info) => {
  const file = sheetFile('sheet-con-exhaustion');
  file.build.abilityScores.base.CON = 13;
  file.live.exhaustion = 4;
  file.live.effects = [
    {
      id: 'sheet-borrowed-aid',
      name: 'Borrowed aid',
      concentration: false,
      conditions: [],
      modifiers: [
        { target: 'ac', value: 2 },
        { target: 'speed', value: 10 },
        { target: 'checks', value: 1 },
      ],
    },
  ];
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  for (const [label, value] of [
    ['CON score', 14],
    ['CON modifier', '+2'],
    ['CON save', '+2'],
    ['Maximum HP', 11],
    ['Armor class', 15],
    ['Speed', 20],
    ['Initiative', '+4'],
    ['Deception', '+10'],
    ['Passive Perception', 14],
  ] as const)
    await numericValue(page, label, value);
  const hp = await openBreakdown(page, 'Maximum HP', isMobile);
  for (const text of ['Level 1', '10', 'Level 2', '6', 'Level 3', 'CON', 'Exhaustion'])
    await expect(hp).toContainText(text);
  await inViewport(page, hp);
  await page.screenshot({
    path: info.outputPath(`sheet-exhaustion-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await closeBreakdown(page, 'Maximum HP', isMobile);
  for (const label of ['Armor class', 'Speed', 'Initiative', 'Deception', 'Passive Perception']) {
    const detail = await openBreakdown(page, label, isMobile);
    await expect(detail).toContainText('Borrowed aid');
    if (label === 'Speed') await expect(detail).toContainText('Exhaustion');
    await closeBreakdown(page, label, isMobile);
  }
  const hud = page.getByRole('banner', { name: 'Character HUD', exact: true });
  await expect(hud.getByRole('button', { name: 'Adjust hit points', exact: true })).toHaveText(
    /11\s*\/\s*11/,
  );
  await noOverflow(page);
  await page.reload();
  await saved(page);
  await numericValue(page, 'Maximum HP', 11);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('saved zero HP, temporary HP and spent Hit Dice remain references on the Sheet', async ({
  page,
}) => {
  const file = sheetFile('sheet-health-references');
  file.live.hp = 0;
  file.live.tempHp = 5;
  file.live.deathSaves = { success: 2, fail: 1 };
  file.live.hitDiceSpent = { d8: 1 };
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await numericValue(page, 'Maximum HP', 19);
  await numericValue(page, 'd8 Hit Dice maximum', 3);
  await numericValue(page, 'd8 Hit Dice remaining', 2);
  const combat = section(page, 'Combat statistics');
  await expect(combat).toContainText(/HP\s*0\/19/);
  await expect(combat).toContainText(/Temp HP\s*5/);
  await expect(combat).toContainText('Death saves: 2 successes · 1 failures');
  await expect(combat.getByRole('img', { name: 'Successes: 2 of 3', exact: true })).toBeVisible();
  await expect(combat.getByRole('img', { name: 'Failures: 1 of 3', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('banner', { name: 'Character HUD', exact: true })
      .getByRole('button', { name: 'Adjust hit points', exact: true }),
  ).toContainText('0/19');
  await noOverflow(page);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('a Human without recorded proficiencies or defenses inherits no Fool metadata', async ({
  page,
}) => {
  const file = sheetFile('sheet-human-empty');
  file.build.raceId = 'race.human';
  file.build.backgroundId = 'background.acolyte';
  file.build.alignment = undefined;
  file.build.abilityScores = {
    base: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    bonuses: [],
  };
  file.build.classes = [{ classId: 'class.fighter', level: 1 }];
  file.build.hpEntries = [{ level: 1, classId: 'class.fighter', value: 10, method: 'max' }];
  file.build.proficiencies = {
    saves: [],
    skills: [],
    expertise: [],
    armor: [],
    weapons: [],
    tools: [],
    languages: [],
  };
  file.build.spells = [];
  file.build.items = [];
  file.live.hp = 10;
  file.live.items = {};
  file.live.slotsUsed = Array.from({ length: 10 }, () => 0);
  file.live.featureUsesSpent = {};
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await expect(section(page, 'Identity')).toContainText('Human');
  await expect(section(page, 'Identity')).not.toContainText(
    /Half-Elf|Lore|Chaotic Neutral|Charlatan/,
  );
  await expect(number(page, 'Darkvision')).toHaveCount(0);
  await expect(section(page, 'Senses and defenses')).not.toContainText(
    /Fey Ancestry|Magical sleep|charmed/i,
  );
  await expect(
    section(page, 'Senses and defenses').getByText('Not recorded', { exact: true }),
  ).toHaveCount(5);
  for (const label of [
    'Damage resistances',
    'Damage immunities',
    'Damage vulnerabilities',
    'Saving throw advantages',
    'Other immunities',
  ])
    await expect(section(page, 'Senses and defenses')).toContainText(label);
  await expect(section(page, 'Proficiencies')).not.toContainText(
    /Common|Elvish|Celestial|Flute|Rapier|Forgery/i,
  );
  await expect(section(page, 'Skills')).not.toContainText(
    /Proficient|Expertise|Jack of All Trades/,
  );
  await numericValue(page, 'Athletics', '+0');
  await numericValue(page, 'Initiative', '+0');
  await numericValue(page, 'Maximum HP', 10);
  await noOverflow(page);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});

test('a level 20 maximum HP breakdown fits the viewport and scrolls through its final locked entry', async ({
  page,
  isMobile,
}, info) => {
  const file = sheetFile('sheet-level20-hp-breakdown');
  file.build.classes = [{ classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 20 }];
  file.build.hpEntries = Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    classId: 'class.bard',
    value: index === 0 ? 8 : 4,
    method: index === 0 ? 'max' : 'rolled',
  }));
  await importCharacter(page, file);
  const initial = await readSaved(page, file.build.id);
  await numericValue(page, 'Maximum HP', 104);
  const detail = await openBreakdown(page, 'Maximum HP', isMobile);
  await inViewport(page, detail);
  const finalEntry = detail.getByText(/^Level 20 \(Bard\): locked roll 4 \+ current CON/);
  await expect(finalEntry).toHaveCount(1);
  if (isMobile) await finalEntry.scrollIntoViewIfNeeded();
  else await detail.locator('[tabindex="0"]').press('End');
  await expect(finalEntry).toBeInViewport({ ratio: 1 });
  await inViewport(page, detail);
  await inViewport(page, finalEntry);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`sheet-level20-hp-breakdown-${isMobile ? 375 : 1440}.png`),
    animations: 'disabled',
  });
  await closeBreakdown(page, 'Maximum HP', isMobile);
  expect(await readSaved(page, file.build.id)).toEqual(initial);
});
