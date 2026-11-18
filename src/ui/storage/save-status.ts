import type { SyncStatus } from '../../sync/auto-sync';

/** `none` means this copy of the app has no account server at all. */
export type SaveAccount = 'none' | 'loading' | 'unavailable' | 'signed-out' | 'signed-in';

export interface SaveStatusInput {
  /** Local writes still in flight. */
  saving: boolean;
  account: SaveAccount;
  sync: SyncStatus;
  /** Local changes not uploaded yet. */
  waiting: boolean;
}

export type SaveIcon = 'saved' | 'saving' | 'synced' | 'syncing' | 'offline' | 'alert' | 'device';

export interface SaveStatusView {
  label: string;
  icon: SaveIcon;
  tone: 'muted' | 'ok' | 'warn' | 'danger';
  /** Where the status links in Settings, with the visible link text. */
  action?: { anchor: 'sync-choices' | 'settings-account'; text: string };
  /** Shown in full on phones too, not as an icon only. */
  prominent: boolean;
}

const view = (
  label: string,
  icon: SaveIcon,
  tone: SaveStatusView['tone'] = 'muted',
  extra: Partial<SaveStatusView> = {},
): SaveStatusView => ({ label, icon, tone, prominent: false, ...extra });

/** One status for the local save and account sync, so a device never looks synced when it is not. */
export function saveStatusView({
  saving,
  account,
  sync,
  waiting,
}: SaveStatusInput): SaveStatusView {
  if (account === 'signed-in' && sync === 'needs-choice') {
    return view('Sync paused: choose versions', 'alert', 'danger', {
      action: { anchor: 'sync-choices', text: 'Choose' },
      prominent: true,
    });
  }
  if (saving) return view('Saving…', 'saving');
  switch (account) {
    case 'none':
    case 'loading':
      return view('Saved on this device', 'saved');
    case 'unavailable':
      return view('Account server unreachable: only on this device', 'offline', 'warn', {
        action: { anchor: 'settings-account', text: 'Details' },
      });
    case 'signed-out':
      return view('Not signed in: only on this device', 'device', 'muted', {
        action: { anchor: 'settings-account', text: 'Sign in' },
      });
    case 'signed-in':
      break;
  }
  switch (sync) {
    case 'syncing':
      return view('Syncing…', 'syncing');
    case 'offline':
      return view('Offline: saved on this device', 'offline');
    case 'error':
      return view('Sync problem: saved on this device', 'alert', 'warn', {
        action: { anchor: 'settings-account', text: 'Details' },
      });
    case 'signed-out':
      return view('Saved on this device', 'saved');
    default:
      return waiting
        ? view('Saved on this device, syncing soon', 'saving')
        : view('Synced', 'synced', 'ok');
  }
}
