import { useState } from 'react';
import { Crown } from 'lucide-react';
import { dmLabel, membersOf, usePartyState } from '../../state/party-store';
import { autoSync, useAccountSession } from '../../sync/service';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/**
 * Who holds the DM seat, with Take seat when it is empty and Step down for the DM.
 * Changing the seat is a membership change on the server, not an undoable game action.
 */
export function DmSeat({ campaignId }: { campaignId: string }) {
  const { provider, account } = useAccountSession();
  const { members } = usePartyState();
  const label = dmLabel(members, campaignId);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  if (!label) return null;
  const here = membersOf(members, campaignId);
  const me = here.find((member) => member.userId === account?.id);
  const empty = !here.some((member) => member.role === 'dm');
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await autoSync.syncNow();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <div
      id="dm-seat"
      className="flex flex-wrap items-center gap-2 text-sm"
      aria-label="DM seat"
      role="group"
    >
      <span className="inline-flex items-center gap-1 wrap-anywhere">
        <Crown size={16} aria-hidden className="text-accent" />
        {label}
        {me?.role === 'dm' ? ' (you)' : ''}
      </span>
      {provider && me && empty && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => act(() => provider.claimDm(campaignId))}
        >
          Take DM seat
        </button>
      )}
      {provider && me?.role === 'dm' && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() =>
            confirming ? act(() => provider.releaseDm(campaignId)) : setConfirming(true)
          }
        >
          {confirming ? 'Confirm step down' : 'Step down as DM'}
        </button>
      )}
      {error && (
        <p role="alert" className="basis-full text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
