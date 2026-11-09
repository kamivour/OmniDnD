import { useSyncExternalStore } from 'react';
import { createStore } from 'zustand/vanilla';
import { characterStore } from '../state/character-store';
import { AutoSync, VISIBLE_MIN_AGE_MS, type AutoSyncState } from './auto-sync';
import type { SyncConfig } from './config';
import type { Account, SyncProvider } from './provider';
import { partyStore } from '../state/party-store';
import { runPartySync } from './party-runner';
import { runSync } from './runner';

/** The one background sync for this tab. Settings and the top bar both read it. */
export const autoSync = new AutoSync({
  run: async (provider, choices) => {
    const report = await runSync(provider, choices);
    // A party problem (for example the party tables are not set up yet) must not break account sync.
    try {
      await runPartySync(provider);
    } catch (cause) {
      partyStore.setState({ error: cause instanceof Error ? cause.message : String(cause) });
    }
    return report;
  },
  now: () => Date.now(),
  setTimer: (work, ms) => setTimeout(work, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  isOnline: () => navigator.onLine,
  // Several tabs share one device database; only one should sync at a time.
  withLock: (work) =>
    'locks' in navigator
      ? navigator.locks.request('omnidnd-sync', { ifAvailable: true }, (lock) =>
          lock ? work() : Promise.resolve(undefined),
        )
      : work(),
});

export type AccountStatus = 'loading' | 'unavailable' | 'signed-out' | 'signed-in';

export interface AccountSession {
  status: AccountStatus;
  provider: SyncProvider | null;
  account: Account | null;
  error: string;
}

export const accountSession = createStore<AccountSession>(() => ({
  status: 'loading',
  provider: null,
  account: null,
  error: '',
}));

/** Sign in or out of this tab's session; background sync follows. */
let stopParty: (() => void) | null = null;

export function setAccount(account: Account | null) {
  const { provider } = accountSession.getState();
  stopParty?.();
  stopParty = account && provider ? provider.subscribeParty(() => autoSync.wake()) : null;
  accountSession.setState({ account, status: account ? 'signed-in' : 'signed-out' });
  if (account && provider) autoSync.attach(provider);
  else autoSync.detach();
}

let starting: Promise<void> | null = null;

/** Load the cloud library once and restore any saved sign-in. Safe to call again. */
export function startAccounts(config: SyncConfig): Promise<void> {
  starting ??= (async () => {
    try {
      const { createSupabaseProvider } = await import('./supabase-provider');
      const provider = await createSupabaseProvider(config);
      const account = await provider.currentAccount();
      accountSession.setState({ provider, error: '' });
      setAccount(account);
    } catch (cause) {
      starting = null;
      accountSession.setState({
        status: 'unavailable',
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  })();
  return starting;
}

/** Wire edits, tab focus and the network to the background sync. Returns the cleanup. */
export function listenForSyncTriggers(): () => void {
  const watched = (state: ReturnType<typeof characterStore.getState>) =>
    [state.campaigns, state.characters, state.managementEvents] as const;
  let last = watched(characterStore.getState());
  const unsubscribe = characterStore.subscribe((state) => {
    const next = watched(state);
    if (next.every((value, index) => value === last[index])) return;
    last = next;
    autoSync.changed();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') autoSync.wake(VISIBLE_MIN_AGE_MS);
  };
  const onOnline = () => autoSync.wake();
  const onOffline = () => autoSync.wentOffline();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

export const useAutoSyncState = (): AutoSyncState =>
  useSyncExternalStore(autoSync.subscribe, autoSync.getState);

export const useAccountSession = (): AccountSession =>
  useSyncExternalStore(accountSession.subscribe, accountSession.getState);
