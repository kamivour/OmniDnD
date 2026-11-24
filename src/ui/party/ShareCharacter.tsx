import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { Link } from 'react-router';
import { characterState, characterStore } from '../../state/character-store';
import {
  characterLinkSnapshot,
  characterLinkUrl,
  type CharacterLink,
  type CharacterLinkOwner,
} from '../../sync/character-links';
import { syncConfig } from '../../sync/config';
import { useAccountSession } from '../../sync/service';
import { Sheet } from '../components/Sheet';
import { cx } from '../cx';

const button =
  'min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-50';

export function ShareCharacter({
  id,
  name,
  compact = false,
}: {
  id: string;
  name: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { account, provider, status } = useAccountSession();
  if (!syncConfig) return null;
  return (
    <>
      <button
        ref={trigger}
        id={compact ? undefined : 'share-character'}
        type="button"
        aria-label={compact ? `Share ${name} character link` : undefined}
        onClick={() => setOpen(true)}
        className={cx(
          'inline-flex min-h-11 items-center justify-center gap-1 text-accent',
          compact ? 'text-xs' : 'rounded-btn border border-border px-3 text-sm',
        )}
      >
        <Link2 size={16} aria-hidden />
        {compact ? 'Share' : 'Share character'}
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Share character"
        description={name}
        className="sm:w-[min(30rem,calc(100vw-2rem))]!"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        {open && account && provider?.characterLinks ? (
          <CharacterLinkSettings key={account.id} id={id} owner={provider.characterLinks} />
        ) : status === 'loading' ? (
          <p role="status" className="text-sm text-text-muted">
            Checking your account…
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            Sign in to publish a view-only link.{' '}
            <Link to="/profile" onClick={() => setOpen(false)} className="text-accent underline">
              Open Profile
            </Link>
          </p>
        )}
      </Sheet>
    </>
  );
}

type LinkLoad =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; link: CharacterLink | null };

function CharacterLinkSettings({ id, owner }: { id: string; owner: CharacterLinkOwner }) {
  const [initial, setInitial] = useState<LinkLoad>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void owner
      .get(id)
      .then((link) => active && setInitial({ status: 'ready', link }))
      .catch(() => active && setInitial({ status: 'failed' }));
    return () => {
      active = false;
    };
  }, [id, owner, retry]);

  const change = async (action: 'publish' | 'revoke') => {
    setPending(true);
    setError('');
    setNotice('');
    try {
      if (action === 'revoke') {
        await owner.revoke(id);
        setInitial({ status: 'ready', link: null });
        setNotice('Link revoked.');
      } else {
        const state = characterState(characterStore.getState(), id);
        if (!state) throw new Error('The character is no longer in your workspace.');
        const snapshot = characterLinkSnapshot(state, new Date().toISOString());
        const link = await owner.publish(id, snapshot);
        setInitial({ status: 'ready', link });
        setNotice('Current copy published.');
      }
    } catch {
      setError('Could not change the link. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  if (initial.status === 'loading')
    return (
      <p role="status" className="text-sm text-text-muted">
        Checking the link…
      </p>
    );
  if (initial.status === 'failed')
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm text-warn">
          Could not check the link. Check your connection or ask the site owner whether character
          links are enabled.
        </p>
        <button
          type="button"
          className={button}
          onClick={() => {
            setInitial({ status: 'loading' });
            setRetry((count) => count + 1);
          }}
        >
          Retry
        </button>
      </div>
    );

  const link = initial.link;
  const url = link ? characterLinkUrl(link.token, location.origin) : undefined;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied.');
    } catch {
      setNotice('Select the link above to copy it.');
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <p className="text-text-muted">
        Anyone with the link can view a copy of the sheet, spells, inventory, features and
        companions. Publish again to share new changes.
      </p>
      {link && url && (
        <div className="grid gap-2 rounded-card border border-border bg-surface p-3">
          <p className="text-xs text-text-muted">
            Published {new Date(link.updatedAt).toLocaleString()}
          </p>
          <input
            aria-label="View-only link"
            className="min-h-11 w-full min-w-0 rounded-btn border border-border bg-bg px-2 text-xs"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" className={button} disabled={pending} onClick={() => void copy()}>
            Copy link
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={pending}
          onClick={() => void change('publish')}
        >
          {link ? 'Update shared copy' : 'Publish view-only link'}
        </button>
        {link && (
          <button
            type="button"
            className={`${button} text-danger`}
            disabled={pending}
            onClick={() => void change('revoke')}
          >
            Revoke link
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-warn">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-text-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
