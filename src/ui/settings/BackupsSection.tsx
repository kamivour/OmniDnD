import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Download, History, Upload } from 'lucide-react';
import type { Workspace } from '../../db/database';
import {
  prepareWorkspaceImport,
  summarizeWorkspace,
  workspaceExport,
  type WorkspaceSummary,
} from '../../data/workspace-files';
import { characterStore } from '../../state/character-store';
import { deviceStore } from '../../state/device-settings';
import { backupReminder } from '../../state/backup-reminder';
import { listBackups, restoreWorkspace, type SavedBackup } from '../../state/persistence';
import { Sheet } from '../components/Sheet';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

const REASONS: Record<SavedBackup['reason'], string> = {
  'before-import': 'Before an import',
  'before-reset': 'Before a reset',
  'after-long-rest': 'After a long rest',
  'before-restore': 'Before a restore',
};

interface Candidate {
  title: string;
  when: string;
  workspace: Workspace;
  summary: WorkspaceSummary;
}

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** Save every campaign and character to one file, restore from a file, or step back to a recovery point. */
export function BackupsSection() {
  const lastBackupAt = useStore(deviceStore, (state) => state.lastBackupAt);
  const characterCount = useStore(characterStore, (state) => Object.keys(state.characters).length);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [candidate, setCandidate] = useState<Candidate>();
  const [points, setPoints] = useState<SavedBackup[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => {
    listBackups().then(setPoints, () => setPoints([]));
  };
  useEffect(refresh, []);

  const reminder = backupReminder(lastBackupAt, new Date(), characterCount > 0);

  const exportAll = () => {
    setError(undefined);
    try {
      const now = new Date();
      const file = workspaceExport(characterStore.getState(), now.toISOString());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `omnidnd-backup-${now.toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      deviceStore.getState().markBackedUp(now.toISOString());
      setNotice('Backup file saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed');
    }
  };

  const chooseFile = async (file: File | undefined) => {
    setError(undefined);
    setNotice(undefined);
    if (!file) return;
    try {
      const prepared = prepareWorkspaceImport(JSON.parse(await file.text()));
      setCandidate({
        title: 'Restore this backup file?',
        when: `Saved ${formatDate(prepared.exportedAt)}`,
        workspace: prepared.workspace,
        summary: prepared.summary,
      });
    } catch (cause) {
      setError(
        cause instanceof SyntaxError
          ? 'This file is not an OmniDnD backup.'
          : cause instanceof Error
            ? cause.message
            : 'Could not read this file.',
      );
    }
  };

  const confirm = () => {
    if (!candidate) return;
    restoreWorkspace(candidate.workspace);
    setCandidate(undefined);
    setNotice('Restored. A recovery point of the previous data was kept.');
    window.setTimeout(refresh, 600);
  };

  return (
    <section aria-labelledby="settings-backups" className="flex flex-col gap-3">
      <h2 id="settings-backups" className="text-base font-semibold">
        Backups
      </h2>
      {reminder && (
        <p role="status" className="rounded-card border border-warn bg-surface p-3 text-sm">
          {reminder} Save one so a lost phone or cleared browser does not lose your characters.
        </p>
      )}
      <p className="text-sm text-text-muted">
        One file holds every campaign, character and history on this device.
        {lastBackupAt ? ` Last saved ${formatDate(lastBackupAt)}.` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportAll} className={button}>
          <Download size={16} aria-hidden />
          Export all data
        </button>
        <button type="button" onClick={() => input.current?.click()} className={button}>
          <Upload size={16} aria-hidden />
          Restore from file
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Restore backup file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void chooseFile(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      )}
      {points.length > 0 && (
        <details className="rounded-card border border-border bg-surface p-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <History size={16} aria-hidden />
            Recovery points ({points.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {points.map((point) => (
              <li key={point.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {REASONS[point.reason]}
                  <span className="block text-text-muted">{formatDate(point.capturedAt)}</span>
                </span>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setCandidate({
                      title: 'Restore this recovery point?',
                      when: `${REASONS[point.reason]}, ${formatDate(point.capturedAt)}`,
                      workspace: point.workspace,
                      summary: summarizeWorkspace(point.workspace),
                    })
                  }
                >
                  Preview
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Sheet
        open={candidate !== undefined}
        onOpenChange={(open) => !open && setCandidate(undefined)}
        title={candidate?.title ?? ''}
        description={candidate?.when}
      >
        {candidate && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              {candidate.summary.characters.length} character
              {candidate.summary.characters.length === 1 ? '' : 's'} in{' '}
              {candidate.summary.campaigns.length} campaign
              {candidate.summary.campaigns.length === 1 ? '' : 's'}.
            </p>
            <ul className="list-disc pl-5">
              {candidate.summary.characters.map((entry, index) => (
                <li key={index}>
                  {entry.name} <span className="text-text-muted">({entry.campaign})</span>
                </li>
              ))}
            </ul>
            <p className="text-text-muted">
              This replaces everything on this device. A recovery point of the current data is kept
              first.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={button} onClick={() => setCandidate(undefined)}>
                Cancel
              </button>
              <button type="button" className={`${button} bg-accent text-bg`} onClick={confirm}>
                Replace and restore
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
