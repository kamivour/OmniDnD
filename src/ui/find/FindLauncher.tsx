import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { useStore } from 'zustand';
import {
  FIND_GROUPS,
  FIND_GROUP_LABELS,
  searchFind,
  type FindEntry,
  type FindGroup,
} from '../../engine/calc/find';
import { characterState, characterStore } from '../../state/character-store';
import { Sheet } from '../components/Sheet';
import { inputClass } from '../components/fields';
import { cx } from '../cx';
import { useCharacter } from '../hooks/useCharacter';
import { useCharacterBase } from '../hooks/useCharacterBase';
import { navPath } from '../layout/nav';
import { RestContext } from '../rest/rest-context';
import { scrollToAnchor } from './anchor';
import { TOOL_ENTRIES, characterEntries, ruleEntries } from './entries';
import { PLACES } from './places';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Search icon for a header. Ctrl/Cmd+K and "/" open it too. `withCharacter` adds the open character's things. */
export function FindLauncher({ withCharacter }: { withCharacter: boolean }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (!combo && !(slash && !isTyping(event.target))) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label="Find"
        data-tour="find"
        title="Find (Ctrl+K or /)"
        onClick={() => setOpen(true)}
        className="grid size-11 shrink-0 place-items-center rounded-btn text-text-muted hover:bg-surface hover:text-text"
      >
        <Search size={18} aria-hidden />
      </button>
      {open &&
        (withCharacter ? (
          <CharacterFind onClose={() => setOpen(false)} />
        ) : (
          <FindSheet characterItems={[]} books={undefined} base="" onClose={() => setOpen(false)} />
        ))}
    </>
  );
}

function CharacterFind({ onClose }: { onClose: () => void }) {
  const { characterId, state, sheet } = useCharacter();
  const base = useCharacterBase();
  const items = useMemo(() => characterEntries(state.build, sheet), [state.build, sheet]);
  const books = useStore(
    characterStore,
    (store) => characterState(store, characterId)?.campaign.sources,
  );
  return <FindSheet characterItems={items} books={books} base={base} onClose={onClose} />;
}

function FindSheet({
  characterItems,
  books,
  base,
  onClose,
}: {
  characterItems: readonly FindEntry[];
  books: readonly string[] | undefined;
  base: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const rest = useContext(RestContext);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const hasCharacter = base !== '';

  const results = useMemo(() => {
    const fixed = [
      ...PLACES.filter((place) => hasCharacter || !place.needsCharacter),
      ...characterItems,
      ...TOOL_ENTRIES,
    ];
    const found = searchFind(fixed, query).map((result) => result.entry);
    const skip = new Set(characterItems.map((entry) => entry.id));
    return [...found, ...ruleEntries(query, books, skip)].sort(
      (a, b) => FIND_GROUPS.indexOf(a.group) - FIND_GROUPS.indexOf(b.group),
    );
  }, [query, characterItems, books, hasCharacter]);
  const current = Math.min(active, results.length - 1);

  const choose = (entry: FindEntry) => {
    const { target } = entry;
    onClose();
    if (target.kind === 'external') {
      window.open(target.url, '_blank', 'noopener,noreferrer');
    } else if (target.kind === 'action') {
      window.setTimeout(
        () => (target.action === 'long-rest' ? rest?.openLongRest() : rest?.openShortRest()),
        0,
      );
    } else {
      const path = hasCharacter ? navPath(base, target.path) : `/${target.path}`;
      navigate(target.query ? `${path}?q=${encodeURIComponent(target.query)}` : path);
      if (target.anchor) scrollToAnchor(target.anchor);
    }
  };

  const groups = FIND_GROUPS.map((group) => ({
    group,
    rows: results.filter((entry) => entry.group === group),
  })).filter(({ rows }) => rows.length > 0);

  return (
    <Sheet
      open
      onOpenChange={(next) => !next && onClose()}
      title="Find"
      description="Screens, actions, your character, rules and tools"
      className="sm:w-[34rem]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        input.current?.focus();
      }}
    >
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Find"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? `${listId}-${current}` : undefined}
        placeholder="Jump, Print, Shatter, Long rest, map…"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && results.length > 0) {
            event.preventDefault();
            setActive((current + 1) % results.length);
          } else if (event.key === 'ArrowUp' && results.length > 0) {
            event.preventDefault();
            setActive((current - 1 + results.length) % results.length);
          } else if (event.key === 'Enter' && results[current]) {
            event.preventDefault();
            choose(results[current]);
          }
        }}
        className={inputClass}
      />
      {query.trim() !== '' && results.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">Nothing found for “{query.trim()}”.</p>
      )}
      <div id={listId} role="listbox" aria-label="Results" className="mt-3 flex flex-col gap-3">
        {groups.map(({ group, rows }) => (
          <div key={group} role="group" aria-label={FIND_GROUP_LABELS[group as FindGroup]}>
            <p className="mb-1 text-xs tracking-wide text-text-muted uppercase" aria-hidden>
              {FIND_GROUP_LABELS[group]}
            </p>
            {rows.map((entry) => {
              const index = results.indexOf(entry);
              return (
                <div
                  key={entry.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  tabIndex={-1}
                  onClick={() => choose(entry)}
                  onMouseMove={() => setActive(index)}
                  className={cx(
                    'flex min-h-11 cursor-pointer flex-col justify-center rounded-btn px-3 py-1',
                    index === current ? 'bg-surface text-accent' : 'text-text',
                  )}
                >
                  <span className="font-semibold">{entry.title}</span>
                  {entry.detail && (
                    <span className="truncate text-xs text-text-muted">{entry.detail}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
