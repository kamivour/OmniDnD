import type {
  Account,
  PushEntity,
  PushResult,
  RemoteEntity,
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

  key(accountId: string, kind: string, entityId: string) {
    return `${accountId}|${kind}|${entityId}`;
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

  signUp(email: string, password: string): Promise<SignInResult> {
    const key = email.trim().toLowerCase();
    if (this.cloud.accounts.has(key))
      return Promise.resolve({ result: 'error', message: 'An account with this email exists.' });
    const account = { id: `user-${this.cloud.accounts.size + 1}`, email: key };
    this.cloud.accounts.set(key, { account, password });
    this.account = account;
    return Promise.resolve({ result: 'ok', account });
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
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40)
      return Promise.reject(new Error('Use 1 to 40 characters.'));
    this.cloud.names.set(this.require().id, trimmed);
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

  private require(): Account {
    if (!this.account) throw new Error('Not signed in');
    return this.account;
  }
}
