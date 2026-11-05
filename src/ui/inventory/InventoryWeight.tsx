import { registry } from '../../data/registry';
import { currencyTotals } from '../../engine/calc/currency';
import { inventoryWeight } from '../../engine/calc/inventory-weight';
import { sheetBreakdowns } from '../../engine/calc/sheet-breakdowns';
import { StatChip } from '../components/StatChip';
import { useCharacter } from '../hooks/useCharacter';

const pounds = (value: string, approximate = false) => `${approximate ? '≈ ' : ''}${value} lb`;

/** Every record contributes once; missing reference weights never become a claimed total. */
export function InventoryWeight() {
  const { state, sheet } = useCharacter();
  const weight = inventoryWeight(state, registry, sheet.carryingCapacity);
  const capacity = sheetBreakdowns(state, sheet, registry).carryingCapacity;
  const notes = new Map(state.build.items.map((item) => [item.instanceId, item.notes]));
  const coins = currencyTotals(state.live.currency).coins.toString();
  return (
    <section
      aria-label="Carried weight"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <h2 className="text-sm font-semibold">Carried weight</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex min-w-0 justify-between gap-3">
          <dt className="text-text-muted">Known item weight</dt>
          <dd className="text-right tabular-nums wrap-anywhere">
            {pounds(weight.itemPounds, weight.itemApproximate)}
          </dd>
        </div>
        <div className="flex min-w-0 justify-between gap-3">
          <dt className="text-text-muted">Coin weight</dt>
          <dd className="text-right tabular-nums wrap-anywhere">{pounds(weight.coinPounds)}</dd>
        </div>
        <div className="flex min-w-0 justify-between gap-3">
          <dt className="text-text-muted">Known carried weight</dt>
          <dd className="text-right font-semibold tabular-nums wrap-anywhere">
            {pounds(weight.knownPounds, weight.approximate)}
          </dd>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <dt className="text-text-muted">Carrying capacity</dt>
          <dd className="min-w-0 text-right">
            <StatChip
              label=""
              value={`${sheet.carryingCapacity} lb`}
              stat={capacity}
              breakdownLabel="Carrying capacity"
            />
          </dd>
        </div>
      </dl>
      {!weight.complete && (
        <div role="note" className="flex flex-col gap-2 text-sm text-warn">
          <p>
            Incomplete weight: {weight.unknown.length} item{' '}
            {weight.unknown.length === 1 ? 'record has' : 'records have'} no recorded weight.
          </p>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center">
              Items without recorded weights
            </summary>
            <ul className="list-disc space-y-2 pl-4">
              {weight.unknown.map((item) => (
                <li key={item.instanceId} className="wrap-anywhere">
                  {item.name} ×{item.quantity}
                  {notes.get(item.instanceId) ? ` · ${notes.get(item.instanceId)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {weight.overCapacity === true && (
        <p role="note" className="text-sm text-warn">
          Known weight exceeds carrying capacity. Review the load with your DM.
        </p>
      )}
      {weight.overCapacity === false && (
        <p className="text-xs text-text-muted">Recorded weight is within carrying capacity.</p>
      )}
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-accent">
          Weight breakdown
        </summary>
        <ul className="list-disc space-y-2 pl-4">
          {weight.knownItems.map((item) => (
            <li key={item.instanceId} className="wrap-anywhere">
              {item.name} ×{item.quantity}
              {notes.get(item.instanceId) ? ` · ${notes.get(item.instanceId)}` : ''}:{' '}
              {pounds(item.pounds, item.approximate)}
            </li>
          ))}
          <li className="wrap-anywhere">
            {coins} coins at 50 coins per pound: {pounds(weight.coinPounds)}
          </li>
        </ul>
      </details>
      <p className="text-xs text-text-muted">
        ≈ marks a rounded display. Resolve movement limits at the table.
      </p>
    </section>
  );
}
