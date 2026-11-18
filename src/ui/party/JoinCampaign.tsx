import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router';
import { Copy, MoveRight, UserPlus } from 'lucide-react';
import { useStore } from 'zustand';
import { syncConfig } from '../../sync/config';
import type { InvitePreview } from '../../sync/provider';
import { autoSync, useAccountSession } from '../../sync/service';
import { characterStore } from '../../state/character-store';
import { usePartyState } from '../../state/party-store';
import { copyToCampaign, moveToCampaign } from '../../engine/commands/party';
import { useManagement } from '../commands/useManagement';
import { Field, inputClass } from '../components/fields';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Invites grant membership; a campaign ID sends a request. A character copy is always explicit. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const location = useLocation();
  return <JoinCampaignForm key={`${code}:${location.search}`} code={code} />;
}

function JoinCampaignForm({ code }: { code: string }) {
  const [params] = useSearchParams();
  const { provider, status, account } = useAccountSession();
  const party = usePartyState();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [campaignId, setCampaignId] = useState(params.get('campaign') ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const target = preview?.campaignId ?? campaignId.trim();
  const member = party.members.some((m) => m.campaignId === target && m.userId === account?.id);
  const ready = useStore(characterStore, (s) => s.campaigns[target]?.shared === true);
  const requests = party.requests.filter((r) => r.userId === account?.id);

  useEffect(() => {
    if (status !== 'signed-in' || !provider) return;
    let live = true;
    void autoSync.syncNow();
    if (code)
      provider
        .previewInvite(code)
        .then((found) => live && setPreview(found))
        .catch(() => live && setError('This invite link is not valid or has expired.'));
    return () => {
      live = false;
    };
  }, [provider, status, code]);

  const act = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await autoSync.syncNow();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  const refresh = (
    <button type="button" className={button} disabled={busy} onClick={() => act(async () => {})}>
      Refresh membership
    </button>
  );
  return (
    <section id="join-campaign" className="mx-auto flex min-w-0 max-w-lg flex-col gap-4 text-sm">
      <h1 className="font-display text-xl">Join a campaign</h1>
      {!syncConfig ? (
        <p>Accounts are not turned on in this copy of the app.</p>
      ) : status === 'loading' ? (
        <p>Loading…</p>
      ) : status !== 'signed-in' ? (
        <p>
          Sign in first, then return to this page.{' '}
          <Link className="text-accent underline" to="/settings">
            Open Settings
          </Link>
        </p>
      ) : member && ready ? (
        <BringCharacter campaignId={target} />
      ) : member ? (
        <>
          <p role="status">You joined. Loading the campaign onto this device…</p>
          {refresh}
        </>
      ) : (
        <>
          <p className="text-text-muted">
            Members can view each other's characters. Only a character's owner can edit it. A
            campaign ID requires the owner or DM's approval. After joining, you choose which
            character to bring.
          </p>
          {code ? (
            preview ? (
              <div className="rounded-card border border-border bg-surface p-4">
                <h2 className="text-lg font-semibold wrap-anywhere">{preview.name}</h2>
                <p>
                  DM: {preview.dmName || 'none yet'} · {preview.memberCount} members
                </p>
                <p className="text-xs text-text-muted">This invite lets you join directly.</p>
              </div>
            ) : (
              !error && <p>Checking invite…</p>
            )
          ) : (
            <Field
              label="Campaign ID"
              htmlFor="join-id"
              hint="Ask the owner for the exact shared campaign ID."
            >
              <input
                id="join-id"
                className={inputClass}
                value={campaignId}
                maxLength={200}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setNotice('');
                }}
              />
            </Field>
          )}
          {code ? (
            preview && (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => act(async () => provider!.joinCampaign(code).then(() => undefined))}
              >
                Join campaign
              </button>
            )
          ) : (
            <button
              type="button"
              className={button}
              disabled={busy || !target}
              onClick={() =>
                act(async () => {
                  await provider!.requestJoin(target, '', 'Chooses after approval');
                  setNotice(
                    'Request sent. Once you are approved, open it here and choose which character to bring.',
                  );
                })
              }
            >
              Request to join
            </button>
          )}
          {refresh}
          {notice && <p role="status">{notice}</p>}
          {requests.length > 0 && (
            <section aria-label="Your join requests" className="flex flex-col gap-3">
              <h2 className="font-semibold">Your join requests</h2>
              {requests.map((r) => (
                <article key={r.campaignId} className="rounded-card border border-border p-3">
                  <p className="wrap-anywhere">
                    {r.campaignId} · {r.status}
                  </p>
                  {r.status === 'approved' && (
                    <Link
                      className={button}
                      to={`/join?campaign=${encodeURIComponent(r.campaignId)}`}
                    >
                      Use approved membership
                    </Link>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {party.error && (
        <p role="alert" className="text-danger">
          Party sync: {party.error}
        </p>
      )}
      <Link to="/" className={button}>
        Back to campaigns
      </Link>
    </section>
  );
}

/** Step 2: nothing joins the campaign until the player picks Copy, Move or a new character. */
function BringCharacter({ campaignId }: { campaignId: string }) {
  const navigate = useNavigate();
  const state = useStore(characterStore);
  const { run, pending, confirmation } = useManagement();
  const campaign = state.campaigns[campaignId]!;
  const partyPath = `/campaigns/${encodeURIComponent(campaignId)}/party`;
  const choices = Object.values(state.characters).filter(
    (r) => !r.build.partyOwner && r.build.playedBy !== 'dm' && r.build.campaignId !== campaignId,
  );
  const already = Object.values(state.characters).filter(
    (r) => !r.build.partyOwner && r.build.playedBy !== 'dm' && r.build.campaignId === campaignId,
  );
  return (
    <section
      id="bring-character"
      aria-labelledby="bring-character-title"
      className="flex flex-col gap-3"
    >
      <p role="status">
        You are a member of <span className="font-semibold wrap-anywhere">{campaign.name}</span>.
      </p>
      <h2 id="bring-character-title" className="text-base font-semibold">
        Bring a character
      </h2>
      <p className="text-text-muted">
        Copy leaves your original where it is. Move takes the character, with its history, out of
        its current campaign. Members see only what you bring.
      </p>
      {already.length > 0 && (
        <p className="text-text-muted">
          Already here: {already.map((r) => r.build.name).join(', ')}.
        </p>
      )}
      {choices.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Your characters">
          {choices.map((r) => {
            const name = r.build.name;
            return (
              <li key={r.build.id}>
                <article
                  aria-label={name}
                  className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3"
                >
                  <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                    <p className="font-semibold wrap-anywhere">{name}</p>
                    <p className="text-xs text-text-muted wrap-anywhere">
                      In {state.campaigns[r.build.campaignId]?.name ?? 'an unknown campaign'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={button}
                    disabled={pending}
                    aria-label={`Copy ${name}`}
                    onClick={() =>
                      run(
                        copyToCampaign,
                        { sourceId: r.build.id, id: crypto.randomUUID(), campaignId },
                        () => navigate(partyPath),
                      )
                    }
                  >
                    <Copy size={16} aria-hidden /> Copy
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={pending}
                    aria-label={`Move ${name}`}
                    onClick={() =>
                      run(moveToCampaign, { characterId: r.build.id, campaignId }, () =>
                        navigate(partyPath),
                      )
                    }
                  >
                    <MoveRight size={16} aria-hidden /> Move
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-card border border-border p-3 text-text-muted">
          No other characters on this device. If you made one on another device, sign in there with
          this account and let it sync, then refresh this page. Or create a new one here.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link className={button} to={`/campaigns/${encodeURIComponent(campaignId)}/characters/new`}>
          <UserPlus size={16} aria-hidden /> Create a new character here
        </Link>
        <Link className={button} to={partyPath}>
          Open party
        </Link>
      </div>
      {confirmation}
    </section>
  );
}
