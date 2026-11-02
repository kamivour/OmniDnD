import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useStore } from 'zustand';
import { ExternalLink, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { REFERENCE_LINKS } from '../../data/reference';
import { addBookmark, deleteBookmark, updateBookmark } from '../../engine/commands/bookmarks';
import { BookmarkSchema, type Bookmark } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { useManagement } from '../commands/useManagement';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { cx } from '../cx';

const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Links and personal bookmarks are shared by all campaigns on this device. */
export function ReferenceScreen() {
  const { characterId } = useParams();
  const base = characterId ? `/characters/${encodeURIComponent(characterId)}` : '';
  const { bookmarks, managementEvents } = useStore(characterStore);
  const { run, undo, confirmation, pending } = useManagement();
  const [editor, setEditor] = useState<{ bookmark: Bookmark; existing: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const titleInput = useRef<HTMLInputElement | null>(null);
  const focusAfterRemove = useRef(false);
  useEffect(() => {
    if (!pending && focusAfterRemove.current) {
      focusAfterRemove.current = false;
      addButton.current?.focus();
    }
  }, [pending]);
  const last = managementEvents.findLast((event) => event.command !== 'undo' && !event.undoneBy);
  const openEditor = (bookmark?: Bookmark) => {
    opener.current = document.activeElement as HTMLElement;
    setError(null);
    setEditor({
      bookmark: bookmark ?? { id: crypto.randomUUID(), title: '', url: '' },
      existing: !!bookmark,
    });
  };

  return (
    <section
      className={cx(
        'mx-auto flex min-w-0 max-w-5xl flex-col gap-6',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl">Reference</h1>
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
          <Link to={`${base}/reference/credits`} className={button}>
            Credits
          </Link>
        </div>
      </header>
      <p className="text-sm text-text-muted">
        OmniDnD uses 2014 rules. External links open in a new tab and need an internet connection.
        Some libraries also contain newer rules; choose 2014 or SRD 5.1 material.
      </p>
      <section aria-labelledby="reference-links" className="flex flex-col gap-3">
        <h2 id="reference-links" className="text-base font-semibold">
          Rules and tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {REFERENCE_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label={link.title}
              className="flex min-w-0 gap-3 rounded-card border border-border bg-surface p-4 hover:border-accent"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{link.title}</h3>
                <p className="mt-1 text-sm text-text-muted">{link.description}</p>
              </div>
              <ExternalLink size={18} aria-hidden className="shrink-0 text-accent" />
            </a>
          ))}
        </div>
      </section>
      <section aria-labelledby="reference-bookmarks" className="flex min-w-0 flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <h2 id="reference-bookmarks" className="text-base font-semibold">
            Bookmarks
          </h2>
          <button
            ref={addButton}
            type="button"
            disabled={pending}
            onClick={() => openEditor()}
            className={`${button} ml-auto`}
          >
            <Plus size={16} aria-hidden />
            Add bookmark
          </button>
        </header>
        <p className="text-xs text-text-muted">
          Shared across your campaigns, saved on this device.
        </p>
        {bookmarks.length === 0 && <p className="text-sm text-text-muted">No bookmarks yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {bookmarks.map((bookmark) => (
            <article
              key={bookmark.id}
              aria-label={bookmark.title}
              className="min-w-0 rounded-card border border-border bg-surface p-4"
            >
              <a
                href={bookmark.url}
                target="_blank"
                rel="noreferrer"
                aria-label={bookmark.title}
                className="flex min-w-0 items-start gap-2 font-semibold text-accent"
              >
                <span className="min-w-0 flex-1 break-words">{bookmark.title}</span>
                <ExternalLink size={16} aria-hidden className="shrink-0" />
              </a>
              <p className="mt-2 break-all text-xs text-text-muted">{bookmark.url}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  aria-label="Edit bookmark"
                  disabled={pending}
                  onClick={() => openEditor(bookmark)}
                  className={button}
                >
                  <Pencil size={16} aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  aria-label="Remove bookmark"
                  disabled={pending}
                  onClick={() => {
                    run(deleteBookmark, { bookmarkId: bookmark.id }, () => {
                      focusAfterRemove.current = true;
                    });
                  }}
                  className={`${button} text-danger`}
                >
                  <Trash2 size={16} aria-hidden />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
        title={editor?.existing ? 'Edit bookmark' : 'Add bookmark'}
        description="Use a full HTTP or HTTPS URL."
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (opener.current?.isConnected ? opener.current : addButton.current)?.focus();
        }}
      >
        {editor && (
          <form
            noValidate
            className="flex flex-col gap-4"
            onChange={() => setError(null)}
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = BookmarkSchema.safeParse(editor.bookmark);
              if (!parsed.success) {
                setError('Enter a title and a valid HTTP or HTTPS URL.');
                return;
              }
              run(editor.existing ? updateBookmark : addBookmark, { bookmark: parsed.data }, () =>
                setEditor(null),
              );
            }}
          >
            <Field label="Title" htmlFor="bookmark-title">
              <input
                ref={titleInput}
                id="bookmark-title"
                required
                value={editor.bookmark.title}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    bookmark: { ...editor.bookmark, title: event.target.value },
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="URL" htmlFor="bookmark-url">
              <input
                id="bookmark-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                required
                value={editor.bookmark.url}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    bookmark: { ...editor.bookmark, url: event.target.value },
                  })
                }
                placeholder="https://…"
                className={inputClass}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-warn">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditor(null)} className={button}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-btn bg-accent px-4 text-sm font-semibold text-bg disabled:opacity-40"
              >
                Save bookmark
              </button>
            </div>
          </form>
        )}
      </Sheet>
      {confirmation}
    </section>
  );
}
