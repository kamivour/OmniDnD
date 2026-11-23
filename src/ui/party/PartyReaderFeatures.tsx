import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { featuresModel, type FeatureEntry } from '../features/features-model';
import { ReaderRow, ReaderSection } from './ReaderSection';

function usesText({ ownPool, sharedPool }: FeatureEntry) {
  if (ownPool) return `${Math.max(0, ownPool.max - ownPool.used)}/${ownPool.max} left`;
  if (sharedPool) return `${sharedPool.remaining}/${sharedPool.max} ${sharedPool.name} left`;
}

export function PartyReaderFeatures({
  state,
  sheet,
  references,
}: {
  state: CharacterState;
  sheet: Sheet;
  references: Registry;
}) {
  const groups = featuresModel(state, sheet, references).map((group) => ({
    ...group,
    rows: group.entries.map((entry) => ({
      key: `${group.origin}:${entry.from}:${entry.id}`,
      entry,
    })),
  }));
  const entries = new Map(
    groups.flatMap(({ rows }) => rows.map(({ key, entry }) => [key, entry] as const)),
  );
  return (
    <ReaderSection
      id="features"
      label="Features"
      detail={(id) => {
        const entry = entries.get(id);
        if (!entry) return;
        return {
          title: entry.name,
          body: (
            <div className="grid gap-3 text-sm">
              <p className="text-text-muted">
                {[entry.from, entry.activation, entry.die, usesText(entry)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {entry.ownPool && (
                <p className="text-text-muted">Recharge · {entry.ownPool.recharge}</p>
              )}
              {entry.trigger && <p>{entry.trigger}</p>}
              {entry.lines.length > 0 ? (
                <Markdown text={entry.lines.join('\n\n')} />
              ) : (
                <p className="text-text-muted">See the rule source for details.</p>
              )}
            </div>
          ),
        };
      }}
    >
      {(open, selected) => (
        <>
          {entries.size === 0 && <p className="text-sm text-text-muted">No features recorded.</p>}
          {groups.map(({ origin, title, rows }) => (
            <div key={origin} className="grid gap-1.5">
              <h3 className="text-sm font-semibold">{title}</h3>
              {rows.map(({ key, entry }) => (
                <ReaderRow
                  key={key}
                  id={key}
                  name={entry.name}
                  selected={selected}
                  open={open}
                  icon={<Icon id={entry.id} fallback="catalog.medal" className="text-accent" />}
                  meta={[entry.from, entry.activation, usesText(entry)].filter(Boolean).join(' · ')}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </ReaderSection>
  );
}
