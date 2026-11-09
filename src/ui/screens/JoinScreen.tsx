import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { syncConfig } from '../../sync/config';
import type { InvitePreview } from '../../sync/provider';
import { autoSync, useAccountSession } from '../../sync/service';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Where an invite link lands: preview the campaign, then join. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { provider, status } = useAccountSession();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'signed-in' || !provider) return;
    let live = true;
    provider
      .previewInvite(code)
      .then((found) => live && setPreview(found))
      .catch(() => live && setError('This invite link is not valid or has expired.'));
    return () => {
      live = false;
    };
  }, [provider, status, code]);

  const join = async () => {
    if (!provider) return;
    setBusy(true);
    setError('');
    try {
      await provider.joinCampaign(code);
      await autoSync.syncNow();
      navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto flex min-w-0 max-w-md flex-col gap-4 text-sm">
      <h1 className="font-display text-xl">Join a campaign</h1>
      {!syncConfig ? (
        <p className="text-text-muted">Accounts are not turned on in this copy of the app.</p>
      ) : status === 'loading' ? (
        <p className="text-text-muted">Loading…</p>
      ) : status !== 'signed-in' ? (
        <p className="text-text-muted">
          Sign in first, then open this invite link again.{' '}
          <Link to="/settings" className="text-accent underline">
            Open Settings
          </Link>
        </p>
      ) : preview ? (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <p className="font-display text-lg wrap-anywhere">{preview.name}</p>
          <p className="text-text-muted">
            DM: {preview.dmName || 'none yet'} · {preview.memberCount} member
            {preview.memberCount === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-text-muted">
            Members see each other&apos;s characters but cannot change them. Your characters stay
            private until you add them to the campaign.
          </p>
          {preview.alreadyMember ? (
            <p>You are already in this campaign.</p>
          ) : (
            <button type="button" onClick={join} disabled={busy} className={button}>
              Join campaign
            </button>
          )}
          <Link to="/" className={button}>
            {preview.alreadyMember ? 'Back to campaigns' : 'Cancel'}
          </Link>
        </div>
      ) : (
        !error && <p className="text-text-muted">Checking invite…</p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
