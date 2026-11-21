import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { X } from 'lucide-react';
import { registry } from '../../data/registry';
import {
  CATALOG_KINDS,
  ITEM_TIERS,
  ITEM_TYPES,
  catalogEntries,
  groupBy,
  itemTier,
  itemType,
  searchCatalog,
  type CatalogEntry,
  type CatalogKind,
} from '../../engine/catalog';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
import { SCHOOLS } from '../../engine/rules2014';
import type { Source } from '../../engine/schema';
import { CompendiumDetail } from '../compendium/CompendiumDetail';
import {
  KIND_LABELS,
  TIER_LABELS,
  TYPE_LABELS,
  clearFilters,
  groupLabel,
  hasFilters,
  readQuery,
  rowMeta,
  switchKind,
  toggleParam,
} from '../compendium/compendium-model';
import { inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { cx } from '../cx';

const PAGE = 100;

const nameOf = (id: string) => registry.entries.get(id)?.name ?? id;

const chip = (on: boolean) =>
  cx(
    'inline-flex min-h-9 items-center rounded-btn border px-2.5 text-sm',
    on ? 'border-accent bg-surface-2 text-accent' : 'border-border text-text-muted hover:text-text',
  );

/** Read-only library of the bundled 2014 data for planning characters (M45). */
export function CompendiumScreen() {
  const { characterId } = useParams();
  const base = characterId ? `/characters/${encodeURIComponent(characterId)}` : '';
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const query = useMemo(() => readQuery(params), [params]);
  const { kind, filter, entryId } = query;

  const all = useMemo(() => catalogEntries(registry, kind), [kind]);
  const results = useMemo(() => searchCatalog(registry, kind, filter), [kind, filter]);
  const books = useMemo(
    () => (Object.keys(SOURCE_NAMES) as Source[]).filter((b) => all.some((e) => e.source === b)),
    [all],
  );
  const entry = entryId ? registry.entries.get(entryId) : undefined;
  const open = entry && all.includes(entry as CatalogEntry) ? (entry as CatalogEntry) : undefined;

  const update = (next: URLSearchParams) => {
    next.delete('entry');
    setParams(next, { replace: true });
  };
  const openEntry = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('entry', id);
    setParams(next, { state: { compendiumEntry: true } });
  };
  const closeEntry = () => {
    if ((location.state as { compendiumEntry?: boolean } | null)?.compendiumEntry)
      void navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete('entry');
      setParams(next, { replace: true });
    }
  };

  const listKey = [...params.entries()].filter(([k]) => k !== 'entry').join('&');
  const detail = open && <CompendiumDetail entry={open} meta={rowMeta(open, nameOf)} />;

  return (
    <section
      className={cx(
        'mx-auto flex min-w-0 max-w-6xl flex-col gap-4',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl">Compendium</h1>
        <Link to={`${base}/reference`} className="ml-auto text-sm text-accent underline">
          Reference
        </Link>
      </header>
      <p className="text-sm text-text-muted">
        Browse 2014 spells, classes, origins, feats and equipment to plan a character. Nothing here
        changes your character.
      </p>

      <div role="group" aria-label="Kinds" className="flex flex-wrap gap-1.5">
        {CATALOG_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => update(switchKind(params, k))}
            className={cx(
              'inline-flex min-h-11 items-center rounded-btn border px-3 text-sm',
              k === kind
                ? 'border-accent bg-surface-2 font-semibold text-accent'
                : 'border-border hover:bg-surface-2',
            )}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="sr-only">Search {KIND_LABELS[kind].toLowerCase()}</span>
          <input
            type="search"
            value={params.get('q') ?? ''}
            placeholder={`Search ${KIND_LABELS[kind].toLowerCase()}`}
            aria-label={`Search ${KIND_LABELS[kind].toLowerCase()}`}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set('q', e.target.value);
              else next.delete('q');
              update(next);
            }}
            className={inputClass}
          />
        </label>
        <KindFilters kind={kind} params={params} update={update} />
        {books.length > 1 && (
          <ChipRow label="Books">
            {books.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={filter.books?.includes(b) ?? false}
                title={SOURCE_NAMES[b]}
                onClick={() => update(toggleParam(params, 'book', b))}
                className={chip(filter.books?.includes(b) ?? false)}
              >
                {b}
              </button>
            ))}
          </ChipRow>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <span aria-live="polite">
            {results.length} of {all.length} {KIND_LABELS[kind].toLowerCase()}
          </span>
          {hasFilters(params) && (
            <button
              type="button"
              onClick={() => update(clearFilters(params))}
              className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-btn px-2 text-accent"
            >
              <X size={14} aria-hidden /> Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ResultList key={listKey} results={results} selected={open?.id} onOpen={openEntry} />
        {desktop && (
          <aside
            aria-label="Compendium entry"
            className="sticky top-4 hidden max-h-[calc(100dvh-2rem)] self-start overflow-y-auto rounded-card border border-border bg-surface p-4 lg:block"
          >
            {open ? (
              <>
                <div className="-mt-2 -mr-2 flex justify-end">
                  <button
                    type="button"
                    aria-label="Close entry"
                    onClick={closeEntry}
                    className="grid size-11 place-items-center rounded-btn text-text-muted hover:text-text"
                  >
                    <X size={20} aria-hidden />
                  </button>
                </div>
                {detail}
              </>
            ) : (
              <p className="text-sm text-text-muted">Pick an entry to read it here.</p>
            )}
          </aside>
        )}
      </div>
      {!desktop && (
        <Sheet
          open={!!open}
          onOpenChange={(next) => !next && closeEntry()}
          title={open?.name ?? 'Entry'}
        >
          {detail}
        </Sheet>
      )}
    </section>
  );
}

function ResultList({
  results,
  selected,
  onOpen,
}: {
  results: readonly CatalogEntry[];
  selected: string | undefined;
  onOpen: (id: string) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = results.slice(0, limit);
  const groups = groupBy(shown, groupLabel);
  if (results.length === 0)
    return <p className="text-sm text-text-muted">Nothing matches. Try fewer filters.</p>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key || 'all'} aria-label={group.key || 'Results'} className="min-w-0">
          {group.key && (
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
              {group.key}
            </h2>
          )}
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {group.items.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry.id)}
                  aria-current={entry.id === selected ? 'true' : undefined}
                  className={cx(
                    'flex min-h-11 w-full min-w-0 items-baseline gap-2 px-3 py-2 text-left hover:bg-surface-2',
                    entry.id === selected && 'bg-surface-2',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium wrap-anywhere">{entry.name}</span>
                    <span className="block text-xs text-text-muted">{rowMeta(entry, nameOf)}</span>
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{entry.source}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {results.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE)}
          className="inline-flex min-h-11 items-center justify-center rounded-btn border border-border px-3 text-sm hover:bg-surface-2"
        >
          Show {Math.min(PAGE, results.length - limit)} more ({results.length - limit} left)
        </button>
      )}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function KindFilters({
  kind,
  params,
  update,
}: {
  kind: CatalogKind;
  params: URLSearchParams;
  update: (next: URLSearchParams) => void;
}) {
  const query = readQuery(params);
  const { filter } = query;
  const classes = useMemo(
    () => catalogEntries(registry, 'classes').sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const casters = useMemo(() => {
    const ids = new Set(
      catalogEntries(registry, 'spells').flatMap((e) => (e.kind === 'spell' ? e.classes : [])),
    );
    return classes.filter((c) => ids.has(c.id));
  }, [classes]);
  const typesByTier = useMemo(() => {
    const items = catalogEntries(registry, 'equipment');
    const tiers = filter.tiers;
    const present = new Set(
      items.flatMap((e) =>
        e.kind === 'item' && (!tiers?.length || tiers.includes(itemTier(e))) ? [itemType(e)] : [],
      ),
    );
    return ITEM_TYPES.filter((t) => present.has(t));
  }, [filter.tiers]);
  const tiersPresent = useMemo(() => {
    const present = new Set(
      catalogEntries(registry, 'equipment').flatMap((e) =>
        e.kind === 'item' ? [itemTier(e)] : [],
      ),
    );
    return ITEM_TIERS.filter((t) => present.has(t));
  }, []);

  const select = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  };

  if (kind === 'spells')
    return (
      <>
        <ChipRow label="Level">
          {Array.from({ length: 10 }, (_, level) => {
            const on = filter.levels?.includes(level) ?? false;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                aria-label={level === 0 ? 'Cantrips' : `Level ${level}`}
                onClick={() => update(toggleParam(params, 'level', String(level)))}
                className={chip(on)}
              >
                {level === 0 ? 'C' : level}
              </button>
            );
          })}
        </ChipRow>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            Class list
            <select
              value={filter.classId ?? ''}
              onChange={(e) => select('class', e.target.value)}
              className={inputClass}
            >
              <option value="">Any class</option>
              {casters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-muted">
            School
            <select
              value={filter.schools?.[0] ?? ''}
              onChange={(e) => select('school', e.target.value)}
              className={inputClass}
            >
              <option value="">Any school</option>
              {SCHOOLS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </>
    );
  if (kind === 'subclasses')
    return (
      <label className="flex flex-col gap-1 text-xs text-text-muted sm:max-w-xs">
        Class
        <select
          value={filter.parentClassId ?? ''}
          onChange={(e) => select('class', e.target.value)}
          className={inputClass}
        >
          <option value="">Any class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    );
  if (kind === 'equipment')
    return (
      <>
        <ChipRow label="Tier">
          {tiersPresent.map((t) => {
            const on = filter.tiers?.includes(t) ?? false;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => update(toggleParam(params, 'tier', t))}
                className={chip(on)}
              >
                {TIER_LABELS[t]}
              </button>
            );
          })}
        </ChipRow>
        <ChipRow label="Type">
          {typesByTier.map((t) => {
            const on = filter.types?.includes(t) ?? false;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => update(toggleParam(params, 'type', t))}
                className={chip(on)}
              >
                {TYPE_LABELS[t]}
              </button>
            );
          })}
        </ChipRow>
      </>
    );
  return null;
}
