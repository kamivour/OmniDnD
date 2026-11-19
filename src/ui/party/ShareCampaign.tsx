import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from 'zustand';
import { Copy, Share2 } from 'lucide-react';
import { SCHEMA_VERSION, type Campaign } from '../../engine/schema';
import { keepOutOfSharing } from '../../engine/commands/party';
import { characterStore } from '../../state/character-store';
import { flushPersistence } from '../../state/persistence';
import { membersOf, usePartyState } from '../../state/party-store';
import { sharedPayload } from '../../sync/party';
import { autoSync, useAccountSession } from '../../sync/service';
import { useManagement } from '../commands/useManagement';
import { Sheet } from '../components/Sheet';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

const joinLink = (code: string) => `${window.location.origin}/join/${code}`;

/** The Share button on a campaign card: share the campaign, then hand out one invite link. */
export default function ShareCampaign({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Share campaign ${campaign.name}`}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-accent"
      >
        <Share2 size={16} aria-hidden />
        Share
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={`Share ${campaign.name}`}>
        {open && <SharePanel campaign={campaign} />}
      </Sheet>
    </>
  );
}

function SharePanel({ campaign }: { campaign: Campaign }) {
  const { provider, account, status } = useAccountSession();
  const party = usePartyState();
  const characters = useStore(characterStore, (s) => s.characters);
  const { run, pending, confirmation } = useManagement();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // Own player characters already in this campaign become visible to members once it is shared.
  const own = Object.values(characters).filter(
    (r) => r.build.campaignId === campaign.id && !r.build.partyOwner && r.build.playedBy !== 'dm',
  );
  const me = membersOf(party.members, campaign.id).find((m) => m.userId === account?.id);
  // Both the owner and current DM can invite.
  const manages = me?.role === 'dm' || party.owners[campaign.id] === account?.id;

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
    }
  };

  const share = () =>
    act(async () => {
      if (!provider) return;
      await provider.shareCampaign({
        id: campaign.id,
        role: campaign.role === 'dm' ? 'dm' : 'player',
        changedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        payload: sharedPayload(campaign),
      });
      // Sharing mirrors the cloud and is not an undoable game action.
      const state = characterStore.getState();
      const current = state.campaigns[campaign.id];
      if (current)
        characterStore.setState({
          campaigns: { ...state.campaigns, [campaign.id]: { ...current, shared: true } },
        });
      await flushPersistence();
    });

  const confirmShare = () => {
    const leaveOut = own.map((r) => r.build.id).filter((id) => hidden.has(id));
    if (leaveOut.length > 0) {
      const result = run(keepOutOfSharing, {
        campaignId: campaign.id,
        characterIds: leaveOut,
        privateId: `private-${crypto.randomUUID()}`,
      });
      if (result.result !== 'ok') return;
    }
    setPicking(false);
    void share();
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* The selectable link stays visible when clipboard access is unavailable. */
      setCopied(false);
    }
  };

  const inviteLink = () =>
    act(async () => {
      if (!provider) return;
      const fresh = code || (await provider.createInvite(campaign.id));
      setCode(fresh);
      setCopied(false);
      await copy(joinLink(fresh));
    });

  const body =
    status !== 'signed-in' ? (
      <p className="text-text-muted">
        Sign in to share this campaign with other players.{' '}
        <Link to="/profile" className="text-accent underline">
          Open Profile
        </Link>
      </p>
    ) : !campaign.shared ? (
      <>
        <p className="text-text-muted">
          Members see each other&apos;s characters but cannot change them. Only you and the DM can
          invite.
        </p>
        {picking ? (
          <fieldset
            id="share-characters"
            className="flex flex-col gap-2 rounded-btn border border-border p-3"
          >
            <legend className="px-1 font-semibold">Characters members will see</legend>
            <p className="text-xs text-text-muted">
              Untick any to keep private. They move to a private copy of this campaign with the same
              books and rules.
            </p>
            {own.map((r) => (
              <label key={r.build.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5 accent-(--omni-accent)"
                  checked={!hidden.has(r.build.id)}
                  onChange={(e) => {
                    const next = new Set(hidden);
                    if (e.target.checked) next.delete(r.build.id);
                    else next.add(r.build.id);
                    setHidden(next);
                  }}
                />
                <span className="wrap-anywhere">{r.build.name}</span>
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={button} onClick={() => setPicking(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={button}
                disabled={busy || pending}
                onClick={confirmShare}
              >
                <Share2 size={16} aria-hidden /> Share now
              </button>
            </div>
          </fieldset>
        ) : (
          <button
            type="button"
            onClick={() => (own.length > 0 ? setPicking(true) : void share())}
            disabled={busy}
            className={button}
          >
            <Share2 size={16} aria-hidden /> Share campaign
          </button>
        )}
      </>
    ) : (
      <>
        {manages ? (
          <>
            <p className="text-text-muted">
              An invite link lets a player join straight away. It works for 7 days.
            </p>
            {code ? (
              <div className="flex flex-col gap-2 rounded-btn border border-border bg-bg p-2">
                <p className="font-mono text-xs break-all" data-testid="invite-link">
                  {joinLink(code)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copy(joinLink(code))}
                    className={button}
                  >
                    <Copy size={16} aria-hidden /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={button}
                    onClick={() =>
                      act(async () => provider?.revokeInvites(campaign.id)).then(() => setCode(''))
                    }
                  >
                    Stop inviting
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void inviteLink()}
                disabled={busy}
                className={`${button} self-start`}
              >
                <Copy size={16} aria-hidden /> Copy invite link
              </button>
            )}
          </>
        ) : (
          <p className="text-text-muted">Only the owner or the DM can make invite links.</p>
        )}
        <p className="wrap-anywhere">
          Campaign ID: <code>{campaign.id}</code>
        </p>
        <p className="text-xs text-text-muted">
          Players can also ask to join with this ID. The owner or DM approves them under Campaign
          settings → Party.
        </p>
      </>
    );

  return (
    <div className="flex flex-col gap-3 text-sm" aria-busy={busy}>
      {body}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {confirmation}
    </div>
  );
}
