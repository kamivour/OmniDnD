import { expect, test as base } from '@playwright/test';

export { expect };
export type { Page } from '@playwright/test';

const LOOPBACK_HTTP = 'http://127.0.0.1:4173/**';

export const test = base.extend<{ forwardLoopbackHttp: void }>({
  forwardLoopbackHttp: [
    async ({ context }, use) => {
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
      await use();
    },
    { auto: true },
  ],
});
