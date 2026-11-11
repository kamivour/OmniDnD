import { expect, test as base, type Page } from '@playwright/test';
import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';

export { expect };
export type { Page };

/** Import a copy of the Fool as "Party Fool" into campaign `table-one`, played as `role`. */
export async function importPartyFool(page: Page, role: 'dm' | 'player') {
  await page.goto('/');
  const file = ExportFileSchema.parse(seed);
  file.campaign.id = 'table-one';
  file.campaign.name = 'Table One';
  file.campaign.role = role;
  file.build.id = 'party-fool';
  file.build.name = 'Party Fool';
  file.build.campaignId = file.campaign.id;
  file.live.characterId = file.build.id;
  file.events = [];
  await page.getByLabel('Import character JSON', { exact: true }).setInputFiles({
    name: 'party-fool.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const dialog = page.getByRole('dialog', { name: 'Import character', exact: true });
  await dialog.getByRole('button', { name: 'Add character', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const LOOPBACK_HTTP = 'http://127.0.0.1:4173/**';

/** Chapters the tutorial spec sets to be seen; every other spec starts with the tour already done. */
const ALL_CHAPTERS = [
  'welcome',
  'character',
  'combat',
  'spells',
  'rest',
  'inventory',
  'party',
  'party-dm',
];

export const test = base.extend<{
  forwardLoopbackHttp: void;
  defaultToOnePage: void;
  showTutorial: boolean;
  showRoles: boolean;
  tutorialDone: void;
  sampleCharacter: void;
}>({
  showTutorial: [false, { option: true }],
  // New devices start empty; most specs rely on the sample Fool, so they opt in through this key.
  sampleCharacter: [
    async ({ context }, runTest) => {
      await context.addInitScript(() => {
        try {
          if (!localStorage.getItem('omnidnd.sample')) localStorage.setItem('omnidnd.sample', '1');
        } catch {
          // Storage unavailable: the device starts empty.
        }
      });
      await runTest();
    },
    { auto: true },
  ],
  // The role questions block the New campaign and New character forms, so only the roles spec sees them.
  showRoles: [false, { option: true }],
  // The tour covers the page and blocks clicks, so other specs start with it finished.
  tutorialDone: [
    async ({ context, showTutorial }, runTest) => {
      if (!showTutorial) {
        await context.addInitScript((done) => {
          try {
            if (!localStorage.getItem('omnidnd.tutorial'))
              localStorage.setItem('omnidnd.tutorial', JSON.stringify({ done, tipsOn: true }));
          } catch {
            // Storage unavailable: the tour may show.
          }
        }, ALL_CHAPTERS);
      }
      await runTest();
    },
    { auto: true },
  ],
  // Most specs fill the whole New character form, so they start in One page mode.
  // The step-by-step spec switches mode on screen.
  defaultToOnePage: [
    async ({ context, showRoles }, runTest) => {
      await context.addInitScript((askRoles) => {
        try {
          const saved = JSON.parse(localStorage.getItem('omnidnd.device') ?? '{}') as object;
          if (!('creationMode' in saved)) {
            localStorage.setItem(
              'omnidnd.device',
              JSON.stringify({ ...saved, creationMode: 'page', askRoles }),
            );
          }
        } catch {
          // Storage unavailable: the app default applies.
        }
      }, showRoles);
      await runTest();
    },
    { auto: true },
  ],
  forwardLoopbackHttp: [
    async ({ context }, runTest) => {
      if (process.env.OMNI_E2E_FORWARD_HTTP === '1') {
        // Optional transport workaround for hosts that deny Chromium loopback connections.
        // Node requests the real production server; no responses or application data are mocked.
        // This does not prove native browser networking or offline behavior. Future offline tests
        // must unroute LOOPBACK_HTTP before disabling network access.
        await context.route(LOOPBACK_HTTP, async (route) => {
          const response = await route.fetch();
          await route.fulfill({ response });
        });
      }
      try {
        await runTest();
      } finally {
        if (process.env.OMNI_E2E_FORWARD_HTTP === '1')
          await context.unrouteAll({ behavior: 'wait' });
      }
    },
    { auto: true },
  ],
});
