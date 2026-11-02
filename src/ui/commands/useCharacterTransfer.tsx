import { useRef, useState, type ReactNode } from 'react';
import { ZodError } from 'zod';
import { characterExport, prepareCharacterImport } from '../../data/character-files';
import { registry } from '../../data/registry';
import { computeSheet } from '../../engine/calc/sheet';
import { addCharacter } from '../../engine/commands/management';
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
} {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [importing, setImporting] = useState<{ file: ExportFile; notes: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openImport = (target: HTMLElement) => {
    opener.current = target;
    input.current?.click();
  };

  const exportCharacter = (id: string) => {
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
    </>
  );

  return { openImport, exportCharacter, importControls };
}
