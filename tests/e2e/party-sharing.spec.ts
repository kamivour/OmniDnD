import seed from '../../data/characters/the-fool.json' with { type: 'json' };
import { ExportFileSchema } from '../../src/engine/schema';
import { expect, test, type Page } from './fixtures';

// This file runs only with playwright.party.config.ts: all account HTTP is intercepted.
test.skip(!process.env.OMNI_PARTY_E2E, 'Requires the configured-account test build');
const me = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const friend = '00000000-0000-4000-8000-000000000003';
const file = ExportFileSchema.parse(seed);
const campaign = { ...file.campaign, id: 'shared-test', name: 'Shared Table' };
const now = '2026-11-17T00:00:00.000Z';

async function backend(page: Page, host = false) {
  let joined = host;
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
    } else if (path.endsWith('/rpc/create_invite')) data = 'INVITE-TEST';
    else if (path.endsWith('/rpc/preview_invite'))
      data = {
        campaign_id: campaign.id,
        name: campaign.name,
        dm_name: 'DM',
        member_count: 2,
        already_member: joined,
      };
    else if (path.endsWith('/rpc/join_campaign')) {
      joined = true;
      data = campaign.id;
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
            { campaign_id: campaign.id, user_id: me, role: host ? 'dm' : 'player' },
            { campaign_id: campaign.id, user_id: friend, role: 'player' },
          ]
        : [];
    else if (path.endsWith('/campaign_join_requests')) data = requests;
    else if (path.endsWith('/profiles'))
      data = [
        { user_id: me, display_name: 'Me' },
        { user_id: friend, display_name: 'Friend' },
      ];
    else if (path.endsWith('/party_entities'))
      data =
        request.method() === 'GET' && joined
          ? [
              {
                campaign_id: campaign.id,
                entity_id: 'friend-character',
                owner_id: friend,
                revision: 1,
                deleted: false,
                changed_at: now,
                schema_version: 1,
                payload: {
                  build: {
                    ...file.build,
                    id: 'friend-character',
                    campaignId: campaign.id,
                    name: 'Friend Hero',
                    journal: {},
                  },
                  live: { ...file.live, characterId: 'friend-character' },
                  events: [],
                },
              },
            ]
          : [];
    else if (path.endsWith('/sync_entities') && request.method() !== 'GET')
      data = [{ revision: 1 }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      body: JSON.stringify(data),
    });
  });
  return {
    requests,
    decisions,
    approve: () => {
      joined = true;
      requests[0]!.status = 'approved';
    },
  };
}

test('request by ID, approve externally, bring an existing copy and view a friend', async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto('/join');
  await expect(page.getByLabel('Campaign ID', { exact: true })).toBeVisible();
  await page.getByLabel('Campaign ID', { exact: true }).fill(campaign.id);
  await page.getByLabel('Existing character', { exact: true }).selectOption('the-fool');
  await page.getByRole('button', { name: 'Request to join', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your join requests' })).toContainText('pending');
  expect(server.requests[0]?.character_id).toBe('the-fool');
  await expect(page.getByRole('button', { name: 'Copy character into campaign' })).toHaveCount(0);
  server.approve();
  await page.getByRole('button', { name: 'Refresh membership', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy character into campaign' })).toBeVisible();
  await page.getByRole('button', { name: 'Copy character into campaign' }).click();
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
  await page.goto('/campaigns/shared-test/settings');
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Share campaign link', exact: true }).click();
  await expect(page.getByTestId('invite-link')).toContainText('/join/INVITE-TEST');
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
  await page.getByRole('button', { name: 'Join campaign', exact: true }).click();
  await expect(page.getByText('You are a member of this campaign.', { exact: true })).toBeVisible();
  expect(server.requests).toEqual([]);
  await page.getByRole('link', { name: 'Open party', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Friend Hero', exact: true })).toBeVisible();
});
