import type { SyncKind } from '../db/sync-metadata';

export interface Account {
  id: string;
  email: string;
}

/** One campaign or character as the cloud stores it (`sync_entities`). */
export interface RemoteEntity {
  kind: SyncKind;
  entityId: string;
  /** Server-assigned; goes up by one on every accepted write. */
  revision: number;
  deleted: boolean;
  changedAt: string;
  schemaVersion: number;
  /** Campaign record, or `{ build, live, events }` for a character; null when deleted. */
  payload: unknown;
}

export interface PushEntity {
  kind: SyncKind;
  entityId: string;
  deleted: boolean;
  changedAt: string;
  schemaVersion: number;
  payload: unknown;
}

export type PushResult =
  | { result: 'ok'; revision: number }
  /** Someone else wrote first. `current` is the cloud row now, or null if it vanished. */
  | { result: 'conflict'; current: RemoteEntity | null };

export type SignInResult =
  | { result: 'ok'; account: Account }
  | { result: 'confirm-email' }
  | { result: 'error'; message: string };

/** Everything the app needs from a cloud backend. Supabase in production, a fake in tests. */
export interface SyncProvider extends PartyProvider {
  currentAccount(): Promise<Account | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /** `displayName` is reserved with the account when the server supports it. */
  signUp(email: string, password: string, displayName?: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** The signed-in account's display name, or null until one is chosen. */
  getDisplayName(): Promise<string | null>;
  /** Throws "That name is taken" when another account uses it, ignoring case. */
  setDisplayName(name: string): Promise<void>;
  /** Whether another account already uses this name; null when the server cannot tell yet. */
  displayNameAvailable(name: string): Promise<boolean | null>;
  /** Email a reset link that opens `redirectTo`. Never reveals whether the email has an account. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Set a new password for the signed-in account (also used after a reset link). */
  updatePassword(password: string): Promise<void>;
  /** Permanently remove the signed-in account and its cloud data, then sign out. */
  deleteAccount(): Promise<void>;
  /** Every row the signed-in account owns, deletion markers included. */
  pull(): Promise<RemoteEntity[]>;
  /**
   * Write one entity only if the cloud still has `expectedRevision`
   * (null: the row must not exist yet).
   */
  push(entity: PushEntity, expectedRevision: number | null): Promise<PushResult>;
}

/** A shared campaign as the cloud stores it (`shared_campaigns`). */
export interface RemoteSharedCampaign {
  id: string;
  ownerId: string;
  revision: number;
  changedAt: string;
  schemaVersion: number;
  payload: unknown;
}

export interface RemoteMember {
  campaignId: string;
  userId: string;
  role: 'dm' | 'player';
  /** Display name; empty when the member has not chosen one. */
  name: string;
}

/** One character in a shared campaign (`party_entities`). */
export interface RemotePartyEntity {
  campaignId: string;
  entityId: string;
  ownerId: string;
  revision: number;
  deleted: boolean;
  changedAt: string;
  schemaVersion: number;
  payload: unknown;
}

/** Everything the signed-in account may see across its shared campaigns. */
export interface PartySnapshot {
  campaigns: RemoteSharedCampaign[];
  members: RemoteMember[];
  entities: RemotePartyEntity[];
}

export interface InvitePreview {
  campaignId: string;
  name: string;
  dmName: string | null;
  /** True when someone holds the DM seat, even without a display name. */
  hasDm: boolean;
  memberCount: number;
  alreadyMember: boolean;
}

export interface PartyPush {
  campaignId: string;
  entityId: string;
  deleted: boolean;
  changedAt: string;
  schemaVersion: number;
  payload: unknown;
}

/** Shared-campaign calls (M24). Row-level security decides what each account may do. */
export interface PartyProvider {
  requestJoin(campaignId: string, characterId: string, characterName: string): Promise<void>;
  listJoinRequests(): Promise<JoinRequest[]>;
  resolveJoinRequest(campaignId: string, userId: string, approve: boolean): Promise<void>;
  /** Make a campaign shared; the caller becomes its owner and first member. */
  shareCampaign(campaign: {
    id: string;
    role: 'dm' | 'player';
    changedAt: string;
    schemaVersion: number;
    payload: unknown;
  }): Promise<void>;
  /** Owner or DM: a new join code (7 days). Older codes stop working. */
  createInvite(campaignId: string): Promise<string>;
  revokeInvites(campaignId: string): Promise<void>;
  previewInvite(code: string): Promise<InvitePreview>;
  /** Join with a seat; returns the campaign id. DM fails with a clear message once taken. */
  joinCampaign(code: string, role?: 'dm' | 'player'): Promise<string>;
  /** Take the empty DM seat in a campaign you belong to. */
  claimDm(campaignId: string): Promise<void>;
  /** Step down as DM; you stay as a player. */
  releaseDm(campaignId: string): Promise<void>;
  leaveCampaign(campaignId: string): Promise<void>;
  removeMember(campaignId: string, userId: string): Promise<void>;
  setDm(campaignId: string, userId: string): Promise<void>;
  pullParty(): Promise<PartySnapshot>;
  /** Write the campaign record (DM, or owner while nobody is DM). */
  pushSharedCampaign(campaign: {
    id: string;
    changedAt: string;
    schemaVersion: number;
    payload: unknown;
  }): Promise<void>;
  /** Write one of the caller's own characters. Last write wins: only its owner writes it. */
  pushPartyEntity(entity: PartyPush): Promise<void>;
  /** Call `onChange` when anything in the party changes. Returns the unsubscribe. */
  subscribeParty(onChange: () => void): () => void;
}

export interface JoinRequest {
  campaignId: string;
  userId: string;
  characterId: string;
  characterName: string;
  requesterName: string;
  status: 'pending' | 'approved' | 'declined';
}
