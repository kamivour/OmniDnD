import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SyncKindSchema } from '../db/sync-metadata';
import type { SyncConfig } from './config';
import type { Account, PushResult, RemoteEntity, SignInResult, SyncProvider } from './provider';

const TABLE = 'sync_entities';
const COLUMNS = 'kind, entity_id, revision, deleted, changed_at, schema_version, payload';

interface Row {
  kind: string;
  entity_id: string;
  revision: number;
  deleted: boolean;
  changed_at: string;
  schema_version: number;
  payload: unknown;
}

function toRemote(row: Row): RemoteEntity {
  return {
    kind: SyncKindSchema.parse(row.kind),
    entityId: row.entity_id,
    revision: Number(row.revision),
    deleted: row.deleted,
    changedAt: row.changed_at,
    schemaVersion: row.schema_version,
    payload: row.payload,
  };
}

const toAccount = (user: User): Account => ({ id: user.id, email: user.email ?? '' });

/** Supabase backend (see supabase/migrations). Row-level security limits every query to the user. */
export class SupabaseProvider implements SyncProvider {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async currentAccount() {
    const { data } = await this.client.auth.getSession();
    return data.session ? toAccount(data.session.user) : null;
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) return { result: 'error', message: error.message };
    return { result: 'ok', account: toAccount(data.user) };
  }

  async signUp(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) return { result: 'error', message: error.message };
    if (!data.session || !data.user) return { result: 'confirm-email' };
    return { result: 'ok', account: toAccount(data.user) };
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getDisplayName() {
    const { data, error } = await this.client
      .from('profiles')
      .select('display_name')
      .returns<{ display_name: string }[]>();
    if (error) throw new Error(error.message);
    return data[0]?.display_name ?? null;
  }

  async setDisplayName(name: string) {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) throw new Error('Use 1 to 40 characters.');
    // user_id defaults to auth.uid(); row-level security keeps this to the caller's own row.
    const { error } = await this.client
      .from('profiles')
      .upsert({ display_name: trimmed }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }

  async deleteAccount() {
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw new Error(error.message);
    // The session token is dead now; clear it locally. A failure here changes nothing.
    await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  async requestPasswordReset(email: string, redirectTo: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(error.message);
  }

  async updatePassword(password: string) {
    if (password.length < 8) throw new Error('Use at least 8 characters.');
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }

  async pull(): Promise<RemoteEntity[]> {
    const { data, error } = await this.client.from(TABLE).select(COLUMNS).returns<Row[]>();
    if (error) throw new Error(error.message);
    return data.map(toRemote);
  }

  private async current(kind: string, entityId: string): Promise<RemoteEntity | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select(COLUMNS)
      .eq('kind', kind)
      .eq('entity_id', entityId)
      .returns<Row[]>();
    if (error) throw new Error(error.message);
    return data[0] ? toRemote(data[0]) : null;
  }

  async push(
    entity: Parameters<SyncProvider['push']>[0],
    expectedRevision: number | null,
  ): Promise<PushResult> {
    const row = {
      kind: entity.kind,
      entity_id: entity.entityId,
      deleted: entity.deleted,
      changed_at: entity.changedAt,
      schema_version: entity.schemaVersion,
      payload: entity.payload,
    };
    if (expectedRevision === null) {
      const { data, error } = await this.client
        .from(TABLE)
        .insert(row)
        .select('revision')
        .returns<Pick<Row, 'revision'>[]>();
      // 23505: unique violation. Another device created the row first.
      if (error?.code === '23505')
        return { result: 'conflict', current: await this.current(entity.kind, entity.entityId) };
      if (error) throw new Error(error.message);
      return { result: 'ok', revision: Number(data[0]?.revision ?? 1) };
    }
    // Compare-and-set: only the expected revision updates; the trigger assigns the next one.
    const { data, error } = await this.client
      .from(TABLE)
      .update(row)
      .eq('kind', entity.kind)
      .eq('entity_id', entity.entityId)
      .eq('revision', expectedRevision)
      .select('revision')
      .returns<Pick<Row, 'revision'>[]>();
    if (error) throw new Error(error.message);
    if (!data[0])
      return { result: 'conflict', current: await this.current(entity.kind, entity.entityId) };
    return { result: 'ok', revision: Number(data[0].revision) };
  }
}

/** Load the Supabase library only when accounts are configured, so guests never download it. */
export async function createSupabaseProvider(config: SyncConfig): Promise<SupabaseProvider> {
  const { createClient } = await import('@supabase/supabase-js');
  return new SupabaseProvider(
    createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'omnidnd-auth' },
    }),
  );
}
