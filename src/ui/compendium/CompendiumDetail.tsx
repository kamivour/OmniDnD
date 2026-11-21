import type { ReactNode } from 'react';
import type { CatalogEntry } from '../../engine/catalog';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
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
export function CompendiumDetail({ entry, meta }: { entry: CatalogEntry; meta: string }) {
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
          {meta && <p className="text-text-muted">{meta}</p>}
          <p className="text-xs text-text-muted">
            {SOURCE_NAMES[entry.source]}
            {entry.srd ? ' · SRD 5.1' : ''}
          </p>
        </div>
      </header>
      <CompendiumFacts entry={entry} />
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
        !summary && (
          <p className="text-text-muted">
            No summary yet. Check {SOURCE_NAMES[entry.source]} for the full rules.
          </p>
        )
      )}
    </article>
  );
}

/** Kind-specific facts. */
function CompendiumFacts({ entry }: { entry: CatalogEntry }) {
  void entry;
  return null;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}
