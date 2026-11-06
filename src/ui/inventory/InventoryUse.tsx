import { useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { consumeItem } from '../../engine/commands';
import { storageStatusStore } from '../../state/persistence';
import { inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';
import { inventoryItem, itemUseText, usableItems } from './inventory-model';
import { useItemRun } from './use-item-run';
import { parseWholeCount } from './whole-count';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';

/**
 * Use up one item. Healing on yourself takes your entered roll; other outcomes stay at the table.
 * Inventory and the Combat Items tab share these controls and the same command.
 */
export function ItemUseControls({ instanceId }: { instanceId: string }) {
  const { state } = useCharacter();
  const item = inventoryItem(state, registry, instanceId);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const container = useRef<HTMLDivElement>(null);
  const apply = useItemRun(container);
  const [roll, setRoll] = useState('');
  const [byAlly, setByAlly] = useState(false);
  const prefix = useId();
  const use = item?.def.use;
  if (!item || !use) return null;
  const { name } = item.def;
  const healing = use.healing;
  const value = parseWholeCount(roll);
  const disabled = conflict || item.quantity === 0;
  const base = { instanceId, expected: item.quantity };
  const done = () => {
    setRoll('');
    setByAlly(false);
  };
  return (
    <div
      ref={container}
      role="group"
      aria-label={`Use: ${name}`}
      className="flex min-w-0 flex-col gap-2 text-sm"
    >
      <p className="text-xs text-text-muted">{itemUseText(use)}</p>
      {healing && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor={`${prefix}-roll`} className="text-xs text-text-muted">
            {healing.dice} roll
          </label>
          <input
            id={`${prefix}-roll`}
            inputMode="numeric"
            value={roll}
            onChange={(event) => setRoll(event.target.value)}
            className={`${inputClass} max-w-20`}
          />
          <label className="flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={byAlly}
              onChange={(event) => setByAlly(event.target.checked)}
              className="size-4 accent-(--omni-accent)"
            />
            An ally gives it to me
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {healing ? (
          <button
            type="button"
            aria-label={`Drink: ${name}`}
            disabled={disabled || value === undefined}
            onClick={() =>
              apply(
                consumeItem,
                { ...base, target: 'self', roll: value, ...(byAlly && { byAlly: true }) },
                done,
              )
            }
            className={`${button} text-accent`}
          >
            Drink
          </button>
        ) : use.attack ? (
          <button
            type="button"
            aria-label={`Throw: ${name}`}
            disabled={disabled}
            onClick={() => apply(consumeItem, { ...base, target: 'other' })}
            className={`${button} text-accent`}
          >
            Throw
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Use 1: ${name}`}
            disabled={disabled}
            onClick={() => apply(consumeItem, { ...base, target: 'self' })}
            className={`${button} text-accent`}
          >
            Use 1
          </button>
        )}
        {use.activation === 'action' && !use.attack && (
          <button
            type="button"
            aria-label={`Give to another: ${name}`}
            disabled={disabled}
            onClick={() => apply(consumeItem, { ...base, target: 'other' }, done)}
            className={button}
          >
            Give to another
          </button>
        )}
      </div>
    </div>
  );
}

/** The Combat Items tab: every held item that can be used up, with the shared controls. */
export function CombatItems() {
  const { state } = useCharacter();
  const items = usableItems(state, registry);
  if (items.length === 0)
    return (
      <p className="text-sm text-text-muted">
        No usable items held. Add potions and other consumables in Inventory.
      </p>
    );
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.instanceId}>
          <article
            aria-label={item.def.name}
            className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3"
          >
            <h3 className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
              <span className="wrap-anywhere">
                {item.def.name}
                {item.notes && <span className="font-normal text-text-muted"> · {item.notes}</span>}
              </span>
              <span className="text-sm font-normal text-text-muted tabular-nums">
                × {item.quantity}
              </span>
            </h3>
            <ItemUseControls instanceId={item.instanceId} />
          </article>
        </li>
      ))}
    </ul>
  );
}
