import { expect, test as base } from '@playwright/test';

export { expect };
export type { Page } from '@playwright/test';

const LOOPBACK_HTTP = 'http://127.0.0.1:4173/**';

/** Chapters the tutorial spec sets to be seen; every other spec starts with the tour already done. */
const ALL_CHAPTERS = ['welcome', 'character', 'combat', 'spells', 'rest', 'inventory'];

export const test = base.extend<{
  forwardLoopbackHttp: void;
  defaultToOnePage: void;
  showTutorial: boolean;
  showRoles: boolean;
  tutorialDone: void;
}>({
  showTutorial: [false, { option: true }],
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
