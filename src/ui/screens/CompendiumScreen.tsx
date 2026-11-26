import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Check, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import {
  ITEM_TIERS,
  ITEM_TYPES,
  campaignAllows,
  catalogEntries,
  compareEntries,
  entryKind,
  groupBy,
  itemTier,
  itemType,
  matchesFilter,
  type CatalogEntry,
  type CatalogFilter,
  type CatalogKind,
} from '../../engine/catalog';
import {
  CR_STEPS,
  CREATURE_SIZES,
  compareMonsters,
  creatureBaseType,
  matchesMonster,
  monsterEntries,
} from '../../engine/bestiary';
import { MONSTER_SOURCES, SOURCE_NAMES, entryBooks } from '../../engine/calc/campaign-rules';
import { SCHOOLS } from '../../engine/rules2014';
import type { CreatureDef, Source } from '../../engine/schema';
import { CompendiumDetail } from '../compendium/CompendiumDetail';
import { CompendiumArt } from '../compendium/CompendiumArt';
import { AddToEncounter, MonsterDetail } from '../compendium/MonsterDetail';
import { PlanButton } from '../compendium/PlanButton';
import { featPrerequisite } from '../compendium/compendium-facts';
import { equipmentBases, equipmentProfile } from '../compendium/equipment-reference';
import {
  COMPENDIUM_TABS,
  TAB_LABELS,
  TIER_LABELS,
  TYPE_LABELS,
  TYPE_NAMES,
  clearFilters,
  groupLabel,
  hasFilters,
  readQuery,
  readTab,
  rowMeta,
  switchKind,
  toggleParam,
  titleCase,
} from '../compendium/compendium-model';
import {
  SIZE_LABELS,
  TYPE_FILTERS,
  monsterActiveFilters,
  monsterGroup,
  monsterMeta,
  readMonsterQuery,
  typeLabel,
} from '../compendium/monster-model';
import { inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { scrollToAnchor } from '../find/anchor';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { crText } from '../reference/creature-format';
import { cx } from '../cx';
import { characterState, characterStore } from '../../state/character-store';
import { useMonsterPack, useRegistry } from '../../state/monster-pack';
import '../compendium/compendium.css';

type ListEntry = CatalogEntry | CreatureDef;

const PAGE = 100;

const nameOf = (id: string) => registry.entries.get(id)?.name ?? id;

const chip = (on: boolean) =>
  cx(
    'inline-flex min-h-11 items-center rounded-btn border px-2.5 text-sm',
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
  const [hasReadingRoom, setHasReadingRoom] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const columns = useRef<HTMLDivElement>(null);
  const readingPanel = useRef<HTMLElement>(null);
  const listOpener = useRef<HTMLButtonElement>(null);
  const listScrollTop = useRef<number>(null);
  const query = useMemo(() => readQuery(params), [params]);
  const { kind, filter, entryId, allBooks } = query;
  const tab = readTab(params);
  const monsters = tab === 'monsters';
  const monsterQuery = useMemo(() => readMonsterQuery(params), [params]);
  const live = useRegistry();
  const packMissing = useMonsterPack((s) => !s.summary && s.status !== 'loading');
  const campaign = useStore(characterStore, (s) =>
    characterId ? characterState(s, characterId)?.campaign : undefined,
  );
  // Inside a character the campaign's books are the default; "Show all books" lifts it.
  const scope = campaign && !allBooks ? campaign : undefined;
  const inlineDetail = desktop && hasReadingRoom;
  useLayoutEffect(() => {
    const node = columns.current;
    if (!node) return;
    const measure = () => setHasReadingRoom(node.clientWidth >= 688);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!entryId && listScrollTop.current !== null) {
      window.scrollTo({ top: listScrollTop.current, behavior: 'instant' });
      listScrollTop.current = null;
    }
    if (!inlineDetail) return;
    const target = entryId ? readingPanel.current : listOpener.current;
    target?.focus({ preventScroll: true });
  }, [entryId, inlineDetail]);

  const all = useMemo(
    () =>
      monsters
        ? []
        : catalogEntries(registry, kind).filter((e) => !scope || campaignAllows(scope, e)),
    [kind, scope, monsters],
  );
  // Monsters (M50): the SRD stat blocks plus a loaded pack, in the campaign's books.
  const allMonsters = useMemo(
    () => (monsters ? monsterEntries(live, scope) : []),
    [live, scope, monsters],
  );
  const monsterResults = useMemo(
    () =>
      allMonsters
        .filter((c) => matchesMonster(c, monsterQuery.filter))
        .sort(compareMonsters(monsterQuery.sort)),
    [allMonsters, monsterQuery],
  );
  const results = useMemo(
    () =>
      all
        .filter((e) => {
          const bases = filter.text && e.kind === 'item' ? equipmentBases(e, registry) : [];
          return matchesFilter(
            e,
            filter,
            bases.map(({ name }) => name),
            scope,
          );
        })
        .sort(compareEntries),
    [all, filter, scope],
  );
  const books = useMemo(
    () =>
      monsters
        ? MONSTER_SOURCES.filter((b) => allMonsters.some((c) => entryBooks(c).includes(b)))
        : (Object.keys(SOURCE_NAMES) as Source[]).filter((b) => all.some((e) => e.source === b)),
    [all, allMonsters, monsters],
  );
  const entry = entryId ? live.entries.get(entryId) : undefined;
  const open = !monsters && entry && entryKind(entry) ? (entry as CatalogEntry) : undefined;
  const openMonster = monsters && entry?.kind === 'creature' ? entry : undefined;
  const shown: ListEntry | undefined = open ?? openMonster;
  const active = monsters ? monsterActiveFilters(monsterQuery.filter) : activeFilters(filter);
  const chosenBooks = monsters ? monsterQuery.filter.books : filter.books;
  const listed = monsters ? monsterResults : results;
  const total = monsters ? allMonsters.length : all.length;
  const group = (e: ListEntry) =>
    e.kind === 'creature' ? monsterGroup(monsterQuery.sort)(e) : groupLabel(e);
  const filterable =
    monsters ||
    kind === 'equipment' ||
    kind === 'spells' ||
    kind === 'subclasses' ||
    books.length > 1 ||
    active.length > 0;

  const update = (next: URLSearchParams) => {
    listOpener.current = null;
    listScrollTop.current = null;
    next.delete('entry');
    setParams(next, { replace: true });
  };
  const openEntry = (id: string, opener?: HTMLButtonElement) => {
    if (opener) {
      listOpener.current = opener;
      listScrollTop.current = window.scrollY;
    }
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
  const detail = open ? (
    <CompendiumDetail
      key={open.id}
      entry={open}
      onOpen={openEntry}
      action={characterId && <PlanButton characterId={characterId} entryId={open.id} />}
      titleInSheet={!inlineDetail}
    />
  ) : openMonster ? (
    <MonsterDetail
      key={openMonster.id}
      creature={openMonster}
      action={
        characterId && <AddToEncounter characterId={characterId} creatureId={openMonster.id} />
      }
      titleInSheet={!inlineDetail}
    />
  ) : undefined;

  return (
    <section
      className={cx(
        'compendium mx-auto flex min-w-0 max-w-7xl flex-col gap-4',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl">Compendium</h1>
        <Link to={`${base}/reference`} className="ml-auto text-sm text-accent underline">
          Reference
        </Link>
      </header>
      <div
        role="group"
        aria-label="Kinds"
        className="flex flex-wrap gap-1 rounded-card border border-border bg-surface p-1"
      >
        {COMPENDIUM_TABS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === tab}
            onClick={() => update(switchKind(params, k))}
            className={cx(
              'inline-flex min-h-11 items-center rounded-btn border px-3 text-sm',
              k === tab
                ? 'border-accent bg-surface-2 font-semibold text-accent'
                : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>
      {monsters && packMissing && (
        <p className="text-sm text-text-muted">
          Only the free SRD monsters are here.{' '}
          <Link
            to={`${base}/settings`}
            onClick={() => scrollToAnchor('settings-monsters')}
            className="text-accent underline"
          >
            Import your monster pack in Settings
          </Link>{' '}
          to add the rest.
        </p>
      )}

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={17}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={params.get('q') ?? ''}
              placeholder={`Search ${TAB_LABELS[tab].toLowerCase()}`}
              aria-label={`Search ${TAB_LABELS[tab].toLowerCase()}`}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.value) next.set('q', e.target.value);
                else next.delete('q');
                update(next);
              }}
              className={cx(inputClass, 'pl-9')}
            />
          </div>
          {filterable && (
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="compendium-filters"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cx(chip(filtersOpen), 'shrink-0 gap-2')}
            >
              <SlidersHorizontal size={16} aria-hidden /> Filters
            </button>
          )}
        </div>
        {!monsters && kind === 'equipment' && (
          <ChipRow label="Tier">
            {ITEM_TIERS.filter(
              (tier) =>
                all.some((e) => e.kind === 'item' && itemTier(e) === tier) ||
                filter.tiers?.includes(tier),
            ).map((tier) => {
              const pressed = filter.tiers?.includes(tier) ?? false;
              return (
                <button
                  key={tier}
                  type="button"
                  data-tier={tier}
                  aria-pressed={pressed}
                  onClick={() => update(toggleParam(params, 'tier', tier))}
                  className="compendium-tier inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border px-2.5 text-sm hover:bg-surface-2"
                >
                  {pressed ? (
                    <Check size={14} aria-hidden />
                  ) : (
                    <span aria-hidden className="tier-dot size-2 rounded-full" />
                  )}
                  {TIER_LABELS[tier]}
                </button>
              );
            })}
          </ChipRow>
        )}
        {filterable && (
          <div
            id="compendium-filters"
            hidden={!filtersOpen}
            className={filtersOpen ? 'flex flex-col gap-3 border-t border-border pt-3' : undefined}
          >
            {monsters ? (
              <MonsterFilters all={allMonsters} params={params} update={update} />
            ) : (
              <KindFilters kind={kind} all={all} params={params} update={update} />
            )}
            {books.length > 1 || chosenBooks?.length ? (
              <ChipRow label="Books">
                {[...new Set([...books, ...(chosenBooks ?? [])])].map((book) => (
                  <button
                    key={book}
                    type="button"
                    aria-pressed={chosenBooks?.includes(book) ?? false}
                    title={SOURCE_NAMES[book]}
                    onClick={() => update(toggleParam(params, 'book', book))}
                    className={chip(chosenBooks?.includes(book) ?? false)}
                  >
                    {book}
                  </button>
                ))}
              </ChipRow>
            ) : null}
          </div>
        )}
        {active.length > 0 && (
          <div role="group" aria-label="Active filters" className="flex flex-wrap gap-1.5">
            {active.map(({ key, value, label }) => (
              <button
                type="button"
                key={`${key}:${value}`}
                aria-label={`Remove filter ${label}`}
                className={cx(chip(true), 'gap-1')}
                onClick={() => update(toggleParam(params, key, value))}
              >
                {label} <X size={14} aria-hidden />
              </button>
            ))}
          </div>
        )}
        {campaign && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allBooks}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.checked) next.set('books', 'all');
                else next.delete('books');
                update(next);
              }}
              className="size-4 accent-accent"
            />
            Show all books
            {!allBooks && <span className="text-text-muted">(now: {campaign.name}'s books)</span>}
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <span aria-live="polite">
            {listed.length} of {total} {TAB_LABELS[tab].toLowerCase()}
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

      <div
        ref={columns}
        data-inline-detail={inlineDetail && Boolean(shown)}
        className="compendium-columns grid min-w-0 gap-5"
      >
        <ResultList
          key={listKey}
          results={listed}
          group={group}
          selected={shown?.id}
          onOpen={openEntry}
        />
        {inlineDetail && shown && (
          <aside
            ref={readingPanel}
            tabIndex={-1}
            aria-label="Compendium entry"
            className="sticky top-[calc(var(--character-header-height,0px)+16px)] max-h-[calc(100dvh-var(--character-header-height,0px)-32px)] self-start overflow-y-auto rounded-card border border-border bg-surface p-4"
          >
            <button
              type="button"
              aria-label="Close entry"
              onClick={closeEntry}
              className="absolute top-2 right-2 grid size-11 place-items-center rounded-btn text-text-muted hover:text-text"
            >
              <X size={20} aria-hidden />
            </button>
            {detail}
          </aside>
        )}
      </div>
      {!inlineDetail && (
        <Sheet
          open={!!shown}
          onOpenChange={(next) => !next && closeEntry()}
          title={shown?.name ?? 'Entry'}
          className="compendium-sheet max-h-[92dvh] sm:w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            listOpener.current?.focus({ preventScroll: true });
          }}
        >
          {detail}
        </Sheet>
      )}
    </section>
  );
}

function ResultList({
  results,
  group: groupOf,
  selected,
  onOpen,
}: {
  results: readonly ListEntry[];
  group: (entry: ListEntry) => string;
  selected: string | undefined;
  onOpen: (id: string, opener: HTMLButtonElement) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = results.slice(0, limit);
  const groups = groupBy(shown, groupOf);
  if (results.length === 0)
    return <p className="text-sm text-text-muted">Nothing matches. Try fewer filters.</p>;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {groups.map((group) => {
        const first = group.items[0];
        const tier = first?.kind === 'item' ? itemTier(first) : undefined;
        return (
          <section key={group.key || 'all'} aria-label={group.key || 'Results'} className="min-w-0">
            {group.key && (
              <h2
                data-tier={tier}
                className={cx(
                  'mb-2 flex items-center gap-2 text-sm font-semibold',
                  tier ? 'compendium-tier' : 'text-text-muted',
                )}
              >
                {tier && <span aria-hidden className="tier-dot size-2 rounded-full" />}
                {group.key}
              </h2>
            )}
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
              {group.items.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={(event) => onOpen(entry.id, event.currentTarget)}
                    aria-current={entry.id === selected ? 'true' : undefined}
                    className={cx(
                      'flex min-h-14 w-full min-w-0 items-center gap-3 border-l-2 border-transparent px-3 py-2 text-left hover:bg-surface-2',
                      entry.id === selected && 'border-l-accent bg-surface-2',
                    )}
                  >
                    {entry.kind === 'creature' ? (
                      <span
                        aria-hidden
                        className="grid size-10 shrink-0 place-items-center rounded-btn border border-border bg-surface-2 text-xs font-semibold"
                      >
                        {crText(entry.cr)}
                      </span>
                    ) : (
                      <CompendiumArt entry={entry} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium wrap-anywhere">{entry.name}</span>
                      <span className="block text-xs text-text-muted">
                        {entry.kind === 'creature' ? monsterMeta(entry) : resultMeta(entry)}
                      </span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-muted">
                      {entry.kind === 'creature' ? entryBooks(entry).join(' · ') : entry.source}
                      <ChevronRight size={14} aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
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

function resultMeta(entry: CatalogEntry): string {
  if (entry.kind === 'item') {
    const { weapon, armor, reference } = equipmentProfile(entry, registry);
    const type = reference?.ammunition ? 'Ammunition' : TYPE_NAMES[itemType(entry)];
    const stat =
      weapon?.damage !== undefined && weapon.damageType
        ? `${weapon.damage} ${weapon.damageType}`
        : armor
          ? `AC ${armor.category === 'shield' ? '+' : ''}${armor.baseAc}`
          : undefined;
    return stat ? `${type} · ${stat}` : type;
  }
  if (entry.kind === 'feature') {
    const prerequisite = featPrerequisite(entry);
    return prerequisite ? `Needs ${prerequisite}` : 'Feat';
  }
  if (entry.kind === 'class') return `${rowMeta(entry)} · Subclass at level ${entry.subclassLevel}`;
  if (entry.kind === 'subclass') {
    const parent = registry.entries.get(entry.classId);
    return parent?.kind === 'class'
      ? `${parent.name} · Level ${parent.subclassLevel}`
      : nameOf(entry.classId);
  }
  if (entry.kind === 'race') return `${titleCase(entry.size)} · ${entry.speed} ft`;
  return rowMeta(entry, nameOf);
}

function activeFilters(filter: CatalogFilter) {
  return [
    ...(filter.types ?? []).map((type) => ({ key: 'type', value: type, label: TYPE_LABELS[type] })),
    ...(filter.books ?? []).map((book) => ({ key: 'book', value: book, label: book })),
    ...(filter.levels ?? []).map((level) => ({
      key: 'level',
      value: String(level),
      label: level === 0 ? 'Cantrips' : `Level ${level}`,
    })),
    ...(filter.schools ?? []).map((school) => ({
      key: 'school',
      value: school,
      label: titleCase(school),
    })),
    ...[filter.classId ?? filter.parentClassId].flatMap((id) =>
      id ? [{ key: 'class', value: id, label: nameOf(id) }] : [],
    ),
  ];
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function MonsterFilters({
  all,
  params,
  update,
}: {
  all: readonly CreatureDef[];
  params: URLSearchParams;
  update: (next: URLSearchParams) => void;
}) {
  const { filter, sort } = readMonsterQuery(params);
  const present = useMemo(
    () => ({
      types: new Set(all.map((c) => creatureBaseType(c.creatureType))),
      sizes: new Set(all.flatMap((c) => c.sizes ?? [c.size])),
    }),
    [all],
  );
  const select = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    update(next);
  };
  const crSelect = (key: 'crmin' | 'crmax', label: string, value: number | undefined) => (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <select
        value={value === undefined ? '' : String(value)}
        onChange={(e) => select(key, e.target.value)}
        className={inputClass}
      >
        <option value="">Any</option>
        {CR_STEPS.map((cr) => (
          <option key={cr} value={cr}>
            {crText(cr)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {crSelect('crmin', 'Challenge from', filter.crMin)}
        {crSelect('crmax', 'Challenge to', filter.crMax)}
        <label className="col-span-2 flex flex-col gap-1 text-xs text-text-muted sm:col-span-1">
          Sort
          <select
            value={sort}
            onChange={(e) => select('sort', e.target.value === 'cr' ? 'cr' : '')}
            className={inputClass}
          >
            <option value="name">Name</option>
            <option value="cr">Challenge</option>
          </select>
        </label>
      </div>
      <ChipRow label="Type">
        {TYPE_FILTERS.filter((t) => present.types.has(t) || filter.types?.includes(t)).map((t) => {
          const on = filter.types?.includes(t) ?? false;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => update(toggleParam(params, 'type', t))}
              className={chip(on)}
            >
              {typeLabel(t)}
            </button>
          );
        })}
      </ChipRow>
      <ChipRow label="Size">
        {CREATURE_SIZES.filter((s) => present.sizes.has(s) || filter.sizes?.includes(s)).map(
          (s) => {
            const on = filter.sizes?.includes(s) ?? false;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => update(toggleParam(params, 'size', s))}
                className={chip(on)}
              >
                {SIZE_LABELS[s]}
              </button>
            );
          },
        )}
      </ChipRow>
      <ChipRow label="Only">
        {(
          [
            ['legendary', 'Legendary', filter.legendary],
            ['npc', 'NPC', filter.npc],
          ] as const
        ).map(([key, label, on]) => (
          <button
            key={key}
            type="button"
            aria-pressed={on ?? false}
            onClick={() => update(toggleParam(params, key, '1'))}
            className={chip(on ?? false)}
          >
            {label}
          </button>
        ))}
      </ChipRow>
    </>
  );
}

function KindFilters({
  kind,
  all,
  params,
  update,
}: {
  kind: CatalogKind;
  all: readonly CatalogEntry[];
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
    const tiers = filter.tiers;
    const present = new Set(
      all.flatMap((e) =>
        e.kind === 'item' && (!tiers?.length || tiers.includes(itemTier(e))) ? [itemType(e)] : [],
      ),
    );
    return ITEM_TYPES.filter((t) => present.has(t) || filter.types?.includes(t));
  }, [all, filter.tiers, filter.types]);

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
    );
  return null;
}
