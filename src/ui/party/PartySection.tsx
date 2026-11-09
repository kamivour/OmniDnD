import { useState } from 'react';
import { Link } from 'react-router';
import { Copy, Link2, LogOut, Share2, UserMinus, Crown } from 'lucide-react';
import type { Campaign } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { flushPersistence } from '../../state/persistence';
import { membersOf, usePartyState } from '../../state/party-store';
import { SCHEMA_VERSION } from '../../engine/schema';
import { sharedPayload } from '../../sync/party';
import { autoSync, useAccountSession } from '../../sync/service';

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
  const members = membersOf(party.members, campaign.id);
  const me = members.find((member) => member.userId === account?.id);
  const isDm = me?.role === 'dm';
  const hasDm = members.some((member) => member.role === 'dm');
  // The owner can invite while nobody is DM; the cloud checks this too.
  const manages = isDm || (!hasDm && !!me);

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

  const invite = () =>
    act(async () => {
      if (provider) setCode(await provider.createInvite(campaign.id));
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink(code));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

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
          <button type="button" onClick={share} disabled={busy} className={button}>
            <Share2 size={16} aria-hidden /> Share campaign
          </button>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label="Members">
            {members.map((member) => {
              const self = member.userId === account?.id;
              const label = member.name || 'Unnamed player';
              return (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center gap-2 rounded-btn border border-border bg-bg p-2"
                >
                  <span className="min-w-0 flex-1 wrap-anywhere">
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
    </section>
  );
}
