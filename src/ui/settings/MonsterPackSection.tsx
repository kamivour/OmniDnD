import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
import type { Source } from '../../engine/schema';
import { importMonsterPack, removeMonsterPack, useMonsterPack } from '../../state/monster-pack';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

const BOOK_ORDER: readonly Source[] = ['MM', 'VGM', 'MTF', 'MPMM'];

/**
 * Import or remove the private monster pack (M50). The pack is made from books the person owns
 * with the local `monsters` tool and stays on this device.
 */
export function MonsterPackSection() {
  const status = useMonsterPack((state) => state.status);
  const summary = useMonsterPack((state) => state.summary);
  const loadError = useMonsterPack((state) => state.error);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const chooseFile = async (file: File | undefined) => {
    setError(undefined);
    setNotice(undefined);
    if (!file) return;
    setBusy(true);
    try {
      const problem = await importMonsterPack(await file.text());
      if (problem) setError(problem);
      else setNotice('Monster pack imported.');
    } catch {
      setError('Could not save the pack on this device.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirming(false);
    setError(undefined);
    try {
      await removeMonsterPack();
      setNotice('Monster pack removed. Only the free monsters remain.');
    } catch {
      setError('Could not remove the pack.');
    }
  };

  const books = BOOK_ORDER.filter((book) => summary?.books[book]);

  return (
    <section
      id="settings-monsters"
      aria-labelledby="settings-monsters-title"
      className="flex flex-col gap-3"
    >
      <h2 id="settings-monsters-title" className="text-base font-semibold">
        Monster pack
      </h2>
      <p className="text-sm text-text-muted">
        The app includes the free monsters. A pack you make from your own monster books adds the
        rest, with book pages and lore. It stays on this device and is never synced, shared or put
        in backups.
      </p>
      {summary ? (
        <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3 text-sm">
          <p>
            <span className="font-semibold">{summary.creatures} monsters</span> added
            {summary.supplements > 0 && `, ${summary.supplements} free monsters tagged`}
            {summary.lore > 0 && `, ${summary.lore} lore entries`}.
          </p>
          {books.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 text-text-muted">
              {books.map((book) => (
                <li key={book}>
                  {SOURCE_NAMES[book]}: {summary.books[book]}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted">
            Made {summary.extractedAt} · version {summary.version}
            {summary.local && ' · loaded from your local file (development only)'}
          </p>
          {summary.skipped > 0 && (
            <p className="text-xs text-warn">
              {summary.skipped} entries were skipped because they clash with built-in data.
            </p>
          )}
        </div>
      ) : (
        status === 'ready' && <p className="text-sm">No monster pack on this device.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={button}
        >
          <Upload size={16} aria-hidden />
          {summary ? 'Replace pack' : 'Import pack'}
        </button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="Monster pack file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void chooseFile(file);
          }}
        />
        {((summary && !summary.local) || status === 'error') &&
          (confirming ? (
            <>
              <button type="button" onClick={() => void remove()} className={button}>
                <Trash2 size={16} aria-hidden />
                Yes, remove it
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={button}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={button}>
              <Trash2 size={16} aria-hidden />
              Remove pack
            </button>
          ))}
      </div>
      {(error ?? loadError) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? loadError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      )}
    </section>
  );
}
