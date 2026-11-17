import { expect, it } from 'vitest';
import { MemoryCloud, MemoryProvider } from './memory-provider';

async function setup() {
  const cloud = new MemoryCloud();
  const owner = new MemoryProvider(cloud),
    player = new MemoryProvider(cloud),
    outsider = new MemoryProvider(cloud);
  for (const [provider, email] of [
    [owner, 'dm@a.test'],
    [player, 'player@a.test'],
    [outsider, 'outsider@a.test'],
  ] as const)
    await provider.signUp(email, 'password1');
  await owner.shareCampaign({
    id: 'campaign',
    role: 'dm',
    changedAt: '2026-11-17T00:00:00.000Z',
    schemaVersion: 1,
    payload: { name: 'Table' },
  });
  return { cloud, owner, player, outsider, user: (await player.currentAccount())!.id };
}

it('requests reveal no party data, are idempotent, and need owner/DM approval', async () => {
  const { owner, player, outsider, user } = await setup();
  await player.requestJoin('campaign', 'existing-character', 'My bard');
  await player.requestJoin('campaign', 'existing-character', 'My bard');
  expect(await player.listJoinRequests()).toHaveLength(1);
  expect(await outsider.listJoinRequests()).toEqual([]);
  expect((await player.pullParty()).campaigns).toEqual([]);
  expect((await player.pullParty()).entities).toEqual([]);
  await expect(player.resolveJoinRequest('campaign', user, true)).rejects.toThrow(
    'Only the owner or DM',
  );
  await expect(
    outsider.pushPartyEntity({
      campaignId: 'campaign',
      entityId: 'other',
      payload: {},
      deleted: false,
      changedAt: 'now',
      schemaVersion: 1,
    }),
  ).rejects.toThrow('not in this campaign');
  await owner.resolveJoinRequest('campaign', user, true);
  expect((await player.listJoinRequests())[0]?.status).toBe('approved');
  expect((await player.pullParty()).members.find((m) => m.userId === user)?.role).toBe('player');
  await owner.resolveJoinRequest('campaign', user, true);
  await expect(owner.resolveJoinRequest('campaign', user, false)).rejects.toThrow(
    'already been reviewed',
  );
  const payload = {
    campaignId: 'campaign',
    entityId: 'my-character',
    payload: {},
    deleted: false,
    changedAt: 'now',
    schemaVersion: 1,
  };
  await player.pushPartyEntity(payload);
  expect((await owner.pullParty()).entities).toHaveLength(1);
  await expect(owner.pushPartyEntity(payload)).rejects.toThrow('Only the owner');
});

it('declining grants no access; another request can be reviewed again', async () => {
  const { owner, player, user } = await setup();
  await player.requestJoin('campaign', '', 'No character selected');
  await owner.resolveJoinRequest('campaign', user, false);
  expect((await player.pullParty()).campaigns).toEqual([]);
  expect((await player.listJoinRequests())[0]?.status).toBe('declined');
  await player.requestJoin('campaign', 'my-other-character', 'My fighter');
  expect((await owner.listJoinRequests())[0]).toMatchObject({
    status: 'pending',
    characterName: 'My fighter',
  });
});
