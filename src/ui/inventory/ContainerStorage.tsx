import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { containerLoads } from '../../engine/calc/inventory-weight';
import { editInventoryItem } from '../../engine/commands';
import { storageStatusStore } from '../../state/persistence';
import { useCommand } from '../commands/command-context';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { containerOptions } from './inventory-editor-model';
import { inventoryItem, itemCountText } from './inventory-model';

/** Fill level, contents and "Put in…" for a container with a recorded capacity (M44 T6). */
export function ContainerStorage({ instanceId }: { instanceId: string }) {
  const { state } = useCharacter();
  const { run, warningOpen } = useCommand();
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const load = containerLoads(state, registry).find((entry) => entry.instanceId === instanceId);
  const self = inventoryItem(state, registry, instanceId);
  if (!load || !self) return null;
  const storage = self.def.storage!;
  const inside = state.build.items.filter((item) => item.container === instanceId).length;
  const candidates = open
    ? state.build.items.flatMap(({ instanceId: id, container }) => {
        if (id === instanceId || container === instanceId) return [];
        const item = inventoryItem(state, registry, id);
        const fits = containerOptions(state, registry, { movingInstanceId: id }).some(
          (option) => option.value === instanceId,
        );
        return item && fits ? [item] : [];
      })
    : [];
  const filled =
    load.capacityPounds === undefined
      ? 0
      : Math.min(100, (Number(load.pounds) / load.capacityPounds) * 100);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="tabular-nums">
        {load.capacityPounds === undefined
          ? `Holds ${load.approximate ? '≈ ' : ''}${load.pounds} lb`
          : `Holds ${load.approximate ? '≈ ' : ''}${load.pounds} of ${load.capacityPounds} lb`}
        {load.cubicFeet === undefined ? '' : ` · up to ${load.cubicFeet} cu ft`}
        {` · ${inside} ${inside === 1 ? 'item' : 'items'} inside`}
      </p>
      {load.capacityPounds !== undefined && (
        <div
          role="meter"
          aria-label={`${self.def.name} fill`}
          aria-valuemin={0}
          aria-valuemax={load.capacityPounds}
          aria-valuenow={Math.min(Number(load.pounds), load.capacityPounds)}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={load.overCapacity ? 'h-full bg-hp' : 'h-full bg-accent'}
            style={{ width: `${filled}%` }}
          />
        </div>
      )}
      {storage.spaces && (
        <p className="text-xs text-text-muted">
          {storage.spaces.map((space) => `${space.name} ${space.pounds} lb`).join(' · ')}. Keep each
          pouch within its own limit.
        </p>
      )}
      {load.extradimensional && (
        <p className="text-xs text-text-muted">Contents add no carried weight.</p>
      )}
      {load.unknown > 0 && (
        <p className="text-xs text-warn">
          {load.unknown} {load.unknown === 1 ? 'record' : 'records'} inside{' '}
          {load.unknown === 1 ? 'has' : 'have'} no weight, so the fill may be higher.
        </p>
      )}
      {load.overCapacity && (
        <p role="note" className="text-warn">
          Over capacity. An overloaded {self.def.name} can rupture; ask your DM. Nothing is removed
          automatically.
        </p>
      )}
      <button
        ref={button}
        type="button"
        disabled={conflict || warningOpen}
        aria-label={`Put in ${self.def.name}`}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
      >
        Put in…
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Put in ${self.def.name}`}
        description="Pick an item to move inside."
      >
        {candidates.length === 0 ? (
          <p className="text-sm text-text-muted">No other items can go inside.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {candidates.map((item) => (
              <li key={item.instanceId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    run(
                      editInventoryItem,
                      {
                        instanceId: item.instanceId,
                        quantity: item.quantity,
                        container: instanceId,
                      },
                      () => button.current,
                    );
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-btn border border-border px-3 text-left text-sm"
                >
                  <span className="min-w-0 wrap-anywhere">
                    {item.def.name}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </span>
                  <span className="shrink-0 text-text-muted tabular-nums">
                    {itemCountText(item.quantity, item.def)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
