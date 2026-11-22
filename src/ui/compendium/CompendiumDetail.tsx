import { useState, type ReactNode } from 'react';
import { itemTier, type CatalogEntry } from '../../engine/catalog';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
import { registry } from '../../data/registry';
import { entryFacts, type EntryFacts } from './compendium-facts';
import { Markdown } from '../components/Markdown';
import { inputClass } from '../components/fields';
import { cx } from '../cx';
import { CompendiumArt } from './CompendiumArt';
import { WeaponProperties } from './WeaponProperties';
import { equipmentProfile } from './equipment-reference';
import { TIER_LABELS } from './compendium-model';

const ITEM_HEADER_FACTS = new Set(['Type', 'Rarity', 'Weapon', 'Armor', 'Base item', 'Attunement']);

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
  action,
  titleInSheet = false,
}: {
  entry: CatalogEntry;
  /** Opens another compendium entry (a subclass from its class, a granted spell). */
  onOpen: (id: string) => void;
  /** Shown under the header, e.g. "Plan this" inside a character. */
  action?: ReactNode;
  titleInSheet?: boolean;
}) {
  const [baseId, setBaseId] = useState('');
  const summary = entry.summary;
  const equipment = entry.kind === 'item' ? equipmentProfile(entry, registry, baseId) : undefined;
  const { facts, lists } = entryFacts(entry, registry, baseId);
  const itemFacts = entry.kind === 'item' ? new Map(facts) : undefined;
  const tier = entry.kind === 'item' ? itemTier(entry) : undefined;
  const weaponType = itemFacts?.get('Weapon');
  const itemType = weaponType
    ? `${weaponType} weapon`
    : (itemFacts?.get('Armor') ?? itemFacts?.get('Type'));
  const baseName = itemFacts?.get('Base item');
  const attunement = itemFacts?.get('Attunement');
  return (
    <article aria-label={entry.name} className="flex min-w-0 flex-col gap-4 text-sm">
      <header className={cx('flex items-center gap-4', !titleInSheet && 'pr-7')}>
        <CompendiumArt entry={entry} base={equipment?.base} large />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          {!titleInSheet && <h2 className="font-display text-lg wrap-anywhere">{entry.name}</h2>}
          {itemType && (
            <p className="text-sm font-medium">
              {itemType}
              {baseName && ` · ${baseName}`}
            </p>
          )}
          {tier && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span
                className="compendium-tier inline-flex items-center gap-1.5 rounded-btn border border-border px-2 py-0.5 font-semibold"
                data-tier={tier}
              >
                <span aria-hidden className="tier-dot size-1.5 rounded-full" /> {TIER_LABELS[tier]}
              </span>
              {attunement && (
                <span className="text-text-muted">
                  Attunement {attunement.replace(/^Required/, 'required')}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-text-muted">
            {SOURCE_NAMES[entry.source]}
            {entry.srd ? ' · SRD 5.1' : ''}
          </p>
          {entry.kind === 'item' && entry.url && (
            <a
              className="inline-flex min-h-11 items-center text-xs text-accent underline"
              href={entry.url}
              target="_blank"
              rel="noreferrer"
            >
              Book entry
            </a>
          )}
          {action}
        </div>
      </header>
      {equipment && equipment.bases.length > 1 && (
        <label className="flex flex-col gap-1.5 text-sm text-text-muted">
          Preview a base item
          <select
            className={inputClass}
            value={baseId}
            onChange={(event) => setBaseId(event.target.value)}
          >
            <option value="">Choose a base item</option>
            {equipment.bases.map(({ id, name }) => (
              <option value={id} key={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      <CompendiumFacts
        facts={itemFacts ? facts.filter(([label]) => !ITEM_HEADER_FACTS.has(label)) : facts}
        lists={lists}
        onOpen={onOpen}
      />
      {equipment?.reference?.note && (
        <p className="rounded-card border border-border bg-surface-2 p-3">
          {equipment.reference.note}
        </p>
      )}
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
        <Section
          title={
            entry.kind === 'item' && entry.rarity
              ? 'Magic effect (SRD 5.1)'
              : 'Rules text (SRD 5.1)'
          }
        >
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
function CompendiumFacts({
  facts,
  lists,
  onOpen,
}: EntryFacts & {
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {facts.length > 0 && (
        <dl className="grid min-w-0 grid-cols-2 gap-2">
          {facts.map(([label, value]) => {
            const wide = [
              'Properties',
              'Components',
              'Classes',
              'Languages',
              'Applies to',
            ].includes(label);
            return (
              <div
                key={label}
                className={cx(
                  'min-w-0 rounded-btn border border-border bg-surface-2 px-3 py-2',
                  wide && 'col-span-full',
                )}
              >
                <dt className="mb-0.5 text-xs text-text-muted">{label}</dt>
                <dd className="font-medium wrap-anywhere">
                  {label === 'Properties' ? (
                    <WeaponProperties key={value} properties={value.split(', ')} />
                  ) : (
                    value
                  )}
                </dd>
              </div>
            );
          })}
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
                    className="min-h-11 text-left text-accent underline"
                  >
                    {item.label}
                  </button>
                ) : item.detail ? (
                  <details className="min-w-0 flex-1 rounded-btn border border-border bg-surface-2 px-3">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium">
                      {item.label}
                    </summary>
                    <div className="pb-3">
                      <Markdown text={item.detail} />
                    </div>
                  </details>
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
