import type { ReactNode } from 'react';
import type { CatalogEntry } from '../../engine/catalog';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
import { registry } from '../../data/registry';
import { entryFacts } from './compendium-facts';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { schoolIconId } from '../format';

const SUMMARY_LABELS = [
  ['fail', 'Fail'],
  ['success', 'Success'],
  ['hit', 'Hit'],
  ['upcast', 'Upcast'],
  ['scaling', 'Scaling'],
] as const;

/** Read-only page for one compendium entry: facts, then SRD text or our own summary. */
export function CompendiumDetail({
  entry,
  onOpen,
}: {
  entry: CatalogEntry;
  /** Opens another compendium entry (a subclass from its class, a granted spell). */
  onOpen: (id: string) => void;
}) {
  const summary = entry.summary;
  return (
    <article aria-label={entry.name} className="flex min-w-0 flex-col gap-3 text-sm">
      <header className="flex items-start gap-3">
        <Icon
          id={entry.iconId ?? entry.id}
          fallback={entry.kind === 'spell' ? schoolIconId(entry.school) : undefined}
          size={40}
          className="text-accent"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg wrap-anywhere">{entry.name}</h2>
          <p className="text-xs text-text-muted">
            {SOURCE_NAMES[entry.source]}
            {entry.srd ? ' · SRD 5.1' : ''}
          </p>
        </div>
      </header>
      <CompendiumFacts entry={entry} onOpen={onOpen} />
      {summary && (
        <Section title="Summary">
          <p>{summary.effect}</p>
          {SUMMARY_LABELS.map(([key, label]) =>
            summary[key] ? (
              <p key={key}>
                <span className="font-semibold">{label}:</span> {summary[key]}
              </p>
            ) : null,
          )}
        </Section>
      )}
      {entry.fullText ? (
        <Section title="Rules text (SRD 5.1)">
          <Markdown text={entry.fullText} />
        </Section>
      ) : (
        !summary &&
        !(entry.kind === 'item' && entry.rarity === undefined) && (
          <p className="text-text-muted">
            No summary yet. Check {SOURCE_NAMES[entry.source]} for the full rules.
          </p>
        )
      )}
    </article>
  );
}

/** Kind-specific facts, then lists such as features by level. */
function CompendiumFacts({ entry, onOpen }: { entry: CatalogEntry; onOpen: (id: string) => void }) {
  const { facts, lists } = entryFacts(entry, registry);
  return (
    <>
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border pt-3">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-text-muted">{label}</dt>
              <dd className="wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {lists.map((list) => (
        <Section key={list.title} title={list.title}>
          <ul className="flex flex-col gap-0.5">
            {list.items.map((item, i) => (
              <li key={`${item.id ?? item.label}-${i}`} className="flex items-baseline gap-2">
                {item.level !== undefined && (
                  <span className="w-12 shrink-0 text-xs text-text-muted">Lv {item.level}</span>
                )}
                {item.id ? (
                  <button
                    type="button"
                    onClick={() => onOpen(item.id!)}
                    className="min-h-9 text-left text-accent underline"
                  >
                    {item.label}
                  </button>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}
