import { SectionLabel } from '../components/SectionLabel';
import type { RestChange } from './rest-model';

/** Both rest forms present the engine result before the player spends or restores anything. */
export function RestPreview({
  duration,
  result,
  changes,
  warnings = [],
}: {
  duration: string;
  result: { result: 'ok' | 'warn' | 'blocked'; reasons: string[] };
  changes: RestChange[];
  warnings?: string[];
}) {
  return (
    <section
      aria-label="Rest preview"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <SectionLabel>Rest preview · +{duration}</SectionLabel>
      {warnings.length > 0 && (
        <div role="note" className="text-sm text-warn">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <p>Apply will ask you to confirm this exception.</p>
        </div>
      )}
      {result.result === 'ok' ? (
        <dl className="flex flex-col gap-3">
          {changes.map((change, index) => (
            <div key={index} className="min-w-0 text-sm">
              <dt className="wrap-anywhere text-text-muted">{change.label}</dt>
              <dd
                className={`wrap-anywhere ${change.before === change.after ? 'text-text-muted' : 'text-text'}`}
              >
                {change.before} <span aria-label="becomes">→</span> {change.after}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul role="alert" className="list-disc space-y-1 pl-4 text-sm text-warn">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
