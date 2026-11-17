import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router';
import { useStore } from 'zustand';
import { syncConfig } from '../../sync/config';
import type { InvitePreview } from '../../sync/provider';
import { autoSync, useAccountSession } from '../../sync/service';
import { characterStore } from '../../state/character-store';
import { usePartyState } from '../../state/party-store';
import { copyToCampaign } from '../../engine/commands/party';
import { useManagement } from '../commands/useManagement';
import { Field, inputClass } from '../components/fields';

const button =
  'inline-flex min-h-11 items-center justify-center rounded-btn border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Invites grant membership; a campaign ID sends a request. A character copy is always explicit. */
export function JoinScreen() {
  const { code = '' } = useParams();
  const location = useLocation();
  return <JoinCampaignForm key={`${code}:${location.search}`} code={code} />;
}

function JoinCampaignForm({ code }: { code: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { provider, status, account } = useAccountSession();
  const state = useStore(characterStore);
  const party = usePartyState();
  const { run, pending, confirmation } = useManagement();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [campaignId, setCampaignId] = useState(params.get('campaign') ?? '');
  const [characterId, setCharacterId] = useState(params.get('character') ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const target = preview?.campaignId ?? campaignId.trim();
  const member = party.members.some((m) => m.campaignId === target && m.userId === account?.id);
  const choices = Object.values(state.characters).filter(
    (r) => !r.build.partyOwner && r.build.playedBy !== 'dm' && r.build.campaignId !== target,
  );
  const selected = choices.find((r) => r.build.id === characterId);
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
  const bring = () => {
    if (!selected || !member) return;
    run(
      copyToCampaign,
      { sourceId: selected.build.id, id: crypto.randomUUID(), campaignId: target },
      () => navigate(`/campaigns/${encodeURIComponent(target)}/party`),
    );
  };
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
      ) : (
        <>
          <p className="text-text-muted">
            Members can view each other's characters. Only a character's owner can edit it. A
            campaign ID requires the owner or DM's approval.
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
          <Field
            label="Existing character"
            htmlFor="join-character"
            hint="Optional. A copy will join; your original stays in its current campaign."
          >
            <select
              id="join-character"
              className={inputClass}
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
            >
              <option value="">Join without a character</option>
              {choices.map((r) => (
                <option key={r.build.id} value={r.build.id}>
                  {r.build.name} · {state.campaigns[r.build.campaignId]?.name}
                </option>
              ))}
            </select>
          </Field>
          {member ? (
            <>
              <p>You are a member of this campaign.</p>
              {selected && (
                <button type="button" className={button} disabled={busy || pending} onClick={bring}>
                  Copy character into campaign
                </button>
              )}
              <Link className={button} to={`/campaigns/${encodeURIComponent(target)}/party`}>
                Open party
              </Link>
            </>
          ) : code ? (
            preview && (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await provider!.joinCampaign(code);
                    setNotice(
                      'Joined. Once membership finishes syncing, you can bring your character below.',
                    );
                  })
                }
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
                  await provider!.requestJoin(
                    target,
                    selected?.build.id ?? '',
                    selected?.build.name ?? 'No character selected',
                  );
                  setNotice(
                    'Request sent. Your character stays private until you are approved and choose to copy it.',
                  );
                })
              }
            >
              Request to join
            </button>
          )}
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => act(async () => {})}
          >
            Refresh membership
          </button>
          {notice && <p role="status">{notice}</p>}
          {requests.length > 0 && (
            <section aria-label="Your join requests" className="flex flex-col gap-3">
              <h2 className="font-semibold">Your join requests</h2>
              {requests.map((r) => (
                <article key={r.campaignId} className="rounded-card border border-border p-3">
                  <p className="wrap-anywhere">
                    {r.campaignId} · {r.characterName} · {r.status}
                  </p>
                  {r.status === 'approved' && (
                    <button
                      type="button"
                      className={button}
                      onClick={() => {
                        navigate(
                          `/join?campaign=${encodeURIComponent(r.campaignId)}&character=${encodeURIComponent(r.characterId)}`,
                        );
                      }}
                    >
                      Use approved membership
                    </button>
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
      {confirmation}
    </section>
  );
}
