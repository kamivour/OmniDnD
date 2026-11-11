import { useEffect } from 'react';
import { useStore } from 'zustand';
import { X } from 'lucide-react';
import type { SyncConfig } from '../../sync/config';
import { startAccounts, useAccountSession } from '../../sync/service';
import { deviceStore } from '../../state/device-settings';
import AccountSection from './AccountSection';

/**
 * Sign-in card for the Campaigns page. Shows only while signed out and not dismissed;
 * the full account controls stay in Settings.
 */
export default function AccountCard({ config }: { config: SyncConfig }) {
  const { status } = useAccountSession();
  const hidden = useStore(deviceStore, (state) => state.accountCardHidden);
  useEffect(() => {
    void startAccounts(config);
  }, [config]);
  if (hidden || status !== 'signed-out') return null;
  return (
    <div
      data-tour="account-card"
      className="relative rounded-card border border-border bg-surface p-4"
    >
      <button
        type="button"
        aria-label="Hide sign-in card"
        onClick={() => deviceStore.getState().setAccountCardHidden(true)}
        className="absolute top-1 right-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-btn text-text-muted hover:bg-surface-2"
      >
        <X size={16} aria-hidden />
      </button>
      <AccountSection config={config} />
      <p className="mt-2 text-xs text-text-muted">
        Hide this card any time. You can still sign in from Settings.
      </p>
    </div>
  );
}
