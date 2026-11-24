import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { registry } from '../../data/registry';
import { computeSheet, type Sheet } from '../../engine/calc/sheet';
import type { ExportFile } from '../../engine/schema';
import {
  CHARACTER_LINK_PATH,
  CharacterLinkToken,
  readCharacterLink,
} from '../../sync/character-links';
import { CharacterReader } from './PartyCharacterView';

function Brand() {
  return (
    <Link to="/" className="inline-flex min-h-11 items-center font-display text-accent">
      OmniDnD
    </Link>
  );
}

function MissingCopy({ retry }: { retry?: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-3 p-4 sm:pt-12">
      <Brand />
      <h1 className="font-display text-xl">Shared character unavailable</h1>
      <p className="text-sm text-text-muted">
        {retry
          ? 'Check your connection and try again.'
          : 'This link may have been revoked or copied incorrectly. Ask the owner for a new link.'}
      </p>
      {retry && (
        <button
          type="button"
          className="min-h-11 rounded-btn border border-border px-3 text-accent"
          onClick={retry}
        >
          Retry
        </button>
      )}
    </main>
  );
}

type Load = 'loading' | 'missing' | 'failed' | { file: ExportFile; sheet: Sheet };

function SharedCopy({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void readCharacterLink(token, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return;
        setLoad(file ? { file, sheet: computeSheet(file, registry) } : 'missing');
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad('failed');
      });
    return () => controller.abort();
  }, [token, retry]);

  if (load === 'loading')
    return (
      <p role="status" className="mx-auto max-w-lg p-4 sm:pt-12">
        Loading shared character…
      </p>
    );
  if (load === 'missing') return <MissingCopy />;
  if (load === 'failed')
    return (
      <MissingCopy
        retry={() => {
          setLoad('loading');
          setRetry((count) => count + 1);
        }}
      />
    );

  return (
    <CharacterReader
      state={load.file}
      sheet={load.sheet}
      path={CHARACTER_LINK_PATH}
      header={<Brand />}
      access={
        <div
          role="note"
          aria-label="View only"
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="inline-flex items-center gap-1 rounded-btn border border-border px-2 py-0.5 font-medium text-accent">
            <Eye size={13} aria-hidden /> View only
          </span>
          <time dateTime={load.file.exportedAt} className="text-text-muted">
            Published {new Date(load.file.exportedAt).toLocaleString()}
          </time>
        </div>
      }
    />
  );
}

export function SharedCharacterScreen() {
  const { hash } = useLocation();
  const token = CharacterLinkToken.safeParse(hash.slice(1));
  return token.success ? <SharedCopy key={token.data} token={token.data} /> : <MissingCopy />;
}
