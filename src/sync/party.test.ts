import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { serializeWorkspace } from '../db/database';
import { workspaceContents } from '../db/sync-metadata';
import type { Campaign } from '../engine/schema';
import { createCharacterStore, type CharacterRecord } from '../state/character-store';
import { MemoryCloud, MemoryProvider } from './memory-provider';
import { planParty, sharedPayload } from './party';

const FOOL = seedFile.build.id;
const CAMPAIGN = seedFile.build.campaignId;
const NOW = '2026-11-09T12:00:00.000Z';

/** One device with its own workspace, talking to the shared cloud. */
async function device(cloud: MemoryCloud, email: string, name: string) {
  const provider = new MemoryProvider(cloud);
  await provider.signUp(email, 'password1');
  await provider.setDisplayName(name);
  const account = (await provider.currentAccount())!;
  const store = createCharacterStore().getState();
  const state = {
    campaigns: { ...store.campaigns } as Record<string, Campaign>,
    characters: { ...store.characters } as Record<string, CharacterRecord>,
    synced: {} as Record<string, string>,
    deleted: new Set<string>(),
  };
  const sync = async () => {
    const plan = planParty({
      me: account.id,
      campaigns: state.campaigns,
      characters: state.characters,
      deletedCharacterIds: state.deleted,
      snapshot: await provider.pullParty(),
      synced: state.synced,
      now: NOW,
    });
    for (const c of plan.pushCampaigns)
      await provider.pushSharedCampaign({
        id: c.id,
        changedAt: NOW,
        schemaVersion: 1,
        payload: c.payload,
      });
    for (const e of plan.pushEntities) await provider.pushPartyEntity(e);
    state.campaigns = plan.campaigns;
    state.characters = plan.characters;
    state.synced = plan.synced;
    return plan;
  };
  const share = async (role: 'dm' | 'player') => {
    const campaign = state.campaigns[CAMPAIGN]!;
    await provider.shareCampaign({
      id: CAMPAIGN,
      role,
      changedAt: NOW,
      schemaVersion: 1,
      payload: sharedPayload(campaign),
    });
  };
  return { provider, account, state, sync, share };
}

async function party() {
  const cloud = new MemoryCloud();
  const dm = await device(cloud, 'dm@example.com', 'Dana');
  await dm.share('dm');
  // The DM's copy of the starter character is a DM character; strip it so only the player has one.
  delete dm.state.characters[FOOL];
  const ana = await device(cloud, 'ana@example.com', 'Ana');
  delete ana.state.campaigns[CAMPAIGN];
  await ana.provider.joinCampaign(await dm.provider.createInvite(CAMPAIGN));
  return { cloud, dm, ana };
}

describe('party sync', () => {
  it('a joined player receives the campaign as shared with their role', async () => {
    const { ana } = await party();
    await ana.sync();
    expect(ana.state.campaigns[CAMPAIGN]).toMatchObject({ shared: true, role: 'player' });
  });

  it('uploads own characters and gives the others a read-only copy', async () => {
    const { dm, ana } = await party();
    const fool = ana.state.characters[FOOL] ?? dm.state.characters[FOOL];
    ana.state.characters[FOOL] = fool ?? createCharacterStore().getState().characters[FOOL]!;
    await ana.sync();
    const plan = await dm.sync();
    const copy = dm.state.characters[FOOL];
    expect(copy?.build.partyOwner).toEqual({ userId: ana.account.id, name: 'Ana' });
    expect(plan.pushEntities).toEqual([]);
    // The copy never uploads as the DM's own and never enters account sync.
    const rows = serializeWorkspace({
      ...createCharacterStore().getState(),
      characters: dm.state.characters,
      campaigns: dm.state.campaigns,
    });
    expect(workspaceContents(rows).has(`character:${FOOL}`)).toBe(false);
    expect(await dm.sync().then((p) => p.pushEntities)).toEqual([]);
  });

  it('keeps DM characters private', async () => {
    const { dm } = await party();
    const base = createCharacterStore().getState().characters[FOOL]!;
    dm.state.characters[FOOL] = { ...base, build: { ...base.build, playedBy: 'dm' } };
    const plan = await dm.sync();
    expect(plan.pushEntities).toEqual([]);
  });

  it('only the DM changes the campaign record', async () => {
    const { dm, ana } = await party();
    await ana.sync();
    await dm.sync();
    dm.state.campaigns[CAMPAIGN] = { ...dm.state.campaigns[CAMPAIGN]!, name: 'Renamed' };
    const pushed = await dm.sync();
    expect(pushed.pushCampaigns).toHaveLength(1);
    ana.state.campaigns[CAMPAIGN] = { ...ana.state.campaigns[CAMPAIGN]!, name: 'Mine' };
    const plan = await ana.sync();
    expect(plan.pushCampaigns).toEqual([]);
    expect(ana.state.campaigns[CAMPAIGN]?.name).toBe('Renamed');
  });

  it('leaving keeps a private copy and drops the others characters', async () => {
    const { dm, ana } = await party();
    ana.state.characters[FOOL] = createCharacterStore().getState().characters[FOOL]!;
    await ana.sync();
    await dm.sync();
    expect(dm.state.characters[FOOL]).toBeDefined();
    await dm.provider.leaveCampaign(CAMPAIGN);
    await dm.sync();
    expect(dm.state.campaigns[CAMPAIGN]?.shared).toBeUndefined();
    expect(dm.state.characters[FOOL]).toBeUndefined();
  });

  it('removing an own character deletes the party copy', async () => {
    const { dm, ana } = await party();
    ana.state.characters[FOOL] = createCharacterStore().getState().characters[FOOL]!;
    await ana.sync();
    delete ana.state.characters[FOOL];
    ana.state.deleted.add(FOOL);
    await ana.sync();
    await dm.sync();
    expect(dm.state.characters[FOOL]).toBeUndefined();
  });

  it('a missing character without a deletion marker does not delete the party copy', async () => {
    const { ana } = await party();
    ana.state.characters[FOOL] = createCharacterStore().getState().characters[FOOL]!;
    await ana.sync();
    delete ana.state.characters[FOOL];
    const plan = await ana.sync();
    expect(plan.pushEntities).toEqual([]);
  });
});

describe('party rules in the memory cloud', () => {
  it('non-members see nothing and cannot join without a valid code', async () => {
    const { cloud } = await party();
    const outsider = await device(cloud, 'out@example.com', 'Out');
    expect((await outsider.provider.pullParty()).campaigns).toEqual([]);
    await expect(outsider.provider.joinCampaign('WRONG')).rejects.toThrow();
  });

  it('a player cannot invite, remove or take the DM role', async () => {
    const { dm, ana } = await party();
    await expect(ana.provider.createInvite(CAMPAIGN)).rejects.toThrow();
    await expect(ana.provider.removeMember(CAMPAIGN, dm.account.id)).rejects.toThrow();
    await expect(ana.provider.setDm(CAMPAIGN, ana.account.id)).rejects.toThrow();
  });

  it('keeps exactly one DM after a handover', async () => {
    const { cloud, dm, ana } = await party();
    await dm.provider.setDm(CAMPAIGN, ana.account.id);
    expect(cloud.members.filter((m) => m.role === 'dm').map((m) => m.userId)).toEqual([
      ana.account.id,
    ]);
  });

  it('a new invite revokes the old one', async () => {
    const { dm, cloud } = await party();
    const first = await dm.provider.createInvite(CAMPAIGN);
    await dm.provider.createInvite(CAMPAIGN);
    const late = await device(cloud, 'late@example.com', 'Late');
    await expect(late.provider.joinCampaign(first)).rejects.toThrow();
  });

  it('only a character owner changes it', async () => {
    const { dm, ana } = await party();
    const entity = {
      campaignId: CAMPAIGN,
      entityId: 'x',
      deleted: false,
      changedAt: NOW,
      schemaVersion: 1,
      payload: {},
    };
    await ana.provider.pushPartyEntity(entity);
    await expect(dm.provider.pushPartyEntity(entity)).rejects.toThrow();
  });
});
