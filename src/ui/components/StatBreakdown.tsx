import type { Stat } from '../../engine/calc/stat';
import { signed } from '../format';

/** Additive contributions and engine-owned formula notes for a computed value. */
export function StatBreakdown({ stat }: { stat: Stat }) {
  return (
    <div tabIndex={0} className="flex min-w-0 flex-col gap-2 text-sm">
      <dl>
        <div className="mb-2 flex justify-between gap-3 font-semibold">
          <dt>Total</dt>
          <dd>{stat.value}</dd>
        </div>
        {stat.parts.map((part, index) => (
          <div
            key={`${part.label}-${index}`}
            className="flex min-h-8 items-center justify-between gap-3 text-text-muted"
          >
            <dt className="wrap-anywhere">{part.label}</dt>
            <dd className="shrink-0">{signed(part.value)}</dd>
          </div>
        ))}
      </dl>
      {stat.notes?.map((note, index) => (
        <p key={index} className="wrap-anywhere text-text-muted">
          {note}
        </p>
      ))}
    </div>
  );
}
