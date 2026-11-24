import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema, type ExportFile } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// This file runs only with playwright.party.config.ts: all account HTTP is intercepted.
test.skip(!process.env.OMNI_PARTY_E2E, 'Requires the configured-account test build');
const me = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const friend = '00000000-0000-4000-8000-000000000003';
const file = ExportFileSchema.parse(seed);
const campaign = { ...file.campaign, id: 'shared-test', name: 'Shared Table' };
const now = '2026-11-17T00:00:00.000Z';
const viewToken = '644dff6a-6f50-4e81-ba42-7d402348c5c0';

async function backend(
  page: Page,
  host = false,
  dmTaken = true,
  startName: string | null = 'Me Player',
) {
  let myName = startName;
  let myAvatar: string | null = null;
  let joined = host;
  let myRole = host ? 'dm' : 'player';
  let friendWand: number | undefined;
  let friendDeleted = false;
  let friendRevision = 1;
  let published: ExportFile | null = null;
  const partyWrites: unknown[] = [];
  // Without a host, the friend holds the seat unless the test leaves it empty.
  const friendRole = !host && dmTaken ? 'dm' : 'player';
  const decisions: { user: string; approve: boolean }[] = [];
  const requests = host
    ? [owner, friend].map((user, index) => ({
        campaign_id: campaign.id,
        user_id: user,
        character_id: 'existing',
        character_name: `Hero ${index}`,
        requester_name: index ? 'Bob' : 'Alice',
        status: 'pending',
      }))
    : [];
  const user = {
    id: me,
    email: 'me@example.test',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: now,
  };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: me, aud: 'authenticated', exp })}.test-signature`;
  await page.addInitScript(
    ({ token, exp, user }) =>
      localStorage.setItem(
        'omnidnd-auth',
        JSON.stringify({
          access_token: token,
          refresh_token: 'test-refresh',
          expires_at: exp,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      ),
    { token, exp, user },
  );
  await page.route('https://sync.test/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as Record<string, unknown> | null;
    let data: unknown = [];
    if (path.endsWith('/auth/v1/user')) data = user;
    else if (path.endsWith('/rpc/request_campaign_join')) {
      requests.splice(0, requests.length, {
        campaign_id: String(body?.p_campaign),
        user_id: me,
        character_id: String(body?.p_character),
        character_name: String(body?.p_name),
        requester_name: 'Me',
        status: 'pending',
      });
      data = null;
    } else if (path.endsWith('/rpc/resolve_campaign_join')) {
      const item = requests.find((r) => r.user_id === body?.p_user)!;
      item.status = body?.p_approve ? 'approved' : 'declined';
      decisions.push({ user: item.user_id, approve: body?.p_approve === true });
      data = null;
    } else if (path.endsWith('/rpc/publish_character_link')) {
      published = ExportFileSchema.parse(body?.p_snapshot);
      data = { token: viewToken, updatedAt: published.exportedAt };
    } else if (path.endsWith('/rpc/get_my_character_link'))
      data = published ? { token: viewToken, updatedAt: published.exportedAt } : null;
    else if (path.endsWith('/rpc/revoke_character_link')) {
      published = null;
      data = null;
    } else if (path.endsWith('/rpc/create_invite')) data = 'INVITE-TEST';
    else if (path.endsWith('/rpc/preview_invite'))
      data = {
        campaign_id: campaign.id,
        name: campaign.name,
        dm_name: friendRole === 'dm' ? 'Friend' : myRole === 'dm' ? myName : null,
        has_dm: friendRole === 'dm' || myRole === 'dm',
        member_count: 2,
        already_member: joined,
      };
    else if (path.endsWith('/rpc/join_campaign')) {
      joined = true;
      if (body?.p_role === 'dm') myRole = 'dm';
      data = campaign.id;
    } else if (path.endsWith('/rpc/claim_dm')) {
      myRole = 'dm';
      data = null;
    } else if (path.endsWith('/rpc/release_dm')) {
      myRole = 'player';
      data = null;
    } else if (path.endsWith('/shared_campaigns'))
      data = joined
        ? [
            {
              id: campaign.id,
              owner_id: host ? me : owner,
              revision: 1,
              changed_at: now,
              schema_version: 1,
              payload: campaign,
            },
          ]
        : [];
    else if (path.endsWith('/campaign_members'))
      data = joined
        ? [
            { campaign_id: campaign.id, user_id: me, role: myRole },
            { campaign_id: campaign.id, user_id: friend, role: friendRole },
          ]
        : [];
    else if (path.endsWith('/campaign_join_requests')) data = requests;
    else if (path.endsWith('/rpc/display_name_available'))
      data = !['friend', 'me player'].includes(String(body?.p_name).trim().toLowerCase());
    else if (path.endsWith('/profiles')) {
      if (request.method() === 'POST') {
        const row = (Array.isArray(body) ? body[0] : body) as { display_name?: string } | null;
        myName = row?.display_name ?? myName;
      }
      const patch = body as { avatar?: string | null } | null;
      if (request.method() === 'PATCH' && patch && 'avatar' in patch)
        myAvatar = patch.avatar ?? null;
      const only = new URL(request.url()).searchParams.get('user_id')?.replace('eq.', '');
      data = [
        ...(myName ? [{ user_id: me, display_name: myName, avatar: myAvatar }] : []),
        { user_id: friend, display_name: 'Friend', avatar: null },
      ].filter((row) => !only || row.user_id === only);
    } else if (path.endsWith('/party_entities')) {
      if (request.method() !== 'GET') partyWrites.push(body);
      data =
        request.method() === 'GET' && joined
          ? [
              {
                campaign_id: campaign.id,
                entity_id: 'friend-character',
                owner_id: friend,
                revision: friendRevision,
                deleted: friendDeleted,
                changed_at: now,
                schema_version: 1,
                payload: {
                  build: {
                    ...file.build,
                    id: 'friend-character',
                    campaignId: campaign.id,
                    name: 'Friend Hero',
                    journal: {},
                    items: [
                      ...file.build.items,
                      ...(friendWand === undefined
                        ? []
                        : [{ instanceId: 'friend-wand', itemId: 'item.wand-of-magic-missiles' }]),
                    ],
                  },
                  live: {
                    ...file.live,
                    characterId: 'friend-character',
                    items: {
                      ...file.live.items,
                      ...(friendWand === undefined
                        ? {}
                        : {
                            'friend-wand': {
                              qty: 1,
                              equipped: false,
                              attuned: false,
                              charges: friendWand,
                            },
                          }),
                    },
                  },
                  events: [],
                },
              },
            ]
          : [];
    } else if (path.endsWith('/sync_entities') && request.method() !== 'GET')
      data = [{ revision: 1 }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify(data),
    });
  });
  return {
    getSharedCopy: () => published,
    requests,
    decisions,
    partyWrites,
    updateWand: (charges?: number) => {
      friendWand = charges;
      friendRevision++;
    },
    removeFriendCharacter: () => {
      friendDeleted = true;
      friendRevision++;
    },
    approve: () => {
      joined = true;
      requests[0]!.status = 'approved';
    },
  };
}

test('publish a Bench character, open its sheet signed out, and revoke the link', async ({
  page,
  browser,
}) => {
  const server = await backend(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Move The Fool', exact: true }).click();
  const move = page.getByRole('dialog', { name: 'Move character', exact: true });
  await move.getByLabel('Move to campaign').selectOption({ label: 'Bench · not in a campaign' });
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(move).toBeHidden();
  const bench = page.getByRole('article', { name: 'Bench', exact: true });
  await bench.getByRole('button', { name: 'Share The Fool character link' }).click();
  const sharing = page.getByRole('dialog', { name: 'Share character', exact: true });
  await sharing.getByRole('button', { name: 'Publish view-only link' }).click();
  const input = sharing.getByRole('textbox', { name: 'View-only link' });
  await expect(input).toHaveValue(new RegExp(`/share/character#${viewToken}$`));
  const link = await input.inputValue();
  expect(server.getSharedCopy()!.campaign.bench).toBeUndefined();
  expect(server.getSharedCopy()!.build.journal).toEqual({});
  expect(server.getSharedCopy()!.events).toEqual([]);

  const guest = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    await guest.route('https://sync.test/**', async (route) => {
      expect(new URL(route.request().url()).pathname).toBe('/rest/v1/rpc/read_character_link');
      expect(route.request().postDataJSON()).toEqual({ p_token: viewToken });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(server.getSharedCopy()),
      });
    });
    const visitor = await guest.newPage();
    await visitor.goto(link);
    await expect(visitor.getByRole('heading', { name: 'The Fool', exact: true })).toBeVisible();
    await expect(visitor.getByRole('note', { name: 'View only' })).toBeVisible();
    await expect(
      visitor.getByRole('button', { name: /Edit character|Duplicate to play|Undo/ }),
    ).toHaveCount(0);
    const sections = visitor.getByRole('navigation', { name: 'Character viewing sections' });
    await sections.getByRole('link', { name: 'Spells', exact: true }).click();
    await expect(visitor).toHaveURL(new RegExp(`view=spells#${viewToken}$`));
    await visitor.getByRole('button', { name: 'Vicious Mockery', exact: true }).click();
    await expect(visitor.getByText('WIS save DC 15', { exact: true })).toBeVisible();
    await visitor.keyboard.press('Escape');
    await sections.getByRole('link', { name: 'Inventory', exact: true }).click();
    await visitor.getByRole('button', { name: 'Rapier', exact: true }).click();
    await expect(visitor.getByText('Piercing', { exact: false }).first()).toBeVisible();
    await expect(visitor.getByText('False Identity: Veyne', { exact: false })).toHaveCount(0);
    expect(await visitor.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
    await visitor.screenshot({
      path: test.info().outputPath('shared-character.png'),
      animations: 'disabled',
    });

    await page.keyboard.press('Escape');
    await page.goto('/characters/the-fool/sheet');
    await page.getByRole('button', { name: 'Share character', exact: true }).click();
    await expect(sharing.getByRole('textbox', { name: 'View-only link' })).toHaveValue(link);
    await sharing.getByRole('button', { name: 'Update shared copy' }).click();
    await expect(sharing.getByRole('status')).toContainText('Current copy published.');
    await expect(sharing.getByRole('textbox', { name: 'View-only link' })).toHaveValue(link);
    await sharing.getByRole('button', { name: 'Revoke link' }).click();
    await expect(sharing.getByRole('status')).toContainText('Link revoked.');
    await visitor.reload();
    await expect(
      visitor.getByRole('heading', { name: 'Shared character unavailable' }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});

test('a DM inspecting another character sees synced changes and returns to the party when it is removed', async ({
  page,
}) => {
  const server = await backend(page, true);
  server.updateWand(2);
  await page.goto('/join');
  await page.getByRole('button', { name: 'Refresh membership', exact: true }).click();
  await page.goto('/');
  const campaignCard = page.getByRole('article', { name: 'Shared Table Shared', exact: true });
  await expect(campaignCard.getByText('DM: Me Player', { exact: true })).toBeVisible();
  await page.goto('/characters/friend-character/inventory');
  await expect(page.getByRole('note', { name: 'View only' })).toContainText('Friend');
  await page.getByRole('button', { name: 'Wand of Magic Missiles', exact: true }).click();
  const preview =
    page.viewportSize()!.width < 1024
      ? page.getByRole('dialog')
      : page.getByRole('complementary', { name: 'Pinned detail' });
  await expect(preview.getByText('×1 · 2/7 charges', { exact: true })).toBeVisible();
  server.updateWand(5);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(preview.getByText('×1 · 5/7 charges', { exact: true })).toBeVisible();
  server.updateWand(undefined);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(preview.getByText('This entry is no longer on the shared character.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeFocused();
  expect(server.partyWrites).toEqual([]);
  server.removeFriendCharacter();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page).toHaveURL(/\/campaigns\/shared-test\/party$/);
  await expect(page.getByText('Friend Hero', { exact: true })).toHaveCount(0);
});

test('request by ID, approve externally, bring an existing copy and view a friend', async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto('/join');
  await expect(page.getByLabel('Campaign ID', { exact: true })).toBeVisible();
  await page.getByLabel('Campaign ID', { exact: true }).fill(campaign.id);
  await page.getByRole('button', { name: 'Request to join', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your join requests' })).toContainText('pending');
  // No character is attached to the request; the player chooses after approval.
  expect(server.requests[0]?.character_id).toBe('');
  await expect(page.getByRole('heading', { name: 'Bring a character' })).toHaveCount(0);
  server.approve();
  await page.getByRole('button', { name: 'Refresh membership', exact: true }).click();
  const bring = page.getByRole('region', { name: 'Bring a character' });
  await expect(bring.getByRole('link', { name: 'Create a new character here' })).toBeVisible();
  await bring.getByRole('button', { name: 'Copy The Fool', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm change', exact: true })
    .getByRole('button', { name: 'Do anyway', exact: true })
    .click();
  await expect(page).toHaveURL(/\/campaigns\/shared-test\/party$/);
  await expect(page.getByRole('article', { name: 'The Fool', exact: true })).toBeVisible();
  await page.getByRole('article', { name: 'Friend Hero', exact: true }).getByRole('link').click();
  await expect(page.getByRole('note', { name: 'View only' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('shared-reader.png') });
});

test('owner copies an invite link, approves one request and declines another', async ({ page }) => {
  const server = await backend(page, true);
  await page.goto('/join');
  await page.getByRole('button', { name: 'Refresh membership', exact: true }).click();
  await page.goto('/');
  await page.getByRole('button', { name: 'Share campaign Shared Table', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Share Shared Table', exact: true });
  await sheet.getByRole('button', { name: 'Copy invite link', exact: true }).click();
  await expect(sheet.getByTestId('invite-link')).toContainText('/join/INVITE-TEST');
  await expect(sheet.getByRole('button', { name: /invite link$/ })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('share-sheet.png') });
  await page.goto('/campaigns/shared-test/settings');
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve Alice', exact: true }).click();
  await page.getByRole('button', { name: 'Decline Bob', exact: true }).click();
  await expect(page.getByText('No pending requests.', { exact: true })).toBeVisible();
  expect(server.decisions).toEqual([
    { user: owner, approve: true },
    { user: friend, approve: false },
  ]);
  await page.screenshot({ path: test.info().outputPath('share-requests.png'), fullPage: true });
});

test('an invite link grants direct membership without sending a request', async ({ page }) => {
  const server = await backend(page);
  await page.goto('/join/INVITE-TEST');
  await expect(page.getByRole('heading', { name: 'Shared Table', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^DM/ })).toBeDisabled();
  await expect(page.getByText('· Taken by Friend', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bring a character', exact: true })).toBeVisible();
  expect(server.requests).toEqual([]);
  await expect(page.getByRole('article', { name: 'The Fool', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('bring-character.png'), fullPage: true });
  await page.getByRole('link', { name: 'Open party', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Friend Hero', exact: true })).toBeVisible();
});

test('sharing lists the characters members will see and keeps unticked ones private', async ({
  page,
}) => {
  await backend(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: `Share campaign ${file.campaign.name}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Share campaign', exact: true }).click();
  const list = page.getByRole('group', { name: 'Characters members will see' });
  await expect(list.getByRole('checkbox', { name: 'The Fool' })).toBeChecked();
  await list.getByRole('checkbox', { name: 'The Fool' }).uncheck();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('share-characters.png'), fullPage: true });
  await list.getByRole('button', { name: 'Share now', exact: true }).click();
  await expect(page.getByLabel('Recent management change')).toContainText(
    'Keep 1 character private when sharing',
  );
  await page.goto('/');
  await expect(page.getByText(`${file.campaign.name} (private)`).first()).toBeVisible();
});

test('a member adds a character from the Party screen and moves another from its card', async ({
  page,
}) => {
  await backend(page);
  await page.goto('/join/INVITE-TEST');
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bring a character', exact: true })).toBeVisible();
  await page.goto('/campaigns/shared-test/party');
  await page.getByRole('button', { name: 'Add my character', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add my character', exact: true });
  await sheet.getByRole('button', { name: 'Copy The Fool', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Confirm change', exact: true })
    .getByRole('button', { name: 'Do anyway', exact: true })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'The Fool', exact: true })).toBeVisible();

  await page.goto('/');
  const home = page.getByRole('article', { name: file.campaign.name, exact: true });
  await home.getByRole('button', { name: 'Move The Fool', exact: true }).click();
  const move = page.getByRole('dialog', { name: 'Move character', exact: true });
  await expect(move.getByLabel('Move to campaign')).toHaveValue(campaign.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('move-character.png'), fullPage: true });
  await move.getByRole('button', { name: 'Move', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm change', exact: true });
  await expect(confirm).toContainText('Members of Shared Table will see this character.');
  await confirm.getByRole('button', { name: 'Do anyway', exact: true }).click();
  const shared = page.getByRole('article', { name: /^Shared Table/ });
  await expect(shared.getByRole('article', { name: 'The Fool', exact: true })).toHaveCount(2);
  await expect(home.getByRole('article', { name: 'The Fool', exact: true })).toHaveCount(0);
});

test('a member joins into an empty DM seat, steps down and takes it back', async ({ page }) => {
  await backend(page, false, false);
  await page.goto('/join/INVITE-TEST');
  await expect(page.getByText(/DM seat: empty/)).toBeVisible();
  await page.getByRole('radio', { name: 'DM', exact: true }).check();
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bring a character', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('article', { name: /^Shared Table/ })).toContainText('DM: Me Player');
  await page.goto('/campaigns/shared-test/party');
  const seat = page.getByRole('group', { name: 'DM seat' });
  await expect(seat).toContainText('DM: Me Player (you)');
  await seat.getByRole('button', { name: 'Step down as DM', exact: true }).click();
  await seat.getByRole('button', { name: 'Confirm step down', exact: true }).click();
  await expect(seat).toContainText('DM seat: empty');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('dm-seat.png'), fullPage: true });
  await seat.getByRole('button', { name: 'Take DM seat', exact: true }).click();
  await expect(seat).toContainText('DM: Me Player (you)');
});

test('an account without a display name must choose a free one', async ({ page }) => {
  await backend(page, false, true, null);
  await page.goto('/');
  const prompt = page.getByRole('dialog', { name: 'Choose your display name', exact: true });
  await expect(prompt).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prompt).toBeVisible();
  const field = prompt.getByLabel('Display name', { exact: true });
  await expect(field).toHaveAttribute('autocomplete', 'off');
  await field.fill('Me');
  await expect(prompt).toContainText('Use 3 to 24 characters.');
  await field.fill(' FRIEND ');
  await expect(prompt).toContainText('That name is taken');
  await expect(prompt.getByRole('button', { name: 'Save name', exact: true })).toBeDisabled();
  await field.fill('Wanderer');
  await expect(prompt).toContainText('Available');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('name-prompt.png'), fullPage: true });
  await prompt.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Open Profile' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Wanderer');
  const topBar = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
    name: 'Profile',
  });
  await expect(topBar.locator('[data-avatar="mask"]')).toBeVisible();
  // A tiny PNG; the app crops and re-encodes it as a JPEG before saving.
  await page.getByLabel('Profile picture file').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByRole('status').filter({ hasText: 'Picture saved.' })).toBeVisible();
  await expect(topBar.locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.getByRole('img', { name: 'Your profile picture' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('profile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(topBar.locator('[data-avatar="mask"]')).toBeVisible();
});
