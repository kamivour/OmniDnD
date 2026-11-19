import { lazy, Suspense, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Link } from 'react-router';
import { Copy, Download, MoveRight, Plus, Settings2, Trash2, Undo2, Users } from 'lucide-react';
import { registry } from '../../data/registry';
import { freshSampleFile } from '../../data/seed';
import { computeSheet } from '../../engine/calc/sheet';
import {
  deleteCampaign,
  deleteCharacter,
  duplicateCharacter,
  importCharacter,
} from '../../engine/commands/management';
import { copyToCampaign, moveToCampaign } from '../../engine/commands/party';
import type { Campaign } from '../../engine/schema';
import { characterState, characterStore, type CharacterRecord } from '../../state/character-store';
import { HpBar } from '../components/HpBar';
import { CharacterPortrait } from '../components/CharacterPortrait';
import { Sheet } from '../components/Sheet';
import { SectionLabel } from '../components/SectionLabel';
import { OverrideMarker } from '../components/StatChip';
import { inputClass } from '../components/fields';
import { useCharacterTransfer } from '../commands/useCharacterTransfer';
import { useManagement } from '../commands/useManagement';
import { useTourAutostart } from '../tutorial/useTour';
import { rulesSummary } from '../campaignOptions';
import { syncConfig } from '../../sync/config';
import { dmLabel, usePartyState } from '../../state/party-store';

const button =
  'hover-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-3 text-sm text-text disabled:opacity-40';
// Replaced at build time: guest builds drop the account code entirely.
const AccountCard = import.meta.env.VITE_SUPABASE_URL
  ? lazy(() => import('../settings/AccountCard'))
  : null;
const ShareCampaign = import.meta.env.VITE_SUPABASE_URL
  ? lazy(() => import('../party/ShareCampaign'))
  : null;

const path = (id: string) => encodeURIComponent(id);
/** Your own player characters can be copied or moved into other campaigns. */
const movable = (record: CharacterRecord) =>
  !record.build.partyOwner && record.build.playedBy !== 'dm';

/** The landing page reads the same saved characters as the HUD. */
export function CampaignsScreen() {
  useTourAutostart('welcome');
  const state = useStore(characterStore);
  const management = useManagement();
  const { run, undo, confirmation, pending } = management;
  // Home keeps per-character Export; importing a character file lives in Settings.
  const { exportCharacter, exportControls } = useCharacterTransfer(management);
  const opener = useRef<HTMLElement | null>(null);
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    const target =
      opener.current?.isConnected && opener.current.getClientRects().length
        ? opener.current
        : document.getElementById('hub-workspace');
    target?.focus();
  };
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState('');
  const [name, setName] = useState('');
  const [copyTarget, setCopyTarget] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<string | null>(null);
  const doomed = deletingCampaign ? state.campaigns[deletingCampaign] : undefined;
  const doomedCount = Object.values(state.characters).filter(
    (record) => record.build.campaignId === deletingCampaign,
  ).length;
  const campaigns = Object.values(state.campaigns);
  const duplicateRecord = duplicate ? state.characters[duplicate] : undefined;
  const moveChoices = campaigns.filter(
    (campaign) => moving && campaign.id !== state.characters[moving]?.build.campaignId,
  );
  const last = state.managementEvents.findLast(
    (event) => event.command !== 'undo' && !event.undoneBy,
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 data-tour="campaigns" className="font-display text-xl">
          Campaigns
        </h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!last || pending}
            onClick={() => undo()}
            title={last?.text}
            className={button}
          >
            <Undo2 size={16} aria-hidden />
            Undo management
          </button>
          <Link to="/campaigns/new" data-tour="new-campaign" className={button}>
            <Plus size={16} aria-hidden />
            New campaign
          </Link>
          <Link to="/join" className={button}>
            Join a campaign
          </Link>
        </div>
      </header>
      {AccountCard && syncConfig && (
        <Suspense fallback={null}>
          <AccountCard config={syncConfig} />
        </Suspense>
      )}
      {state.managementEvents.length > 0 && (
        <p aria-label="Recent management change" className="text-xs text-text-muted">
          {state.managementEvents.at(-1)?.text}
        </p>
      )}
      {Object.values(state.campaigns).length === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-text-muted">
            No campaigns yet. Create a campaign or import a character.
          </p>
          <button
            type="button"
            disabled={pending}
            className={button}
            onClick={() => run(importCharacter, { file: freshSampleFile() })}
          >
            Try the sample character
          </button>
        </div>
      )}
      {Object.values(state.campaigns).map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          characters={Object.values(state.characters).filter(
            (record) => record.build.campaignId === campaign.id,
          )}
          pending={pending}
          onDuplicate={(id) => {
            opener.current = document.activeElement as HTMLElement;
            setDuplicate(id);
            setDuplicateId(crypto.randomUUID());
            setName(`${state.characters[id]!.build.name} (copy)`);
            setCopyTarget(campaign.id);
          }}
          onMove={(id) => {
            opener.current = document.activeElement as HTMLElement;
            setMoving(id);
            setMoveTarget(campaigns.find((other) => other.id !== campaign.id)?.id ?? '');
          }}
          onDelete={(id) => {
            opener.current = document.activeElement as HTMLElement;
            setDeleting(id);
          }}
          onExport={exportCharacter}
          onDeleteCampaign={() => {
            opener.current = document.activeElement as HTMLElement;
            setDeletingCampaign(campaign.id);
          }}
        />
      ))}

      <Sheet
        open={duplicate !== null}
        onOpenChange={(open) => !open && setDuplicate(null)}
        title="Copy character"
        onCloseAutoFocus={restoreFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!duplicateRecord) return;
            const close = () => setDuplicate(null);
            if (copyTarget === duplicateRecord.build.campaignId)
              run(
                duplicateCharacter,
                { sourceId: duplicateRecord.build.id, id: duplicateId, name: name.trim() },
                close,
              );
            else
              run(
                copyToCampaign,
                {
                  sourceId: duplicateRecord.build.id,
                  id: duplicateId,
                  campaignId: copyTarget,
                  name: name.trim(),
                },
                close,
              );
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-2">
            Copy name
            <input
              aria-label="Copy name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
          {duplicateRecord && movable(duplicateRecord) && (
            <label className="flex flex-col gap-2">
              Copy into campaign
              <select
                aria-label="Copy into campaign"
                value={copyTarget}
                onChange={(event) => setCopyTarget(event.target.value)}
                className={inputClass}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                    {campaign.id === duplicateRecord.build.campaignId ? ' (same campaign)' : ''}
                    {campaign.shared ? ' · shared' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-sm text-text-muted">
            Copies choices and current values. The copy starts with a new game-action history.
          </p>
          <button type="submit" disabled={pending || !name.trim()} className={`${button} w-full`}>
            Create copy
          </button>
        </form>
      </Sheet>
      <Sheet
        open={moving !== null}
        onOpenChange={(open) => !open && setMoving(null)}
        title="Move character"
        onCloseAutoFocus={restoreFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (moving && moveTarget)
              run(moveToCampaign, { characterId: moving, campaignId: moveTarget }, () =>
                setMoving(null),
              );
          }}
          className="flex flex-col gap-3"
        >
          {moveChoices.length > 0 ? (
            <label className="flex flex-col gap-2">
              Move to campaign
              <select
                aria-label="Move to campaign"
                value={moveTarget}
                onChange={(event) => setMoveTarget(event.target.value)}
                className={inputClass}
              >
                {moveChoices.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                    {campaign.shared ? ' · shared' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-text-muted">Create or join another campaign first.</p>
          )}
          <p className="text-sm text-text-muted">
            The character keeps its history. Members of a shared campaign see it only while it is
            there.
          </p>
          <button type="submit" disabled={pending || !moveTarget} className={`${button} w-full`}>
            Move
          </button>
        </form>
      </Sheet>
      <Sheet
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete character?"
        onCloseAutoFocus={restoreFocus}
      >
        <p className="mb-4 text-sm">
          Delete {deleting ? state.characters[deleting]?.build.name : 'this character'} from this
          browser? Undo management can restore the character and its saved history.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setDeleting(null)} className={button}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              deleting && run(deleteCharacter, { characterId: deleting }, () => setDeleting(null))
            }
            className={`${button} text-danger`}
          >
            Delete character
          </button>
        </div>
      </Sheet>
      <Sheet
        open={deletingCampaign !== null}
        onOpenChange={(open) => !open && setDeletingCampaign(null)}
        title="Delete campaign?"
        onCloseAutoFocus={restoreFocus}
      >
        {doomed?.shared ? (
          <p className="mb-4 text-sm">
            {doomed.name} is shared with a party. Leave the party or stop sharing in Party before
            deleting it.
          </p>
        ) : (
          <p className="mb-4 text-sm">
            Delete {doomed?.name ?? 'this campaign'}
            {doomedCount > 0
              ? ` and its ${doomedCount} character${doomedCount === 1 ? '' : 's'}`
              : ''}{' '}
            from this browser? Export any character you want to keep. Undo management can restore
            everything.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setDeletingCampaign(null)} className={button}>
            Cancel
          </button>
          {!doomed?.shared && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                deletingCampaign &&
                run(deleteCampaign, { campaignId: deletingCampaign }, () =>
                  setDeletingCampaign(null),
                )
              }
              className={`${button} text-danger`}
            >
              Delete campaign
            </button>
          )}
        </div>
      </Sheet>
      {exportControls}
      {confirmation}
    </section>
  );
}

function CampaignCard({
  campaign,
  characters,
  pending,
  onDuplicate,
  onMove,
  onDelete,
  onExport,
  onDeleteCampaign,
}: {
  campaign: Campaign;
  characters: CharacterRecord[];
  pending: boolean;
  onDuplicate: (id: string) => void;
  onMove: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onDeleteCampaign: () => void;
}) {
  const headingId = `campaign-${path(campaign.id)}`;
  return (
    <article aria-labelledby={headingId} className="rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border p-4">
        <div className="min-w-0 grow basis-60">
          <h2 id={headingId} className="font-display text-lg">
            {campaign.name}
            {campaign.shared && (
              <span className="ml-2 rounded-btn bg-surface-2 px-2 py-0.5 align-middle font-sans text-xs text-text-muted">
                Shared
              </span>
            )}
          </h2>
          <p className="text-xs text-text-muted">{rulesSummary(campaign)}</p>
          {campaign.shared && <DmLine campaignId={campaign.id} />}
        </div>
        {campaign.shared && (
          <Link
            to={`/campaigns/${path(campaign.id)}/party`}
            className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-accent"
          >
            <Users size={16} aria-hidden />
            Party
          </Link>
        )}
        <Link
          to={`/campaigns/${path(campaign.id)}/settings`}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-accent"
        >
          <Settings2 size={16} aria-hidden />
          Campaign settings
        </Link>
        {ShareCampaign && syncConfig && (
          <Suspense fallback={null}>
            <ShareCampaign campaign={campaign} />
          </Suspense>
        )}
        <button
          type="button"
          aria-label={`Delete campaign ${campaign.name}`}
          disabled={pending}
          onClick={onDeleteCampaign}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-danger disabled:opacity-40"
        >
          <Trash2 size={16} aria-hidden />
          Delete
        </button>
      </header>
      <div className="flex flex-col gap-2 p-4">
        <SectionLabel as="h3">Characters</SectionLabel>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((record) => {
            const state = characterState(
              { characters: { [record.build.id]: record }, campaigns: { [campaign.id]: campaign } },
              record.build.id,
            )!;
            const sheet = computeSheet(state, registry);
            const line = `${registry.get('race', record.build.subraceId ?? record.build.raceId).name} · ${record.build.classes.map((entry) => `${registry.get('class', entry.classId).name} ${entry.level}`).join(' / ')}`;
            return (
              <li key={record.build.id}>
                <article
                  aria-label={record.build.name}
                  className="rounded-card border border-border bg-surface-2"
                >
                  <Link
                    to={`/characters/${path(record.build.id)}`}
                    className="hover-lift flex min-h-24 items-center gap-3 rounded-card p-3"
                  >
                    <CharacterPortrait
                      id={record.build.id}
                      portrait={record.build.portrait}
                      classId={record.build.classes[0]?.classId}
                      size={40}
                      className="text-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base">
                        {record.build.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">{line}</span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="text-text-muted">HP</span>
                        {record.live.hp}/{sheet.maxHp.value}
                        <OverrideMarker override={sheet.maxHp.override} />
                        <HpBar current={record.live.hp} max={sheet.maxHp.value} className="w-16" />
                      </span>
                    </span>
                  </Link>
                  <div
                    className={`grid ${movable(record) ? 'grid-cols-4' : 'grid-cols-3'} border-t border-border px-1`}
                  >
                    <button
                      type="button"
                      aria-label={`Duplicate ${record.build.name}`}
                      disabled={pending}
                      onClick={() => onDuplicate(record.build.id)}
                      className="flex min-h-11 items-center justify-center gap-1 text-xs text-accent"
                    >
                      <Copy size={14} aria-hidden />
                      Copy
                    </button>
                    {movable(record) && (
                      <button
                        type="button"
                        aria-label={`Move ${record.build.name}`}
                        disabled={pending}
                        onClick={() => onMove(record.build.id)}
                        className="flex min-h-11 items-center justify-center gap-1 text-xs text-accent"
                      >
                        <MoveRight size={14} aria-hidden />
                        Move
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Export ${record.build.name}`}
                      onClick={() => onExport(record.build.id)}
                      className="flex min-h-11 items-center justify-center gap-1 text-xs text-text-muted"
                    >
                      <Download size={14} aria-hidden />
                      Export
                    </button>
                    {record.build.partyOwner ? (
                      <span className="flex min-h-11 items-center justify-center text-xs text-text-muted">
                        {record.build.partyOwner.name || 'Party'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${record.build.name}`}
                        disabled={pending}
                        onClick={() => onDelete(record.build.id)}
                        className="flex min-h-11 items-center justify-center gap-1 text-xs text-danger"
                      >
                        <Trash2 size={14} aria-hidden />
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
          <li>
            <Link
              to={`/campaigns/${path(campaign.id)}/characters/new`}
              data-tour="new-character"
              className="flex h-full min-h-16 items-center justify-center gap-2 rounded-card border border-dashed border-border p-3 text-text-muted hover:border-accent hover:text-text"
            >
              <Plus size={16} aria-hidden />
              New character
            </Link>
          </li>
        </ul>
      </div>
    </article>
  );
}

/** "DM: name" or "DM seat: empty" once party members have loaded. */
function DmLine({ campaignId }: { campaignId: string }) {
  const label = dmLabel(usePartyState().members, campaignId);
  return label ? <p className="text-xs text-text-muted wrap-anywhere">{label}</p> : null;
}
