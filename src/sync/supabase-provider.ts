import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SyncKindSchema } from '../db/sync-metadata';
import { authErrorText } from './auth-errors';
import { avatarProblem, isAvatar } from './avatar';
import { cleanName, NAME_TAKEN, nameProblem } from './display-name';
import type { SyncConfig } from './config';
import type {
  Account,
  InvitePreview,
  PartyProvider,
  PartyPush,
  PartySnapshot,
  PushResult,
  RemoteEntity,
  SignInResult,
  SyncProvider,
} from './provider';

const TABLE = 'sync_entities';
const COLUMNS = 'kind, entity_id, revision, deleted, changed_at, schema_version, payload';
/** Shown when the server has not run the DM seat migration (M43). */
const SEAT_UPDATE =
  'This server needs an update before members can choose the DM seat. Join as a player, then ask the owner to make you DM.';

interface Row {
  kind: string;
  entity_id: string;
  revision: number;
  deleted: boolean;
  changed_at: string;
  schema_version: number;
  payload: unknown;
}

/** Postgres sends `+00:00` offsets and microseconds; the app stores UTC ISO strings ending in Z. */
export function isoTime(value: string): string {
  // Trim to milliseconds first: some Safari versions reject longer fractions.
  const time = new Date(value.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(time.getTime())) throw new Error(`Server sent an unreadable time: ${value}`);
  return time.toISOString();
}

function toRemote(row: Row): RemoteEntity {
  return {
    kind: SyncKindSchema.parse(row.kind),
    entityId: row.entity_id,
    revision: Number(row.revision),
    deleted: row.deleted,
    changedAt: isoTime(row.changed_at),
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
    if (error) return { result: 'error', message: authErrorText(error) };
    return { result: 'ok', account: toAccount(data.user) };
  }

  async signUp(email: string, password: string, displayName?: string): Promise<SignInResult> {
    const name = displayName === undefined ? undefined : cleanName(displayName);
    const problem = name === undefined ? null : nameProblem(name);
    if (problem) return { result: 'error', message: problem };
    // The signup trigger (M43) reserves the name with the account in one step.
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      ...(name ? { options: { data: { display_name: name } } } : {}),
    });
    if (error)
      return {
        result: 'error',
        message:
          name && /database error saving new user/i.test(error.message)
            ? `${NAME_TAKEN}. Someone may have just chosen it; try another.`
            : authErrorText(error),
      };
    if (!data.session || !data.user) return { result: 'confirm-email' };
    // A server without the M43 signup trigger has no profile yet, so save the name now.
    if (name && !(await this.getDisplayName().catch(() => null)))
      await this.setDisplayName(name).catch(() => undefined);
    return { result: 'ok', account: toAccount(data.user) };
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(error.message);
  }

  async getDisplayName() {
    // Party members can read each other's profiles, so pick the caller's own row.
    const account = await this.currentAccount();
    if (!account) return null;
    const { data, error } = await this.client
      .from('profiles')
      .select('display_name')
      .eq('user_id', account.id)
      .returns<{ display_name: string }[]>();
    if (error) throw new Error(error.message);
    return data[0]?.display_name ?? null;
  }

  async setDisplayName(name: string) {
    const problem = nameProblem(name);
    if (problem) throw new Error(problem);
    // user_id defaults to auth.uid(); row-level security keeps this to the caller's own row.
    const { error } = await this.client
      .from('profiles')
      .upsert({ display_name: cleanName(name) }, { onConflict: 'user_id' });
    if (error) throw new Error(error.code === '23505' ? NAME_TAKEN : error.message);
  }

  async displayNameAvailable(name: string) {
    const { data, error } = await this.client.rpc('display_name_available', {
      p_name: cleanName(name),
    });
    if (error) return null;
    return data === true;
  }

  async getAvatar() {
    const account = await this.currentAccount();
    if (!account) return null;
    const { data, error } = await this.client
      .from('profiles')
      .select('avatar')
      .eq('user_id', account.id)
      .returns<{ avatar: string | null }[]>();
    // A server without the avatar column shows the default mask.
    if (error) return null;
    const avatar = data[0]?.avatar;
    return isAvatar(avatar) ? avatar : null;
  }

  async setAvatar(avatar: string | null) {
    const problem = avatarProblem(avatar);
    if (problem) throw new Error(problem);
    const account = await this.currentAccount();
    if (!account) throw new Error('Sign in first.');
    const { data, error } = await this.client
      .from('profiles')
      .update({ avatar })
      .eq('user_id', account.id)
      .select('user_id');
    if (error)
      throw new Error(
        error.code === '42703' || error.code === 'PGRST204'
          ? 'The account server needs an update before it can keep pictures.'
          : error.message,
      );
    if (!data?.length) throw new Error('Choose a display name first.');
  }

  async deleteAccount() {
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw new Error(error.message);
    // The session token is dead now; clear it locally. A failure here changes nothing.
    await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  async requestPasswordReset(email: string, redirectTo: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error(authErrorText(error));
  }

  async updatePassword(password: string) {
    if (password.length < 8) throw new Error('Use at least 8 characters.');
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw new Error(authErrorText(error));
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

  // ---- Shared campaigns (M24). The database functions enforce who may do what. ----

  private async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  async shareCampaign(campaign: Parameters<PartyProvider['shareCampaign']>[0]) {
    await this.call('share_campaign', {
      p_id: campaign.id,
      p_role: campaign.role,
      p_schema_version: campaign.schemaVersion,
      p_changed_at: campaign.changedAt,
      p_payload: campaign.payload,
    });
  }

  createInvite(campaignId: string) {
    return this.call<string>('create_invite', { p_campaign: campaignId });
  }

  async requestJoin(campaignId: string, characterId: string, characterName: string) {
    await this.call('request_campaign_join', {
      p_campaign: campaignId,
      p_character: characterId,
      p_name: characterName,
    });
  }

  async listJoinRequests(): Promise<import('./provider').JoinRequest[]> {
    const { data, error } = await this.client
      .from('campaign_join_requests')
      .select('campaign_id,user_id,character_id,character_name,requester_name,status');
    // An older deployment can still sync existing parties while this additive migration rolls out.
    if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      campaignId: row.campaign_id,
      userId: row.user_id,
      characterId: row.character_id,
      characterName: row.character_name,
      requesterName: row.requester_name,
      status: row.status,
    }));
  }

  async resolveJoinRequest(campaignId: string, userId: string, approve: boolean) {
    await this.call('resolve_campaign_join', {
      p_campaign: campaignId,
      p_user: userId,
      p_approve: approve,
    });
  }

  async revokeInvites(campaignId: string) {
    await this.call('revoke_invites', { p_campaign: campaignId });
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const row = await this.call<{
      campaign_id: string;
      name: string;
      dm_name: string | null;
      has_dm?: boolean;
      member_count: number;
      already_member: boolean;
    }>('preview_invite', { p_code: code });
    return {
      campaignId: row.campaign_id,
      name: row.name,
      dmName: row.dm_name,
      hasDm: row.has_dm ?? row.dm_name != null,
      memberCount: Number(row.member_count),
      alreadyMember: row.already_member,
    };
  }

  async joinCampaign(code: string, role: 'dm' | 'player' = 'player') {
    const { data, error } = await this.client.rpc('join_campaign', { p_code: code, p_role: role });
    if (!error) return data as string;
    // A server without the DM seat migration only has join_campaign(p_code), which joins as a player.
    if (error.code === 'PGRST202' && role === 'player')
      return this.call<string>('join_campaign', { p_code: code });
    throw new Error(error.code === 'PGRST202' ? SEAT_UPDATE : error.message);
  }

  claimDm(campaignId: string) {
    return this.seat('claim_dm', campaignId);
  }

  releaseDm(campaignId: string) {
    return this.seat('release_dm', campaignId);
  }

  private async seat(name: string, campaignId: string) {
    const { error } = await this.client.rpc(name, { p_campaign: campaignId });
    if (error) throw new Error(error.code === 'PGRST202' ? SEAT_UPDATE : error.message);
  }

  async leaveCampaign(campaignId: string) {
    await this.call('leave_campaign', { p_campaign: campaignId });
  }

  async removeMember(campaignId: string, userId: string) {
    await this.call('remove_member', { p_campaign: campaignId, p_user: userId });
  }

  async setDm(campaignId: string, userId: string) {
    await this.call('set_dm', { p_campaign: campaignId, p_user: userId });
  }

  /** Names and pictures of visible profiles; a server without the avatar column gives names only. */
  private async memberProfiles() {
    type Profile = { user_id: string; display_name: string; avatar?: string | null };
    const full = await this.client
      .from('profiles')
      .select('user_id, display_name, avatar')
      .returns<Profile[]>();
    if (!full.error) return full;
    return this.client.from('profiles').select('user_id, display_name').returns<Profile[]>();
  }

  async pullParty(): Promise<PartySnapshot> {
    const [campaigns, members, entities, names] = await Promise.all([
      this.client
        .from('shared_campaigns')
        .select('id, owner_id, revision, changed_at, schema_version, payload')
        .returns<
          {
            id: string;
            owner_id: string;
            revision: number;
            changed_at: string;
            schema_version: number;
            payload: unknown;
          }[]
        >(),
      this.client
        .from('campaign_members')
        .select('campaign_id, user_id, role')
        .returns<{ campaign_id: string; user_id: string; role: 'dm' | 'player' }[]>(),
      this.client
        .from('party_entities')
        .select(
          'campaign_id, entity_id, owner_id, revision, deleted, changed_at, schema_version, payload',
        )
        .returns<
          {
            campaign_id: string;
            entity_id: string;
            owner_id: string;
            revision: number;
            deleted: boolean;
            changed_at: string;
            schema_version: number;
            payload: unknown;
          }[]
        >(),
      this.memberProfiles(),
    ]);
    for (const result of [campaigns, members, entities, names])
      if (result.error) throw new Error(result.error.message);
    const nameOf = new Map((names.data ?? []).map((row) => [row.user_id, row.display_name]));
    const avatarOf = new Map((names.data ?? []).map((row) => [row.user_id, row.avatar]));
    return {
      campaigns: (campaigns.data ?? []).map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        revision: Number(row.revision),
        changedAt: isoTime(row.changed_at),
        schemaVersion: row.schema_version,
        payload: row.payload,
      })),
      members: (members.data ?? []).map((row) => {
        const avatar = avatarOf.get(row.user_id);
        return {
          campaignId: row.campaign_id,
          userId: row.user_id,
          role: row.role,
          name: nameOf.get(row.user_id) ?? '',
          ...(isAvatar(avatar) ? { avatar } : {}),
        };
      }),
      entities: (entities.data ?? []).map((row) => ({
        campaignId: row.campaign_id,
        entityId: row.entity_id,
        ownerId: row.owner_id,
        revision: Number(row.revision),
        deleted: row.deleted,
        changedAt: isoTime(row.changed_at),
        schemaVersion: row.schema_version,
        payload: row.payload,
      })),
    };
  }

  async pushSharedCampaign(campaign: Parameters<PartyProvider['pushSharedCampaign']>[0]) {
    const { data, error } = await this.client
      .from('shared_campaigns')
      .update({
        changed_at: campaign.changedAt,
        schema_version: campaign.schemaVersion,
        payload: campaign.payload,
      })
      .eq('id', campaign.id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('You cannot change this campaign.');
  }

  async pushPartyEntity(entity: PartyPush) {
    const { error } = await this.client.from('party_entities').upsert(
      {
        campaign_id: entity.campaignId,
        entity_id: entity.entityId,
        deleted: entity.deleted,
        changed_at: entity.changedAt,
        schema_version: entity.schemaVersion,
        payload: entity.payload,
      },
      { onConflict: 'campaign_id,entity_id' },
    );
    if (error) throw new Error(error.message);
  }

  subscribeParty(onChange: () => void) {
    const channel = this.client.channel('party');
    for (const table of [
      'party_entities',
      'shared_campaigns',
      'campaign_members',
      'campaign_join_requests',
    ])
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
    channel.subscribe();
    return () => void this.client.removeChannel(channel);
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
