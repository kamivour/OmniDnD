import { useState } from 'react';
import { Link } from 'react-router';
import { useStore } from 'zustand';
import { Copy, Link2, LogOut, Share2, UserMinus, Crown } from 'lucide-react';
import type { Campaign } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { flushPersistence } from '../../state/persistence';
import { membersOf, usePartyState } from '../../state/party-store';
import { SCHEMA_VERSION } from '../../engine/schema';
import { sharedPayload } from '../../sync/party';
import { autoSync, useAccountSession } from '../../sync/service';
import { keepOutOfSharing } from '../../engine/commands/party';
import { useManagement } from '../commands/useManagement';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

const joinLink = (code: string) => `${window.location.origin}/join/${code}`;

/** Sharing, invite link and member list for one saved campaign. */
export function PartySection({ campaign }: { campaign: Campaign }) {
  const { provider, account, status } = useAccountSession();
  const party = usePartyState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState('');
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const characters = useStore(characterStore, (s) => s.characters);
  const { run, pending, confirmation } = useManagement();
  // Own player characters already in this campaign become visible to members once it is shared.
  const own = Object.values(characters).filter(
    (r) => r.build.campaignId === campaign.id && !r.build.partyOwner && r.build.playedBy !== 'dm',
  );
  const members = membersOf(party.members, campaign.id);
  const me = members.find((member) => member.userId === account?.id);
  const isDm = me?.role === 'dm';
  // Both the owner and current DM can invite and review join requests.
  const manages = isDm || party.owners[campaign.id] === account?.id;

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
      setConfirming('');
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

  const invite = () =>
    act(async () => {
      if (provider) {
        setCode(await provider.createInvite(campaign.id));
        setCopied(false);
      }
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink(code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = () =>
    act(async () => {
      if (!provider) return;
      const fresh = code || (await provider.createInvite(campaign.id));
      setCode(fresh);
      setCopied(false);
      try {
        await navigator.clipboard.writeText(joinLink(fresh));
        setCopied(true);
      } catch {
        /* The selectable link remains visible when clipboard access is unavailable. */
      }
    });

  return (
    <section
      id="party"
      aria-labelledby="campaign-party"
      aria-busy={busy}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 text-sm"
    >
      <h2 id="campaign-party" className="text-base font-semibold">
        Party
      </h2>
      {status !== 'signed-in' ? (
        <p className="text-text-muted">
          Sign in to share this campaign with other players.{' '}
          <Link to="/settings" className="text-accent underline">
            Open Settings
          </Link>
        </p>
      ) : !campaign.shared ? (
        <>
          <p className="text-text-muted">
            Share this campaign to invite players. Members see each other&apos;s characters but
            cannot change them. Only you and the DM can invite.
          </p>
          {picking ? (
            <fieldset
              id="share-characters"
              className="flex flex-col gap-2 rounded-btn border border-border p-3"
            >
              <legend className="px-1 font-semibold">Characters members will see</legend>
              <p className="text-xs text-text-muted">
                Untick any to keep private. They move to a private copy of this campaign with the
                same books and rules.
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
          <p className="wrap-anywhere">
            Campaign ID: <code>{campaign.id}</code>
          </p>
          <p className="text-xs text-text-muted">
            Share an invite for direct access, or give this ID to players so they can request
            approval.
          </p>
          <ul className="flex flex-col gap-2" aria-label="Members">
            {members.map((member) => {
              const self = member.userId === account?.id;
              const label = member.name || 'Unnamed player';
              return (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center gap-2 rounded-btn border border-border bg-bg p-2"
                >
                  <span className="min-w-0 basis-full wrap-anywhere sm:flex-1 sm:basis-0">
                    {label}
                    {self ? ' (you)' : ''}
                  </span>
                  <span className="rounded-btn bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                    {member.role === 'dm' ? 'DM' : 'Player'}
                  </span>
                  {manages && !self && member.role !== 'dm' && (
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      aria-label={`Make ${label} the DM`}
                      onClick={() =>
                        confirming === `dm:${member.userId}`
                          ? act(async () => provider?.setDm(campaign.id, member.userId))
                          : setConfirming(`dm:${member.userId}`)
                      }
                    >
                      <Crown size={16} aria-hidden />
                      {confirming === `dm:${member.userId}` ? 'Confirm hand over' : 'Make DM'}
                    </button>
                  )}
                  {isDm && !self && (
                    <button
                      type="button"
                      disabled={busy}
                      className={button}
                      aria-label={`Remove ${label}`}
                      onClick={() =>
                        confirming === `rm:${member.userId}`
                          ? act(async () => provider?.removeMember(campaign.id, member.userId))
                          : setConfirming(`rm:${member.userId}`)
                      }
                    >
                      <UserMinus size={16} aria-hidden />
                      {confirming === `rm:${member.userId}` ? 'Confirm remove' : 'Remove'}
                    </button>
                  )}
                </li>
              );
            })}
            {members.length === 0 && <li className="text-text-muted">Loading members…</li>}
          </ul>

          {manages && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={shareLink} disabled={busy} className={button}>
                  <Share2 size={16} aria-hidden /> Share campaign link
                </button>
                <button type="button" onClick={invite} disabled={busy} className={button}>
                  <Link2 size={16} aria-hidden /> {code ? 'New invite link' : 'Create invite link'}
                </button>
                {code && (
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
                )}
              </div>
              {code && (
                <div className="flex flex-col gap-1 rounded-btn border border-border bg-bg p-2">
                  <p className="text-xs text-text-muted">
                    Works for 7 days. A new link replaces this one.
                  </p>
                  <p className="font-mono text-xs break-all" data-testid="invite-link">
                    {joinLink(code)}
                  </p>
                  <button type="button" onClick={copy} className={button}>
                    <Copy size={16} aria-hidden /> {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              )}
            </div>
          )}

          {manages && (
            <section id="join-requests" aria-label="Join requests" className="flex flex-col gap-2">
              <h3 className="font-semibold">Join requests</h3>
              {party.requests
                .filter((r) => r.campaignId === campaign.id && r.status === 'pending')
                .map((r) => (
                  <article
                    key={r.userId}
                    className="flex flex-col gap-2 rounded-btn border border-border p-3"
                  >
                    <p className="wrap-anywhere">
                      {r.requesterName || 'Player'} · {r.characterName}
                    </p>
                    <p className="text-xs text-text-muted">
                      Approval grants party viewing access. The player chooses when to bring a
                      character copy.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          act(async () => provider?.resolveJoinRequest(campaign.id, r.userId, true))
                        }
                      >
                        Approve {r.requesterName || 'player'}
                      </button>
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() =>
                          act(async () =>
                            provider?.resolveJoinRequest(campaign.id, r.userId, false),
                          )
                        }
                      >
                        Decline {r.requesterName || 'player'}
                      </button>
                    </div>
                  </article>
                ))}
              {!party.requests.some(
                (r) => r.campaignId === campaign.id && r.status === 'pending',
              ) && <p className="text-text-muted">No pending requests.</p>}
            </section>
          )}

          <p className="text-xs text-text-muted">
            Leaving keeps your characters here as private copies. The party keeps seeing them,
            marked as left.
          </p>
          <button
            type="button"
            disabled={busy}
            className={button}
            onClick={() =>
              confirming === 'leave'
                ? act(async () => provider?.leaveCampaign(campaign.id))
                : setConfirming('leave')
            }
          >
            <LogOut size={16} aria-hidden />{' '}
            {confirming === 'leave' ? 'Confirm leave' : 'Leave campaign'}
          </button>
        </>
      )}
      {(error || party.error) && (
        <p role="alert" className="text-danger">
          {error || `Party sync problem: ${party.error}`}
        </p>
      )}
      {confirmation}
    </section>
  );
}
