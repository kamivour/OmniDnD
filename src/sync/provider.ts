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
export interface SyncProvider {
  currentAccount(): Promise<Account | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signUp(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Every row the signed-in account owns, deletion markers included. */
  pull(): Promise<RemoteEntity[]>;
  /**
   * Write one entity only if the cloud still has `expectedRevision`
   * (null: the row must not exist yet).
   */
  push(entity: PushEntity, expectedRevision: number | null): Promise<PushResult>;
}
