import { useEffect } from 'react';
import type { SyncConfig } from '../../sync/config';
import { listenForSyncTriggers, startAccounts } from '../../sync/service';

/** Keeps a signed-in account in step in the background. Renders nothing. */
export default function SyncHost({ config }: { config: SyncConfig }) {
  useEffect(() => {
    void startAccounts(config);
    return listenForSyncTriggers();
  }, [config]);
  return null;
}
