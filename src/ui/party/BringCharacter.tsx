import { Link, useNavigate } from 'react-router';
import { Copy, MoveRight, UserPlus } from 'lucide-react';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { copyToCampaign, moveToCampaign } from '../../engine/commands/party';
import { useManagement } from '../commands/useManagement';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-40';

/**
 * Nothing joins a campaign until the player picks Copy, Move or a new character.
 * `inParty` drops the join wording when shown from the Party screen.
 */
export function BringCharacter({
  campaignId,
  inParty = false,
  onDone,
}: {
  campaignId: string;
  inParty?: boolean;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const state = useStore(characterStore);
  const { run, pending, confirmation } = useManagement();
  const campaign = state.campaigns[campaignId]!;
  const partyPath = `/campaigns/${encodeURIComponent(campaignId)}/party`;
  const done = () => (onDone ? onDone() : navigate(partyPath));
  const own = Object.values(state.characters).filter(
    (r) => !r.build.partyOwner && r.build.playedBy !== 'dm',
  );
  const choices = own.filter((r) => r.build.campaignId !== campaignId);
  const already = own.filter((r) => r.build.campaignId === campaignId);
  return (
    <section
      id={inParty ? undefined : 'bring-character'}
      aria-labelledby={inParty ? undefined : 'bring-character-title'}
      aria-label={inParty ? 'Add my character' : undefined}
      className="flex flex-col gap-3 text-sm"
    >
      {!inParty && (
        <>
          <p role="status">
            You are a member of <span className="font-semibold wrap-anywhere">{campaign.name}</span>
            .
          </p>
          <h2 id="bring-character-title" className="text-base font-semibold">
            Bring a character
          </h2>
        </>
      )}
      <p className="text-text-muted">
        Copy leaves your original where it is. Move takes the character, with its history, out of
        its current campaign.{campaign.shared ? ' Members see only what you bring.' : ''}
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
                        done,
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
                      run(moveToCampaign, { characterId: r.build.id, campaignId }, done)
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
        {!inParty && (
          <Link className={button} to={partyPath}>
            Open party
          </Link>
        )}
      </div>
      {confirmation}
    </section>
  );
}
