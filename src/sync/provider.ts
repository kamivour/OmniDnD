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
  signUp(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** The signed-in account's display name, or null until one is chosen. */
  getDisplayName(): Promise<string | null>;
  setDisplayName(name: string): Promise<void>;
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
  /** Join as a player; returns the campaign id. */
  joinCampaign(code: string): Promise<string>;
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
