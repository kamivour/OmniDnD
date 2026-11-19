import { useRef, useState, type ReactNode } from 'react';
import { ZodError } from 'zod';
import { characterExport, prepareCharacterImport } from '../../data/character-files';
import { registry } from '../../data/registry';
import { computeSheet } from '../../engine/calc/sheet';
import { importCharacter } from '../../engine/commands/management';
import type { ExportFile } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/toast-context';
import type { useManagement } from './useManagement';

const button =
  'hover-lift inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border bg-surface px-3 text-sm text-text disabled:opacity-40';

/** Character-file actions share the parent's durable management controller. */
export function useCharacterTransfer({
  run,
  pending,
}: Pick<ReturnType<typeof useManagement>, 'run' | 'pending'>): {
  openImport: (opener: HTMLElement) => void;
  exportCharacter: (id: string) => void;
  importControls: ReactNode;
  exportControls: ReactNode;
} {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [importing, setImporting] = useState<{ file: ExportFile; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const exportOpener = useRef<Element | null>(null);

  const openImport = (target: HTMLElement) => {
    opener.current = target;
    input.current?.click();
  };

  const exportCharacter = (id: string) => {
    exportOpener.current = document.activeElement;
    setExporting(id);
  };

  const download = (id: string, history: boolean) => {
    setExporting(null);
    try {
      const file = characterExport(characterStore.getState(), id, new Date().toISOString(), {
        history,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.build.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'character'}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      toast({ text: cause instanceof Error ? cause.message : 'Export failed' });
    }
  };

  const importControls = (
    <>
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
      {error && (
        <p role="alert" className="rounded-card border border-warn p-3 text-sm text-warn">
          Import failed: {error}
        </p>
      )}
      <Sheet
        open={importing !== null}
        onOpenChange={(open) => !open && setImporting(null)}
        title="Import character"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            opener.current?.isConnected && opener.current.getClientRects().length
              ? opener.current
              : (document.getElementById('hub-workspace') ??
                document.getElementById('character-workspace'));
          target?.focus();
        }}
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
              Existing characters and campaign rules remain saved. A local backup is saved before
              adding this import.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(importCharacter, { file: importing.file }, () => setImporting(null))
              }
              className={`${button} w-full`}
            >
              Add character
            </button>
          </>
        )}
      </Sheet>
    </>
  );

  const record = exporting ? characterStore.getState().characters[exporting] : undefined;
  const size = (history: boolean) =>
    exporting
      ? kilobytes(
          JSON.stringify(
            characterExport(characterStore.getState(), exporting, new Date().toISOString(), {
              history,
            }),
            null,
            2,
          ).length,
        )
      : '';
  const exportControls = (
    <Sheet
      open={record !== undefined}
      onOpenChange={(open) => !open && setExporting(null)}
      title={`Export ${record?.build.name ?? 'character'}`}
      description="The file holds choices, current resources and campaign rules. History is the game-action log; leave it out for a smaller file with nothing to undo."
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target = exportOpener.current;
        if (target instanceof HTMLElement && target.isConnected) target.focus();
      }}
    >
      {record && exporting && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => download(exporting, false)}
            className={`${button} w-full`}
          >
            Without history ({size(false)})
          </button>
          <button
            type="button"
            onClick={() => download(exporting, true)}
            className={`${button} w-full`}
          >
            With history: {record.events.length} {record.events.length === 1 ? 'entry' : 'entries'}{' '}
            ({size(true)})
          </button>
        </div>
      )}
    </Sheet>
  );

  return { openImport, exportCharacter, importControls, exportControls };
}

function kilobytes(length: number) {
  return length < 1024 * 1024
    ? `${Math.max(1, Math.round(length / 1024))} KB`
    : `${(length / 1024 / 1024).toFixed(1)} MB`;
}
