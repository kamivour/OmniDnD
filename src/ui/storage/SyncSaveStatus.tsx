import { useAccountSession, useAutoSyncState } from '../../sync/service';
import { saveStatusView } from './save-status';
import { SaveStatusLine, type SaveStatusLineProps } from './SaveStatusLine';

/** Account builds only: loaded lazily so guest builds never pull in the sync code. */
export default function SyncSaveStatus({
  saving,
  ...props
}: Omit<SaveStatusLineProps, 'view'> & { saving: boolean }) {
  const { status: account } = useAccountSession();
  const { status: sync, waiting } = useAutoSyncState();
  return <SaveStatusLine {...props} view={saveStatusView({ saving, account, sync, waiting })} />;
}
