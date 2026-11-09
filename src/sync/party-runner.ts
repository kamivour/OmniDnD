import { z } from 'zod';
import { database, parseStoredRecord, storedRecord } from '../db/database';
import { SyncRecordSchema } from '../db/sync-metadata';
import { characterStore } from '../state/character-store';
import { partyStore } from '../state/party-store';
import { flushPersistence } from '../state/persistence';
import { SCHEMA_VERSION } from '../engine/schema';
import { planParty } from './party';
import type { RemoteMember, SyncProvider } from './provider';

const SETTING = 'partySync';

const StateSchema = z.object({
  synced: z.record(z.string(), z.string()),
  members: z.array(
    z.object({
      campaignId: z.string(),
      userId: z.string(),
      role: z.enum(['dm', 'player']),
      name: z.string(),
    }),
  ),
});

async function readState(): Promise<z.infer<typeof StateSchema>> {
  const row = await database.settings.get(SETTING);
  const parsed = StateSchema.safeParse(row?.data);
  return parsed.success ? parsed.data : { synced: {}, members: [] };
}

/** Load the saved member list, so names show before the first sync of a session. */
export async function hydrateParty() {
  partyStore.setState({ members: (await readState()).members });
}

export interface PartyReport {
  uploaded: number;
  downloaded: number;
}

/**
 * Sync the party: upload own characters in shared campaigns, download the other members'
 * characters as read-only copies, and follow the campaign record. Runs after the account sync.
 */
export async function runPartySync(provider: SyncProvider): Promise<PartyReport> {
  const account = await provider.currentAccount();
  if (!account) throw new Error('Sign in to sync.');
  await flushPersistence();
  const snapshot = await provider.pullParty();
  const saved = await readState();
  const before = characterStore.getState();
  const deleted = new Set(
    (await database.sync.toArray())
      .map((row) => parseStoredRecord(row, SyncRecordSchema, 'sync record').data)
      .filter((record) => record.kind === 'character' && record.deleted)
      .map((record) => record.entityId),
  );
  const now = new Date().toISOString();
  const plan = planParty({
    me: account.id,
    campaigns: before.campaigns,
    characters: before.characters,
    deletedCharacterIds: deleted,
    snapshot,
    synced: saved.synced,
    now,
  });

  for (const campaign of plan.pushCampaigns)
    await provider.pushSharedCampaign({
      id: campaign.id,
      changedAt: now,
      schemaVersion: SCHEMA_VERSION,
      payload: campaign.payload,
    });
  for (const entity of plan.pushEntities) await provider.pushPartyEntity(entity);

  const after = characterStore.getState();
  const editedMeanwhile =
    after.campaigns !== before.campaigns || after.characters !== before.characters;
  const differs = (next: object, old: object) => {
    const keys = Object.keys(next);
    return (
      keys.length !== Object.keys(old).length ||
      keys.some(
        (key) => (next as Record<string, unknown>)[key] !== (old as Record<string, unknown>)[key],
      )
    );
  };
  const changes =
    differs(plan.campaigns, before.campaigns) || differs(plan.characters, before.characters);
  // Edits during the sync win; the next run plans the downloads again.
  if (changes && editedMeanwhile) return { uploaded: 0, downloaded: 0 };
  if (changes) {
    characterStore.setState({ campaigns: plan.campaigns, characters: plan.characters });
    await flushPersistence();
  }
  const members: RemoteMember[] = plan.members;
  await database.settings.put(storedRecord(SETTING, { synced: plan.synced, members }));
  partyStore.setState({ members, error: '' });
  return {
    uploaded: plan.pushEntities.length + plan.pushCampaigns.length,
    downloaded: plan.downloaded,
  };
}
