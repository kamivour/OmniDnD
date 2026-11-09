import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';
import { registry } from '../../data/registry';
import { computeSheet } from '../../engine/calc/sheet';
import { characterState, type CharacterStoreState } from '../../state/character-store';
import {
  INITIAL_COLUMNS,
  OVERVIEW_COLUMNS,
  overviewCells,
  sortRows,
  type OverviewValue,
} from './overview';

const COLUMNS_KEY = 'omnidnd.party-columns';

function loadColumns(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    if (Array.isArray(saved)) {
      const known = saved.filter((id) => OVERVIEW_COLUMNS.some((column) => column.id === id));
      if (known.length > 0) return known;
    }
  } catch {
    // Storage can be blocked; fall back to the default columns.
  }
  return [...INITIAL_COLUMNS];
}

/** The DM's read-only table: one row per party character, pick and sort columns. */
export function DmOverview({
  state,
  characterIds,
}: {
  state: Pick<CharacterStoreState, 'campaigns' | 'characters'>;
  characterIds: string[];
}) {
  const [shown, setShown] = useState(loadColumns);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);

  const rows = useMemo(
    () =>
      characterIds.flatMap((id) => {
        const full = characterState(state, id);
        if (!full) return [];
        const cells: Record<string, OverviewValue> = overviewCells(
          full,
          computeSheet(full, registry),
        );
        return [{ id, name: full.build.name, cells }];
      }),
    [state, characterIds],
  );
  const columns = OVERVIEW_COLUMNS.filter((column) => shown.includes(column.id));
  const sorted = sortRows(rows, sortBy, descending);

  const toggle = (id: string) => {
    const next = shown.includes(id) ? shown.filter((entry) => entry !== id) : [...shown, id];
    setShown(next);
    if (sortBy === id && !next.includes(id)) setSortBy(null);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      // Not saving the choice is fine.
    }
  };
  const sort = (id: string) => {
    if (sortBy === id) setDescending(!descending);
    else {
      setSortBy(id);
      setDescending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <details data-tour="party-columns" className="rounded-card border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm">
          <Columns3 size={16} aria-hidden />
          Columns ({columns.length} of {OVERVIEW_COLUMNS.length})
        </summary>
        <fieldset className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3 px-3 pb-2">
          <legend className="sr-only">Columns to show</legend>
          {OVERVIEW_COLUMNS.map((column) => (
            <label key={column.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shown.includes(column.id)}
                onChange={() => toggle(column.id)}
              />
              {column.label}
            </label>
          ))}
        </fieldset>
      </details>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table data-tour="party-table" className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="sticky left-0 bg-surface p-0">
                <SortButton
                  label="Character"
                  active={sortBy === null}
                  descending={false}
                  onClick={() => setSortBy(null)}
                />
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    sortBy === column.id ? (descending ? 'descending' : 'ascending') : undefined
                  }
                  className="p-0"
                >
                  <SortButton
                    label={column.label}
                    active={sortBy === column.id}
                    descending={descending}
                    onClick={() => sort(column.id)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="sticky left-0 bg-surface p-0 text-left font-normal">
                  <Link
                    to={`/characters/${encodeURIComponent(row.id)}`}
                    className="flex min-h-11 items-center px-3 font-display text-base text-accent"
                  >
                    {row.name}
                  </Link>
                </th>
                {columns.map((column) => (
                  <td key={column.id} className="min-w-20 px-3 py-2 align-middle capitalize">
                    {row.cells[column.id]?.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  descending,
  onClick,
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-1 px-3 text-left text-xs font-normal whitespace-nowrap text-text-muted"
    >
      {label}
      {active &&
        (descending ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}
    </button>
  );
}
