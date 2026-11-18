import { useEffect } from 'react';
import type { SyncConfig } from '../../sync/config';
import { listenForSyncTriggers, startAccounts } from '../../sync/service';
import { NamePrompt } from './NamePrompt';

/** Keeps a signed-in account in step in the background, and asks for a missing display name. */
export default function SyncHost({ config }: { config: SyncConfig }) {
  useEffect(() => {
    void startAccounts(config);
    return listenForSyncTriggers();
  }, [config]);
  return <NamePrompt />;
}
