import { useState } from 'react';
import { Link } from 'react-router';
import { LogOut, UserMinus, Crown } from 'lucide-react';
import type { Campaign } from '../../engine/schema';
import { membersOf, usePartyState } from '../../state/party-store';
import { autoSync, useAccountSession } from '../../sync/service';
import { DmSeat } from './DmSeat';
import { Avatar } from '../components/Avatar';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Member list, DM seat and join requests for one shared campaign. Sharing and invites live on the campaign card. */
export function PartySection({ campaign }: { campaign: Campaign }) {
  const { provider, account, status } = useAccountSession();
  const party = usePartyState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');
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
          <Link to="/profile" className="text-accent underline">
            Open Profile
          </Link>
        </p>
      ) : !campaign.shared ? (
        <p className="text-text-muted">
          Not shared yet. Use Share on this campaign&apos;s card in Campaigns to invite players.
        </p>
      ) : (
        <>
          <p className="wrap-anywhere">
            Campaign ID: <code>{campaign.id}</code>
          </p>
          <p className="text-xs text-text-muted">
            Players can ask to join with this ID. Invite links are under Share on the campaign card.
          </p>
          <DmSeat campaignId={campaign.id} />
          <ul className="flex flex-col gap-2" aria-label="Members">
            {members.map((member) => {
              const self = member.userId === account?.id;
              const label = member.name || 'Unnamed player';
              return (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center gap-2 rounded-btn border border-border bg-bg p-2"
                >
                  <span className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-0">
                    <Avatar avatar={member.avatar} size={28} />
                    <span className="min-w-0 wrap-anywhere">
                      {label}
                      {self ? ' (you)' : ''}
                    </span>
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
    </section>
  );
}
