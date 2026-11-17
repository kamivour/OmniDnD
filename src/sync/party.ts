import { z } from 'zod';
import { registry } from '../data/registry';
import { validateManagementData } from '../engine/commands/management';
import { fingerprint } from '../db/sync-metadata';
import {
  CampaignSchema,
  CharacterBuildSchema,
  LiveStateSchema,
  LogEventSchema,
  SCHEMA_VERSION,
  type Campaign,
} from '../engine/schema';
import type { CharacterRecord } from '../state/character-store';
import type { PartyPush, PartySnapshot, RemoteMember } from './provider';

const CharacterPayloadSchema = z.strictObject({
  build: CharacterBuildSchema,
  live: LiveStateSchema,
  events: z.array(LogEventSchema),
});

export interface PartyInput {
  me: string;
  campaigns: Record<string, Campaign>;
  characters: Record<string, CharacterRecord>;
  /** Characters this device deleted (sync deletion markers). */
  deletedCharacterIds: ReadonlySet<string>;
  snapshot: PartySnapshot;
  /** Campaign content fingerprint at the last party sync, by campaign id. */
  synced: Record<string, string>;
  now: string;
}

export interface PartyPlan {
  campaigns: Record<string, Campaign>;
  characters: Record<string, CharacterRecord>;
  synced: Record<string, string>;
  members: RemoteMember[];
  pushCampaigns: { id: string; payload: unknown }[];
  pushEntities: PartyPush[];
  /** Records written to this device. */
  downloaded: number;
}

/** What a shared campaign stores in the cloud: the record without this person's own choices. */
export function sharedPayload(campaign: Campaign): Omit<Campaign, 'role' | 'shared'> {
  const { role, shared, ...rest } = campaign;
  void role;
  void shared;
  return rest;
}

/** Public build and live state; journals and Undo patches stay with the owner. */
export const partyContent = (record: CharacterRecord) => ({
  build: { ...record.build, journal: {} },
  live: record.live,
  // Inverse patches can contain old journal text too. Other members have no Undo rights.
  events: [],
});

function withOwn(campaign: Campaign, own: { role: 'dm' | 'player'; shared: true }): Campaign {
  return campaign.role === own.role && campaign.shared ? campaign : { ...campaign, ...own };
}

/**
 * One pass of the party rules, without any storage or network. Own characters upload; other
 * members' characters download as read-only copies. The campaign record flows from the DM
 * (or from the owner while nobody is DM) to everyone else.
 */
export function planParty(input: PartyInput): PartyPlan {
  const { me, snapshot, now } = input;
  const campaigns = { ...input.campaigns };
  const characters = { ...input.characters };
  const synced = { ...input.synced };
  const pushCampaigns: PartyPlan['pushCampaigns'] = [];
  const pushEntities: PartyPush[] = [];
  let downloaded = 0;

  const remoteIds = new Set(snapshot.campaigns.map((campaign) => campaign.id));
  const nameOf = (userId: string) => snapshot.members.find((m) => m.userId === userId)?.name;

  // Campaign records.
  for (const remote of snapshot.campaigns) {
    if (remote.schemaVersion !== SCHEMA_VERSION) continue;
    const mine = snapshot.members.find((m) => m.campaignId === remote.id && m.userId === me);
    if (!mine) continue;
    const hasDm = snapshot.members.some((m) => m.campaignId === remote.id && m.role === 'dm');
    const canEdit = mine.role === 'dm' || (remote.ownerId === me && !hasDm);
    let local = campaigns[remote.id];
    const remoteFp = fingerprint(remote.payload);
    const own = { role: mine.role, shared: true } as const;

    // Starter IDs repeat across devices. Joining must not publish an unrelated private table.
    if (local && !local.shared && remote.ownerId !== me) {
      const parsed = CampaignSchema.safeParse({ ...(remote.payload as object), ...own });
      if (!parsed.success || parsed.data.id !== remote.id) continue;
      const privateBase = `private-${remote.id.slice(0, 160)}`;
      let privateId = privateBase;
      for (let suffix = 2; Object.hasOwn(campaigns, privateId); suffix++)
        privateId = `${privateBase}-${suffix}`;
      campaigns[privateId] = { ...local, id: privateId };
      for (const [id, record] of Object.entries(characters)) {
        if (record.build.campaignId === remote.id && !record.build.partyOwner)
          characters[id] = { ...record, build: { ...record.build, campaignId: privateId } };
      }
      delete campaigns[remote.id];
      local = undefined;
    }

    if (!local) {
      const parsed = CampaignSchema.safeParse({ ...(remote.payload as object), ...own });
      if (!parsed.success) continue;
      campaigns[remote.id] = parsed.data;
      synced[remote.id] = remoteFp;
      downloaded += 1;
      continue;
    }
    const localFp = fingerprint(sharedPayload(local));
    if (canEdit && synced[remote.id] !== undefined && localFp !== synced[remote.id]) {
      pushCampaigns.push({ id: remote.id, payload: sharedPayload(local) });
      synced[remote.id] = localFp;
      campaigns[remote.id] = withOwn(local, own);
    } else if (localFp !== remoteFp) {
      const parsed = CampaignSchema.safeParse({ ...(remote.payload as object), ...own });
      if (parsed.success) {
        campaigns[remote.id] = parsed.data;
        synced[remote.id] = remoteFp;
        downloaded += 1;
      }
    } else {
      synced[remote.id] = remoteFp;
      campaigns[remote.id] = withOwn(local, own);
    }
  }

  // Campaigns this account no longer belongs to become private copies.
  for (const [id, campaign] of Object.entries(campaigns)) {
    if (!campaign.shared || remoteIds.has(id)) continue;
    const { shared, ...rest } = campaign;
    void shared;
    campaigns[id] = rest;
    delete synced[id];
    for (const [characterId, record] of Object.entries(characters))
      if (record.build.partyOwner && record.build.campaignId === id) delete characters[characterId];
  }

  // Other members' characters: read-only copies.
  const remoteById = new Map(snapshot.entities.map((e) => [`${e.campaignId}|${e.entityId}`, e]));
  const seen = new Set<string>();
  for (const entity of snapshot.entities) {
    if (entity.ownerId === me || entity.schemaVersion !== SCHEMA_VERSION) continue;
    const matches = (id: string) =>
      characters[id]?.build.partyOwner?.userId === entity.ownerId &&
      characters[id]?.build.campaignId === entity.campaignId;
    const alias = `party:${entity.campaignId}:${entity.ownerId}:${entity.entityId}`;
    let cacheId = matches(alias) ? alias : entity.entityId;
    if (characters[cacheId] && !matches(cacheId)) {
      cacheId = alias;
      while (characters[cacheId] && !matches(cacheId)) cacheId += ':view';
    }
    const local = characters[cacheId];
    if (entity.deleted) {
      if (local) {
        delete characters[cacheId];
        downloaded += 1;
      }
      continue;
    }
    seen.add(cacheId);
    const parsed = CharacterPayloadSchema.safeParse(entity.payload);
    if (!parsed.success) continue;
    if (
      parsed.data.build.id !== entity.entityId ||
      parsed.data.live.characterId !== entity.entityId
    )
      continue;
    const name = nameOf(entity.ownerId) ?? local?.build.partyOwner?.name ?? '';
    const next: CharacterRecord = {
      ...partyContent(parsed.data),
      build: {
        ...parsed.data.build,
        id: cacheId,
        journal: {},
        campaignId: entity.campaignId,
        partyOwner: { userId: entity.ownerId, name },
      },
      live: { ...parsed.data.live, characterId: cacheId },
    };
    const campaign = campaigns[entity.campaignId];
    if (!campaign) continue;
    try {
      validateManagementData(
        { campaigns: { [campaign.id]: campaign }, characters: { [cacheId]: next } },
        registry,
      );
    } catch {
      // Unsupported references or mismatched identities must not replace a readable cached copy.
      continue;
    }
    if (local && fingerprint(local) === fingerprint(next)) continue;
    characters[cacheId] = next;
    downloaded += 1;
  }
  for (const [id, record] of Object.entries(characters)) {
    if (!record.build.partyOwner || seen.has(id)) continue;
    const key = `${record.build.campaignId}|${id}`;
    if (remoteIds.has(record.build.campaignId) && !remoteById.has(key)) {
      delete characters[id];
      downloaded += 1;
    }
  }

  // Own characters: upload when the cloud copy differs, delete the cloud copy when removed here.
  for (const [id, record] of Object.entries(characters)) {
    const { build } = record;
    if (build.partyOwner || build.playedBy === 'dm' || !remoteIds.has(build.campaignId)) continue;
    const remote = remoteById.get(`${build.campaignId}|${id}`);
    if (remote && remote.ownerId !== me) continue;
    const content = partyContent(record);
    if (remote && !remote.deleted && fingerprint(remote.payload) === fingerprint(content)) continue;
    pushEntities.push({
      campaignId: build.campaignId,
      entityId: id,
      deleted: false,
      changedAt: now,
      schemaVersion: SCHEMA_VERSION,
      payload: content,
    });
  }
  for (const remote of snapshot.entities) {
    if (remote.ownerId !== me || remote.deleted) continue;
    const local = characters[remote.entityId];
    const gone = local
      ? local.build.campaignId !== remote.campaignId || local.build.playedBy === 'dm'
      : input.deletedCharacterIds.has(remote.entityId);
    if (!gone) continue;
    pushEntities.push({
      campaignId: remote.campaignId,
      entityId: remote.entityId,
      deleted: true,
      changedAt: now,
      schemaVersion: SCHEMA_VERSION,
      payload: null,
    });
  }

  return {
    campaigns,
    characters,
    synced,
    members: snapshot.members,
    pushCampaigns,
    pushEntities,
    downloaded,
  };
}
