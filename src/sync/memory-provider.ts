import { cleanName, NAME_TAKEN, nameKey, nameProblem } from './display-name';
import type {
  Account,
  InvitePreview,
  JoinRequest,
  PartyPush,
  PartySnapshot,
  PushEntity,
  PushResult,
  RemoteEntity,
  RemoteMember,
  RemotePartyEntity,
  RemoteSharedCampaign,
  SignInResult,
  SyncProvider,
} from './provider';

/**
 * In-memory cloud with the same rules as the Supabase schema: rows belong to one account,
 * revisions start at 1 and rise by one per write, and a write with a stale revision fails.
 * Several providers can share one `MemoryCloud` to act as separate devices.
 */
export class MemoryCloud {
  readonly accounts = new Map<string, { account: Account; password: string }>();
  readonly rows = new Map<string, RemoteEntity>();
  /** Display names by account id. */
  readonly names = new Map<string, string>();
  /** Emails that asked for a password reset link. */
  readonly resetRequests: string[] = [];

  /** Shared campaigns, members, invites and party characters (M24), with the same rules as the SQL. */
  readonly shared = new Map<string, RemoteSharedCampaign>();
  readonly members: { campaignId: string; userId: string; role: 'dm' | 'player' }[] = [];
  readonly invites: { code: string; campaignId: string; expired: boolean; revoked: boolean }[] = [];
  readonly party = new Map<string, RemotePartyEntity>();
  readonly partyListeners = new Set<() => void>();
  readonly joinRequests = new Map<string, JoinRequest>();
  private nextCode = 1;

  key(accountId: string, kind: string, entityId: string) {
    return `${accountId}|${kind}|${entityId}`;
  }

  newCode() {
    return `CODE${String(this.nextCode++).padStart(8, '0')}`;
  }

  notifyParty() {
    for (const listener of [...this.partyListeners]) listener();
  }
}

export class MemoryProvider implements SyncProvider {
  private account: Account | null = null;

  readonly cloud: MemoryCloud;

  constructor(cloud: MemoryCloud) {
    this.cloud = cloud;
  }

  currentAccount() {
    return Promise.resolve(this.account);
  }

  signUp(email: string, password: string, displayName?: string): Promise<SignInResult> {
    const key = email.trim().toLowerCase();
    if (this.cloud.accounts.has(key))
      return Promise.resolve({ result: 'error', message: 'An account with this email exists.' });
    if (displayName !== undefined) {
      const problem = nameProblem(displayName) ?? (this.nameTaken(displayName) ? NAME_TAKEN : null);
      if (problem) return Promise.resolve({ result: 'error', message: problem });
    }
    const account = { id: `user-${this.cloud.accounts.size + 1}`, email: key };
    this.cloud.accounts.set(key, { account, password });
    if (displayName !== undefined) this.cloud.names.set(account.id, cleanName(displayName));
    this.account = account;
    return Promise.resolve({ result: 'ok', account });
  }

  /** True when an account other than `self` uses the name, ignoring case. */
  private nameTaken(name: string, self?: string) {
    return [...this.cloud.names].some(
      ([id, used]) => id !== self && nameKey(used) === nameKey(name),
    );
  }

  displayNameAvailable(name: string) {
    return Promise.resolve(!this.nameTaken(name, this.account?.id));
  }

  signIn(email: string, password: string): Promise<SignInResult> {
    const saved = this.cloud.accounts.get(email.trim().toLowerCase());
    if (!saved || saved.password !== password)
      return Promise.resolve({ result: 'error', message: 'Wrong email or password.' });
    this.account = saved.account;
    return Promise.resolve({ result: 'ok', account: saved.account });
  }

  signOut() {
    this.account = null;
    return Promise.resolve();
  }

  getDisplayName() {
    return Promise.resolve(this.cloud.names.get(this.require().id) ?? null);
  }

  setDisplayName(name: string) {
    const id = this.require().id;
    const problem = nameProblem(name) ?? (this.nameTaken(name, id) ? NAME_TAKEN : null);
    if (problem) return Promise.reject(new Error(problem));
    this.cloud.names.set(id, cleanName(name));
    return Promise.resolve();
  }

  deleteAccount() {
    const account = this.require();
    this.cloud.accounts.delete(account.email);
    this.cloud.names.delete(account.id);
    for (const key of [...this.cloud.rows.keys()])
      if (key.startsWith(`${account.id}|`)) this.cloud.rows.delete(key);
    this.account = null;
    return Promise.resolve();
  }

  requestPasswordReset(email: string, redirectTo?: string) {
    void redirectTo;
    this.cloud.resetRequests.push(email.trim().toLowerCase());
    return Promise.resolve();
  }

  updatePassword(password: string) {
    if (password.length < 8) return Promise.reject(new Error('Use at least 8 characters.'));
    const account = this.require();
    const saved = this.cloud.accounts.get(account.email);
    if (saved) saved.password = password;
    return Promise.resolve();
  }

  pull(): Promise<RemoteEntity[]> {
    const account = this.require();
    const prefix = `${account.id}|`;
    return Promise.resolve(
      [...this.cloud.rows.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, row]) => structuredClone(row)),
    );
  }

  push(entity: PushEntity, expectedRevision: number | null): Promise<PushResult> {
    const account = this.require();
    const key = this.cloud.key(account.id, entity.kind, entity.entityId);
    const current = this.cloud.rows.get(key);
    if ((current?.revision ?? null) !== expectedRevision)
      return Promise.resolve({
        result: 'conflict',
        current: current ? structuredClone(current) : null,
      });
    const revision = (current?.revision ?? 0) + 1;
    this.cloud.rows.set(key, { ...structuredClone(entity), revision });
    return Promise.resolve({ result: 'ok', revision });
  }

  // ---- Shared campaigns (M24) ----

  private member(campaignId: string, userId = this.require().id) {
    return this.cloud.members.find((m) => m.campaignId === campaignId && m.userId === userId);
  }

  private isOwnerOrDm(campaignId: string) {
    return (
      this.cloud.shared.get(campaignId)?.ownerId === this.require().id ||
      this.member(campaignId)?.role === 'dm'
    );
  }

  private canEditCampaign(campaignId: string) {
    if (this.member(campaignId)?.role === 'dm') return true;
    const hasDm = this.cloud.members.some((m) => m.campaignId === campaignId && m.role === 'dm');
    return this.cloud.shared.get(campaignId)?.ownerId === this.require().id && !hasDm;
  }

  shareCampaign(campaign: Parameters<SyncProvider['shareCampaign']>[0]) {
    const me = this.require().id;
    if (this.cloud.shared.has(campaign.id)) return Promise.reject(new Error('Already shared'));
    this.cloud.shared.set(campaign.id, {
      id: campaign.id,
      ownerId: me,
      revision: 1,
      changedAt: campaign.changedAt,
      schemaVersion: campaign.schemaVersion,
      payload: structuredClone(campaign.payload),
    });
    this.cloud.members.push({ campaignId: campaign.id, userId: me, role: campaign.role });
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  createInvite(campaignId: string) {
    if (!this.isOwnerOrDm(campaignId))
      return Promise.reject(new Error('Only the owner or the DM can invite'));
    for (const invite of this.cloud.invites)
      if (invite.campaignId === campaignId) invite.revoked = true;
    const code = this.cloud.newCode();
    this.cloud.invites.push({ code, campaignId, expired: false, revoked: false });
    return Promise.resolve(code);
  }

  requestJoin(campaignId: string, characterId: string, characterName: string) {
    const userId = this.require().id;
    if (!this.cloud.shared.has(campaignId))
      return Promise.reject(new Error('This campaign is not available for requests'));
    if (this.member(campaignId)) return Promise.reject(new Error('You are already a member'));
    if (!characterName.trim() || characterName.trim().length > 200 || characterId.length > 200)
      return Promise.reject(new Error('Character details are invalid'));
    const key = `${campaignId}|${userId}`;
    if (
      this.cloud.joinRequests.get(key)?.status !== 'pending' &&
      [...this.cloud.joinRequests.values()].filter(
        (r) => r.userId === userId && r.status === 'pending',
      ).length >= 20
    )
      return Promise.reject(new Error('Resolve your pending requests before sending more'));
    this.cloud.joinRequests.set(key, {
      campaignId,
      userId,
      characterId,
      characterName: characterName.trim(),
      requesterName: this.cloud.names.get(userId) ?? 'Player',
      status: 'pending',
    });
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  listJoinRequests(): Promise<JoinRequest[]> {
    const me = this.require().id;
    return Promise.resolve(
      structuredClone(
        [...this.cloud.joinRequests.values()].filter(
          (r) => r.userId === me || this.isOwnerOrDm(r.campaignId),
        ),
      ),
    );
  }

  resolveJoinRequest(campaignId: string, userId: string, approve: boolean) {
    if (!this.isOwnerOrDm(campaignId))
      return Promise.reject(new Error('Only the owner or DM can review requests'));
    const request = this.cloud.joinRequests.get(`${campaignId}|${userId}`);
    if (request?.status === (approve ? 'approved' : 'declined')) return Promise.resolve();
    if (!request || request.status !== 'pending')
      return Promise.reject(new Error('This request has already been reviewed'));
    request.status = approve ? 'approved' : 'declined';
    if (approve && !this.member(campaignId, userId))
      this.cloud.members.push({ campaignId, userId, role: 'player' });
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  revokeInvites(campaignId: string) {
    if (!this.isOwnerOrDm(campaignId))
      return Promise.reject(new Error('Only the owner or the DM can revoke invites'));
    for (const invite of this.cloud.invites)
      if (invite.campaignId === campaignId) invite.revoked = true;
    return Promise.resolve();
  }

  private invite(code: string) {
    this.require();
    const found = this.cloud.invites.find(
      (invite) => invite.code === code.trim().toUpperCase() && !invite.revoked && !invite.expired,
    );
    if (!found) throw new Error('This invite is not valid');
    return found;
  }

  previewInvite(code: string): Promise<InvitePreview> {
    try {
      const { campaignId } = this.invite(code);
      const campaign = this.cloud.shared.get(campaignId);
      const dm = this.cloud.members.find((m) => m.campaignId === campaignId && m.role === 'dm');
      const payload = campaign?.payload as { name?: string } | undefined;
      return Promise.resolve({
        campaignId,
        name: payload?.name ?? '',
        dmName: dm ? (this.cloud.names.get(dm.userId) ?? null) : null,
        hasDm: !!dm,
        memberCount: this.cloud.members.filter((m) => m.campaignId === campaignId).length,
        alreadyMember: !!this.member(campaignId),
      });
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
  }

  joinCampaign(code: string, role: 'dm' | 'player' = 'player') {
    try {
      const { campaignId } = this.invite(code);
      // Same order as the server: a taken DM seat refuses before membership changes.
      if (role === 'dm') this.seatFree(campaignId);
      if (!this.member(campaignId))
        this.cloud.members.push({ campaignId, userId: this.require().id, role: 'player' });
      if (role === 'dm') this.member(campaignId)!.role = 'dm';
      this.cloud.notifyParty();
      return Promise.resolve(campaignId);
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
  }

  /** Throws when someone else holds the DM seat. */
  private seatFree(campaignId: string) {
    const dm = this.cloud.members.find((m) => m.campaignId === campaignId && m.role === 'dm');
    if (dm && dm.userId !== this.require().id)
      throw new Error(
        `The DM seat is taken by ${this.cloud.names.get(dm.userId) ?? 'another member'}`,
      );
  }

  claimDm(campaignId: string) {
    try {
      const me = this.member(campaignId);
      if (!me) throw new Error('Join this campaign first');
      this.seatFree(campaignId);
      me.role = 'dm';
      this.cloud.notifyParty();
      return Promise.resolve();
    } catch (cause) {
      return Promise.reject(cause as Error);
    }
  }

  releaseDm(campaignId: string) {
    const me = this.member(campaignId);
    if (me?.role === 'dm') me.role = 'player';
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  leaveCampaign(campaignId: string) {
    const me = this.require().id;
    const at = this.cloud.members.findIndex((m) => m.campaignId === campaignId && m.userId === me);
    if (at >= 0) this.cloud.members.splice(at, 1);
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  removeMember(campaignId: string, userId: string) {
    if (userId === this.require().id)
      return Promise.reject(new Error('Use leave to leave a campaign'));
    if (!this.isOwnerOrDm(campaignId))
      return Promise.reject(new Error('Only the owner or the DM can remove members'));
    if (this.cloud.shared.get(campaignId)?.ownerId === userId)
      return Promise.reject(new Error('The owner cannot be removed'));
    const at = this.cloud.members.findIndex(
      (m) => m.campaignId === campaignId && m.userId === userId,
    );
    if (at >= 0) this.cloud.members.splice(at, 1);
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  setDm(campaignId: string, userId: string) {
    if (!this.isOwnerOrDm(campaignId))
      return Promise.reject(new Error('Only the owner or the DM can hand over the DM role'));
    const target = this.member(campaignId, userId);
    if (!target) return Promise.reject(new Error('That person is not in this campaign'));
    for (const m of this.cloud.members)
      if (m.campaignId === campaignId && m.role === 'dm') m.role = 'player';
    target.role = 'dm';
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  pullParty(): Promise<PartySnapshot> {
    const me = this.require().id;
    const mine = new Set(
      this.cloud.members.filter((m) => m.userId === me).map((m) => m.campaignId),
    );
    const members: RemoteMember[] = this.cloud.members
      .filter((m) => mine.has(m.campaignId))
      .map((m) => ({ ...m, name: this.cloud.names.get(m.userId) ?? '' }));
    return Promise.resolve(
      structuredClone({
        campaigns: [...this.cloud.shared.values()].filter((c) => mine.has(c.id)),
        members,
        entities: [...this.cloud.party.values()].filter((e) => mine.has(e.campaignId)),
      }),
    );
  }

  pushSharedCampaign(campaign: Parameters<SyncProvider['pushSharedCampaign']>[0]) {
    const current = this.cloud.shared.get(campaign.id);
    if (!current || !this.canEditCampaign(campaign.id))
      return Promise.reject(new Error('You cannot change this campaign'));
    this.cloud.shared.set(campaign.id, {
      ...current,
      revision: current.revision + 1,
      changedAt: campaign.changedAt,
      schemaVersion: campaign.schemaVersion,
      payload: structuredClone(campaign.payload),
    });
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  pushPartyEntity(entity: PartyPush) {
    const me = this.require().id;
    if (!this.member(entity.campaignId))
      return Promise.reject(new Error('You are not in this campaign'));
    const key = `${entity.campaignId}|${entity.entityId}`;
    const current = this.cloud.party.get(key);
    if (current && current.ownerId !== me)
      return Promise.reject(new Error('Only the owner can change this character'));
    this.cloud.party.set(key, {
      ...structuredClone(entity),
      ownerId: me,
      revision: (current?.revision ?? 0) + 1,
    });
    this.cloud.notifyParty();
    return Promise.resolve();
  }

  subscribeParty(onChange: () => void) {
    this.cloud.partyListeners.add(onChange);
    return () => void this.cloud.partyListeners.delete(onChange);
  }

  private require(): Account {
    if (!this.account) throw new Error('Not signed in');
    return this.account;
  }
}
