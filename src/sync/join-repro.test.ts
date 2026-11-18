import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { registry } from '../data/registry';
import { runManagement } from '../engine/commands/management';
import { keepOutOfSharing, moveToCampaign } from '../engine/commands/party';
import type { Campaign } from '../engine/schema';
import { createCharacterStore, type CharacterRecord } from '../state/character-store';
import { MemoryCloud, MemoryProvider } from './memory-provider';
import { planParty, sharedPayload } from './party';

/**
 * M43 T4: friends reported "All my characters were pushed in" after joining or sharing.
 * These two-account runs pin down which paths upload characters nobody picked.
 */

const SAMPLE = seedFile.build.campaignId;
const NOW = '2026-11-19T12:00:00.000Z';
const base = () => createCharacterStore([seedFile]).getState();

function character(id: string, campaignId: string): CharacterRecord {
  const record = structuredClone(base().characters[seedFile.build.id]!);
  return {
    ...record,
    build: { ...record.build, id, name: id, campaignId },
    live: { ...record.live, characterId: id },
    events: [],
  };
}

function campaign(id: string): Campaign {
  return { ...structuredClone(seedFile.campaign), id, name: id };
}

type Workspace = {
  campaigns: Record<string, Campaign>;
  characters: Record<string, CharacterRecord>;
};

/** One device: its own workspace and provider on the shared cloud. */
async function device(
  cloud: MemoryCloud,
  email: string,
  workspace: Workspace,
  options: { signUp?: boolean } = {},
) {
  const provider = new MemoryProvider(cloud);
  if (options.signUp ?? true) {
    await provider.signUp(email, 'password1');
    await provider.setDisplayName(email.split('@')[0]!);
  } else {
    await provider.signIn(email, 'password1');
  }
  const account = (await provider.currentAccount())!;
  const state = {
    campaigns: structuredClone(workspace.campaigns),
    characters: structuredClone(workspace.characters),
    synced: {} as Record<string, string>,
  };
  const pushed: string[] = [];
  const sync = async () => {
    const plan = planParty({
      me: account.id,
      campaigns: state.campaigns,
      characters: state.characters,
      deletedCharacterIds: new Set(),
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
    for (const e of plan.pushEntities) {
      await provider.pushPartyEntity(e);
      if (!e.deleted) pushed.push(e.entityId);
    }
    state.campaigns = plan.campaigns;
    state.characters = plan.characters;
    state.synced = plan.synced;
    return plan;
  };
  const share = async (id: string, role: 'dm' | 'player' = 'dm') => {
    await provider.shareCampaign({
      id,
      role,
      changedAt: NOW,
      schemaVersion: 1,
      payload: sharedPayload(state.campaigns[id]!),
    });
    state.campaigns[id] = { ...state.campaigns[id]!, shared: true, role };
  };
  return { provider, account, state, sync, share, pushed };
}

/** Characters the cloud shows to members of a campaign, by owner. */
const visible = (cloud: MemoryCloud, campaignId: string) =>
  [...cloud.party.values()]
    .filter((e) => e.campaignId === campaignId && !e.deleted)
    .map((e) => e.entityId)
    .sort();

async function table(cloud: MemoryCloud) {
  const dm = await device(cloud, 'dm@example.com', {
    campaigns: { table: campaign('table') },
    characters: {},
  });
  await dm.share('table');
  await dm.sync();
  return dm;
}

describe('join reproduction (M43 T4)', () => {
  it('joining without local characters uploads nothing', async () => {
    const cloud = new MemoryCloud();
    const dm = await table(cloud);
    const ana = await device(cloud, 'ana@example.com', { campaigns: {}, characters: {} });
    await ana.provider.joinCampaign(await dm.provider.createInvite('table'));
    await ana.sync();
    expect(ana.pushed).toEqual([]);
    expect(visible(cloud, 'table')).toEqual([]);
  });

  it('joining with characters in other campaigns uploads none of them', async () => {
    const cloud = new MemoryCloud();
    const dm = await table(cloud);
    const ana = await device(cloud, 'ana@example.com', {
      campaigns: { home: campaign('home'), other: campaign('other') },
      characters: {
        a: character('a', 'home'),
        b: character('b', 'home'),
        c: character('c', 'other'),
      },
    });
    await ana.provider.joinCampaign(await dm.provider.createInvite('table'));
    await ana.sync();
    await ana.sync();
    expect(ana.pushed).toEqual([]);
    expect(visible(cloud, 'table')).toEqual([]);
    expect(
      Object.values(ana.state.characters)
        .map((r) => r.build.campaignId)
        .sort(),
    ).toEqual(['home', 'home', 'other']);
  });

  it('joining a table whose ID matches a local private campaign keeps its characters private', async () => {
    const cloud = new MemoryCloud();
    const dm = await device(cloud, 'dm@example.com', base());
    delete dm.state.characters[seedFile.build.id];
    await dm.share(SAMPLE);
    await dm.sync();
    // Before 2026-11-19 every sample used the same campaign ID.
    const ana = await device(cloud, 'ana@example.com', {
      campaigns: { [SAMPLE]: campaign(SAMPLE) },
      characters: { a: character('a', SAMPLE), b: character('b', SAMPLE) },
    });
    await ana.provider.joinCampaign(await dm.provider.createInvite(SAMPLE));
    await ana.sync();
    expect(ana.pushed).toEqual([]);
    expect(visible(cloud, SAMPLE)).toEqual([]);
    expect(ana.state.characters.a?.build.campaignId).not.toBe(SAMPLE);
  });

  it('REPRODUCED: sharing a campaign uploads every own character in it, unasked', async () => {
    const cloud = new MemoryCloud();
    const ana = await device(cloud, 'ana@example.com', {
      campaigns: { home: campaign('home') },
      characters: {
        a: character('a', 'home'),
        b: character('b', 'home'),
        c: character('c', 'home'),
      },
    });
    await ana.share('home', 'player');
    await ana.sync();
    // Nothing asked Ana which characters to show; all three are now visible to members.
    expect(ana.pushed.sort()).toEqual(['a', 'b', 'c']);
    expect(visible(cloud, 'home')).toEqual(['a', 'b', 'c']);
  });

  it('REPRODUCED: the owner’s second device publishes its own same-ID sample characters', async () => {
    const cloud = new MemoryCloud();
    // Device 1 shares its old fixed-ID sample campaign with one character.
    const phone = await device(cloud, 'ana@example.com', {
      campaigns: { [SAMPLE]: campaign(SAMPLE) },
      characters: { a: character('a', SAMPLE) },
    });
    await phone.share(SAMPLE, 'player');
    await phone.sync();
    // Device 2, same account, played its own sample before signing in: two more characters there.
    const laptop = await device(
      cloud,
      'ana@example.com',
      {
        campaigns: { [SAMPLE]: campaign(SAMPLE) },
        characters: { x: character('x', SAMPLE), y: character('y', SAMPLE) },
      },
      { signUp: false },
    );
    await laptop.sync();
    expect(laptop.pushed.sort()).toEqual(['x', 'y']);
    expect(visible(cloud, SAMPLE)).toEqual(['a', 'x', 'y']);
  });

  it('a joined player’s second device uploads only characters already in the table', async () => {
    const cloud = new MemoryCloud();
    const dm = await table(cloud);
    const phone = await device(cloud, 'ana@example.com', {
      campaigns: { home: campaign('home') },
      characters: { a: character('a', 'home') },
    });
    await phone.provider.joinCampaign(await dm.provider.createInvite('table'));
    await phone.sync();
    phone.state.characters.t = character('t', 'table');
    await phone.sync();
    // Account sync brings both characters to the laptop; only the one in the table is shared.
    const laptop = await device(
      cloud,
      'ana@example.com',
      {
        campaigns: { home: campaign('home'), table: phone.state.campaigns.table! },
        characters: { a: character('a', 'home'), t: character('t', 'table') },
      },
      { signUp: false },
    );
    await laptop.sync();
    expect(visible(cloud, 'table')).toEqual(['t']);
    expect(laptop.pushed).toEqual([]);
  });

  it('FIXED: characters left out when sharing stay private', async () => {
    const cloud = new MemoryCloud();
    const ana = await device(cloud, 'ana@example.com', {
      campaigns: { home: campaign('home') },
      characters: { a: character('a', 'home'), b: character('b', 'home') },
    });
    const result = runManagement(
      keepOutOfSharing,
      ana.state,
      { campaignId: 'home', characterIds: ['b'], privateId: 'home-private' },
      registry,
      { eventId: 'keep', realTime: NOW },
    );
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    ana.state.campaigns = structuredClone(result.next.campaigns);
    ana.state.characters = structuredClone(result.next.characters);
    await ana.share('home', 'player');
    await ana.sync();
    expect(visible(cloud, 'home')).toEqual(['a']);
  });

  it('moving a character out of a shared campaign removes it for members', async () => {
    const cloud = new MemoryCloud();
    const dm = await table(cloud);
    const ana = await device(cloud, 'ana@example.com', {
      campaigns: { home: campaign('home') },
      characters: { a: character('a', 'home') },
    });
    await ana.provider.joinCampaign(await dm.provider.createInvite('table'));
    await ana.sync();
    const move = (campaignId: string) => {
      const result = runManagement(
        moveToCampaign,
        ana.state,
        { characterId: 'a', campaignId },
        registry,
        { eventId: `move-${campaignId}`, realTime: NOW, force: true },
      );
      if (result.result !== 'ok') throw new Error(result.reasons.join());
      ana.state.characters = structuredClone(result.next.characters);
    };
    move('table');
    await ana.sync();
    expect(visible(cloud, 'table')).toEqual(['a']);
    move('home');
    await ana.sync();
    expect(visible(cloud, 'table')).toEqual([]);
    expect(ana.state.characters.a?.build.campaignId).toBe('home');
  });
});
