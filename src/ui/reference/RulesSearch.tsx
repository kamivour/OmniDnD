import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { searchRules } from '../../engine/calc/rules-search';
import { characterState, characterStore } from '../../state/character-store';
import { inputClass } from '../components/fields';
import { CreatureStatblock } from './CreatureStatblock';
import { crText } from './creature-format';

const KIND_LABEL = {
  condition: 'Condition',
  spell: 'Spell',
  feature: 'Feature',
  item: 'Item',
  class: 'Class',
  subclass: 'Subclass',
  race: 'Race',
  background: 'Background',
  creature: 'Creature',
} as const;

/** Name search over bundled 2014 data, limited to the campaign's books inside a character. Conditions show their rules text; the rest show where they come from. */
export function RulesSearch() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const { characterId = '' } = useParams();
  // Inside a character, only the books its campaign uses; outside, everything bundled.
  const books = useStore(
    characterStore,
    (state) => characterState(state, characterId)?.campaign.sources,
  );
  const hits = searchRules(registry, query, undefined, books);
  const searching = query.trim() !== '';

  return (
    <section aria-labelledby="reference-search" className="flex min-w-0 flex-col gap-3">
      <h2 id="reference-search" className="text-base font-semibold">
        Search rules
      </h2>
      <input
        type="search"
        aria-label="Search rules"
        placeholder="Conditions, spells, items, creatures…"
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
              {hit.kind === 'creature' && <CreatureHit id={hit.id} />}
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

function CreatureHit({ id }: { id: string }) {
  const creature = registry.get('creature', id);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-sm text-text-muted">
        CR {crText(creature.cr)} · AC {creature.ac} · HP {creature.hp}. Show statblock
      </summary>
      <CreatureStatblock creature={creature} />
    </details>
  );
}
