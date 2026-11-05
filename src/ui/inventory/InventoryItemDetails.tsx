import { useRef } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { armorReplacements } from '../../engine/calc/equipment';
import { adjustItemQuantity, equipItem, type Command } from '../../engine/commands';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { Icon } from '../components/Icon';
import { useCharacter } from '../hooks/useCharacter';
import { inventoryItem, type InventoryItem } from './inventory-model';

const button =
  'grid min-h-11 min-w-11 place-items-center rounded-btn border border-border text-text hover:bg-surface-2 disabled:opacity-40';

function useInventoryItem(instanceId: string) {
  const { state, sheet } = useCharacter();
  const item = inventoryItem(state, registry, instanceId);
  return { state, sheet, item };
}

/** Read-only content also works inside the shared hover tooltip. */
export function InventoryItemCard({ item }: { item: InventoryItem }) {
  const { def } = item;
  const summary = def.summary?.effect ?? def.fullText;
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="flex items-start gap-2">
        <Icon id={def.id} size={20} />
        <div className="min-w-0">
          <h3 className="wrap-anywhere font-semibold text-text">{def.name}</h3>
          <p className="text-xs text-text-muted">
            {def.category} · {def.source}
          </p>
        </div>
      </div>
      {summary && <p className="whitespace-pre-line wrap-anywhere text-text">{summary}</p>}
      {item.notes && <p className="whitespace-pre-line wrap-anywhere">{item.notes}</p>}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <dt className="text-text-muted">Quantity</dt>
        <dd>{item.quantity}</dd>
        <dt className="text-text-muted">Equipment</dt>
        <dd>
          {item.equipped
            ? item.quantity > 0
              ? 'Equipped'
              : 'Marked equipped · quantity 0'
            : 'Not equipped'}
        </dd>
        <dt className="text-text-muted">Weight</dt>
        <dd>
          {def.weight === undefined
            ? 'Not recorded'
            : `${def.weight} lb${def.bundle ? ` per ${def.bundle}` : ''}`}
        </dd>
        {def.armor && (
          <>
            <dt className="text-text-muted">Armor</dt>
            <dd>
              {def.armor.category} · base AC {def.armor.baseAc}
            </dd>
          </>
        )}
        {def.weapon && (
          <>
            <dt className="text-text-muted">Weapon</dt>
            <dd className="wrap-anywhere">
              {def.weapon.type} · {def.weapon.properties.join(', ') || 'No special properties'}
            </dd>
          </>
        )}
        {item.attuned && (
          <>
            <dt className="text-text-muted">Attunement</dt>
            <dd>Attuned</dd>
          </>
        )}
        {item.charges !== undefined && (
          <>
            <dt className="text-text-muted">Recorded charges</dt>
            <dd>{item.charges}</dd>
          </>
        )}
      </dl>
      {def.bundle && (
        <p className="text-xs text-text-muted">
          Quantity counts individual items. Purchase bundle: {def.bundle}.
        </p>
      )}
      {item.locationNote && <p className="text-warn">{item.locationNote}</p>}
    </div>
  );
}

/** Both the list and live detail dispatch the same commands; previews never write state. */
export function InventoryItemControls({ instanceId }: { instanceId: string }) {
  const { state, sheet, item } = useInventoryItem(instanceId);
  const { run } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const controls = useRef<HTMLDivElement>(null);
  if (!item) return <p className="text-sm text-text-muted">This item is no longer recorded.</p>;
  const fallback = () =>
    controls.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
  const apply = <P,>(command: Command<P>, payload: P) => {
    const focused = document.activeElement;
    run(command, payload, fallback, () => {
      requestAnimationFrame(() => {
        if (
          focused instanceof HTMLElement &&
          focused.matches(':disabled') &&
          (document.activeElement === document.body || document.activeElement === focused)
        )
          fallback()?.focus();
      });
    });
  };
  const replacements = armorReplacements(state, registry, instanceId);
  const checks =
    equipItem.check?.(
      { ...state, sheet, registry },
      {
        instanceId,
        equipped: !item.equipped,
      },
    ) ?? [];
  return (
    <div ref={controls} className="flex min-w-0 flex-col gap-2">
      <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
        <button
          type="button"
          aria-label={`Remove one: ${item.def.name}`}
          disabled={conflict || item.quantity === 0}
          onClick={() => apply(adjustItemQuantity, { instanceId, quantity: item.quantity - 1 })}
          className={button}
        >
          −
        </button>
        <output
          aria-label={`Quantity: ${item.def.name}`}
          className="min-w-0 text-center text-sm tabular-nums wrap-anywhere"
        >
          {item.quantity}
        </output>
        <button
          type="button"
          aria-label={`Add one: ${item.def.name}`}
          disabled={conflict || item.quantity === Number.MAX_SAFE_INTEGER}
          onClick={() => apply(adjustItemQuantity, { instanceId, quantity: item.quantity + 1 })}
          className={button}
        >
          +
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          aria-label={`Equipped: ${item.def.name}`}
          checked={item.equipped}
          disabled={conflict || (item.quantity === 0 && !item.equipped)}
          onChange={(event) => apply(equipItem, { instanceId, equipped: event.target.checked })}
          className="size-4 accent-(--omni-accent)"
        />
        {item.equipped && item.quantity === 0 ? 'Marked equipped · quantity 0' : 'Equipped'}
      </label>
      {!item.equipped && replacements.length > 0 && (
        <p className="text-xs text-text-muted">
          Equipping replaces {replacements.map(({ def }) => def.name).join(', ')}.
        </p>
      )}
      {checks
        .filter((check) => check.level === 'info')
        .map(({ reason }) => (
          <p key={reason} className="text-xs text-text-muted">
            {reason}
          </p>
        ))}
    </div>
  );
}

export function LiveInventoryItemDetail({ instanceId }: { instanceId: string }) {
  const { item } = useInventoryItem(instanceId);
  if (!item) return <p className="text-sm text-text-muted">This item is no longer recorded.</p>;
  return (
    <div className="flex flex-col gap-4">
      <InventoryItemCard item={item} />
      <InventoryItemControls instanceId={instanceId} />
    </div>
  );
}
