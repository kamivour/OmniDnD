import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { ZodError } from 'zod';
import { Link } from 'react-router';
import { Copy, Download, Plus, Settings2, Trash2, Undo2, Upload } from 'lucide-react';
import { registry } from '../../data/registry';
import { characterExport, prepareCharacterImport } from '../../data/character-files';
import { computeSheet } from '../../engine/calc/sheet';
import {
  addCharacter,
  deleteCharacter,
  duplicateCharacter,
} from '../../engine/commands/management';
import type { Campaign, ExportFile } from '../../engine/schema';
import { characterState, characterStore, type CharacterRecord } from '../../state/character-store';
import { HpBar } from '../components/HpBar';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { SectionLabel } from '../components/SectionLabel';
import { inputClass } from '../components/fields';
import { useToast } from '../components/toast-context';
import { useManagement } from '../commands/useManagement';
import { rulesSummary } from '../campaignOptions';

const button =
  'hover-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-3 text-sm text-text disabled:opacity-40';
const path = (id: string) => encodeURIComponent(id);

/** The landing page reads the same saved characters as the HUD. */
export function CampaignsScreen() {
  const state = useStore(characterStore);
  const { run, undo, confirmation, pending } = useManagement();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ file: ExportFile; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = state.managementEvents.findLast(
    (event) => event.command !== 'undo' && !event.undoneBy,
  );

  const exportFile = (id: string) => {
    try {
      const file = characterExport(characterStore.getState(), id, new Date().toISOString());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const download = document.createElement('a');
      download.href = url;
      download.download = `${file.build.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'character'}.json`;
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      toast({ text: cause instanceof Error ? cause.message : 'Export failed' });
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl">Campaigns</h1>
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
          <button
            type="button"
            onClick={(event) => {
              opener.current = event.currentTarget;
              input.current?.click();
            }}
            disabled={pending}
            className={button}
          >
            <Upload size={16} aria-hidden />
            Import
          </button>
          <Link to="/campaigns/new" className={button}>
            <Plus size={16} aria-hidden />
            New campaign
          </Link>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Import character JSON"
          className="hidden"
          onChange={async (event) => {
            const selected = event.target.files?.[0];
            event.target.value = '';
            if (!selected) return;
            setError(null);
            try {
              setImporting(
                prepareCharacterImport(
                  JSON.parse(await selected.text()),
                  characterStore.getState(),
                  () => crypto.randomUUID(),
                ),
              );
            } catch (cause) {
              setError(
                cause instanceof ZodError
                  ? 'This file is not a supported OmniDnD character export for D&D 5e (2014).'
                  : cause instanceof Error
                    ? cause.message
                    : 'This file could not be imported.',
              );
            }
          }}
        />
      </header>
      {error && (
        <p role="alert" className="rounded-card border border-warn p-3 text-sm text-warn">
          Import failed: {error}
        </p>
      )}
      {state.managementEvents.length > 0 && (
        <p aria-label="Recent management change" className="text-xs text-text-muted">
          {state.managementEvents.at(-1)?.text}
        </p>
      )}
      {Object.values(state.campaigns).length === 0 && (
        <p className="text-text-muted">
          No campaigns yet. Create a campaign or import a character.
        </p>
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
          }}
          onDelete={(id) => {
            opener.current = document.activeElement as HTMLElement;
            setDeleting(id);
          }}
          onExport={exportFile}
        />
      ))}

      <Sheet
        open={duplicate !== null}
        onOpenChange={(open) => !open && setDuplicate(null)}
        title="Duplicate character"
        onCloseAutoFocus={restoreFocus}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (duplicate)
              run(
                duplicateCharacter,
                { sourceId: duplicate, id: duplicateId, name: name.trim() },
                () => setDuplicate(null),
              );
          }}
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
          <p className="my-3 text-sm text-text-muted">
            Copies choices and current values. The copy starts with a new game-action history.
          </p>
          <button type="submit" disabled={pending || !name.trim()} className={`${button} w-full`}>
            Create copy
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
        open={importing !== null}
        onOpenChange={(open) => !open && setImporting(null)}
        title="Import character"
        onCloseAutoFocus={restoreFocus}
      >
        {importing && (
          <>
            <p className="font-semibold">{importing.file.build.name}</p>
            <p className="mb-3 text-sm text-text-muted">
              {importing.file.campaign.name} · HP {importing.file.live.hp}/
              {
                computeSheet(
                  {
                    campaign: importing.file.campaign,
                    build: importing.file.build,
                    live: importing.file.live,
                  },
                  registry,
                ).maxHp.value
              }
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-warn">
              {importing.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="mb-4 text-sm text-text-muted">
              Existing characters and campaign rules remain saved.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(addCharacter, { file: importing.file }, () => setImporting(null))}
              className={`${button} w-full`}
            >
              Add character
            </button>
          </>
        )}
      </Sheet>
      {confirmation}
    </section>
  );
}

function CampaignCard({
  campaign,
  characters,
  pending,
  onDuplicate,
  onDelete,
  onExport,
}: {
  campaign: Campaign;
  characters: CharacterRecord[];
  pending: boolean;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}) {
  const headingId = `campaign-${path(campaign.id)}`;
  return (
    <article aria-labelledby={headingId} className="rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-lg">
            {campaign.name}
          </h2>
          <p className="text-xs text-text-muted">{rulesSummary(campaign)}</p>
        </div>
        <Link
          to={`/campaigns/${path(campaign.id)}/settings`}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-accent"
        >
          <Settings2 size={16} aria-hidden />
          Campaign settings
        </Link>
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
                    <Icon id={`character.${record.build.id}`} size={40} className="text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base">
                        {record.build.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">{line}</span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="text-text-muted">HP</span>
                        {record.live.hp}/{sheet.maxHp.value}
                        <HpBar current={record.live.hp} max={sheet.maxHp.value} className="w-16" />
                      </span>
                    </span>
                  </Link>
                  <div className="grid grid-cols-3 border-t border-border px-1">
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
                    <button
                      type="button"
                      aria-label={`Export ${record.build.name}`}
                      onClick={() => onExport(record.build.id)}
                      className="flex min-h-11 items-center justify-center gap-1 text-xs text-text-muted"
                    >
                      <Download size={14} aria-hidden />
                      Export
                    </button>
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
                  </div>
                </article>
              </li>
            );
          })}
          <li>
            <Link
              to={`/campaigns/${path(campaign.id)}/characters/new`}
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
