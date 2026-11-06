import { useState } from 'react';
import { registry } from '../../data/registry';
import { searchRules } from '../../engine/calc/rules-search';
import { inputClass } from '../components/fields';

const KIND_LABEL = {
  condition: 'Condition',
  spell: 'Spell',
  feature: 'Feature',
  item: 'Item',
  class: 'Class',
  subclass: 'Subclass',
  race: 'Race',
  background: 'Background',
} as const;

/** Name search over bundled 2014 data. Conditions show their rules text; the rest show where they come from. */
export function RulesSearch() {
  const [query, setQuery] = useState('');
  const hits = searchRules(registry, query);
  const searching = query.trim() !== '';

  return (
    <section aria-labelledby="reference-search" className="flex min-w-0 flex-col gap-3">
      <h2 id="reference-search" className="text-base font-semibold">
        Search rules
      </h2>
      <input
        type="search"
        aria-label="Search rules"
        placeholder="Conditions, spells, items, features…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className={inputClass}
      />
      {searching && hits.length === 0 && (
        <p className="text-sm text-text-muted">Nothing found for “{query.trim()}”.</p>
      )}
      {hits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {hits.map((hit) => (
            <li key={hit.id} className="rounded-card bg-surface p-3">
              <p className="text-sm text-text">
                <span className="font-semibold">{hit.name}</span>
                <span className="text-text-muted">
                  {' '}
                  · {KIND_LABEL[hit.kind]} · {hit.source}
                </span>
              </p>
              {hit.text && (
                <p className="mt-1 whitespace-pre-line text-sm text-text-muted">{hit.text}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
