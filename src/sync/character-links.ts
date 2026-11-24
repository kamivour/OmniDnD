import { z } from 'zod';
import { ExportFileSchema, SCHEMA_VERSION, type ExportFile } from '../engine/schema';
import type { CharacterState } from '../engine/calc/sheet';
import { syncConfig } from './config';

export const CHARACTER_LINK_PATH = '/share/character';
export const CharacterLinkToken = z.uuid();
export const CharacterLinkSchema = z.strictObject({
  token: CharacterLinkToken,
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CharacterLink = z.infer<typeof CharacterLinkSchema>;

export interface CharacterLinkOwner {
  get(id: string): Promise<CharacterLink | null>;
  publish(id: string, snapshot: ExportFile): Promise<CharacterLink>;
  revoke(id: string): Promise<void>;
}

const detachedId = 'shared-character';

function withoutNotes<T extends { notes?: string | undefined }>(entry: T): T {
  const copy = { ...entry };
  delete copy.notes;
  return copy;
}

/** Detach publishable data before it leaves the device. Keep the rules used to calculate the sheet. */
export function characterLinkSnapshot(
  { build, live, campaign }: CharacterState,
  exportedAt: string,
): ExportFile {
  if (build.partyOwner) throw new Error('Only publish a character from your own workspace.');
  const rules = { ...campaign, id: detachedId, name: 'Shared character' };
  delete rules.bench;
  delete rules.role;
  delete rules.shared;
  const identity = { ...build };
  delete identity.playedBy;
  const stats = { ...live };
  delete stats.encounter;
  return ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    campaign: rules,
    build: {
      ...identity,
      id: detachedId,
      campaignId: detachedId,
      journal: {},
      choices: {},
      favorites: [],
      items: build.items.map(withoutNotes),
      ...(build.companions && {
        companions: build.companions.map(withoutNotes),
      }),
      overrides: build.overrides.map((entry) => ({
        ...entry,
        note: entry.note.trim() ? 'Shared override' : '',
      })),
    },
    live: {
      ...stats,
      characterId: detachedId,
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    },
    events: [],
  });
}

export function characterLinkUrl(token: string, origin: string): string {
  const url = new URL(CHARACTER_LINK_PATH, origin);
  url.hash = token;
  return url.href;
}

/** A viewer needs no account session or device database. The fragment stays out of the page request. */
export async function readCharacterLink(
  token: string,
  signal: AbortSignal,
): Promise<ExportFile | null> {
  if (!syncConfig) throw new Error('Character links are unavailable on this installation.');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(syncConfig.url, syncConfig.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client
    .rpc('read_character_link', { p_token: token })
    .abortSignal(signal);
  if (error) throw new Error('The shared character could not be loaded.');
  if (data === null) return null;
  const parsed = ExportFileSchema.safeParse(data);
  if (!parsed.success) throw new Error('This copy uses character data this version cannot read.');
  return parsed.data;
}
