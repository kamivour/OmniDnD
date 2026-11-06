import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { storageStatusStore } from '../../state/persistence';
import { armorEquipmentNotes } from '../../engine/calc/equipment';
import { Icon } from '../components/Icon';
import { Preview } from '../components/Preview';
import { useCharacter } from '../hooks/useCharacter';
import {
  InventoryItemCard,
  InventoryItemControls,
  LiveInventoryItemDetail,
} from '../inventory/InventoryItemDetails';
import { inventoryGroups } from '../inventory/inventory-model';
import { InventoryEditor, type InventoryEditorRequest } from '../inventory/InventoryEditor';
import { InventoryCurrency } from '../inventory/InventoryCurrency';
import { InventoryWeight } from '../inventory/InventoryWeight';
import { InventoryAttunement } from '../inventory/InventoryAttunement';
import { InventoryRechargesDue } from '../inventory/InventoryCharges';
import { useDetail } from '../layout/detail-context';

/** Instance identity and live counts are shared with equipment calculations and character exports. */
export function InventoryScreen() {
  const { state, sheet } = useCharacter();
  const { pin } = useDetail();
  const [editor, setEditor] = useState<InventoryEditorRequest | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const conflict = useStore(storageStatusStore, (status) => status.conflict);
  const groups = inventoryGroups(state, registry);
  const notes = armorEquipmentNotes(state, registry, sheet);
  return (
    <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-6 px-4 py-4 lg:px-6">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl">Inventory</h1>
          <button
            ref={addButton}
            type="button"
            disabled={conflict}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setEditor({ kind: 'add', instanceId: crypto.randomUUID() });
            }}
            className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
          >
            Add item
          </button>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          Record your actual equipment. Track armor time and actions with the Game Clock and Combat
          economy controls.
        </p>
      </header>
      {notes.length > 0 && (
        <section
          aria-label="Equipment notes"
          className="rounded-card border border-border bg-surface p-3 text-sm text-warn"
        >
          <ul className="list-disc space-y-2 pl-4">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid min-w-0 gap-3 @min-[680px]:grid-cols-2">
        <InventoryCurrency />
        <InventoryWeight />
      </div>
      <InventoryRechargesDue />
      <InventoryAttunement />
      {groups.length === 0 ? (
        <h2 className="text-base font-semibold">No items recorded</h2>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-label={group.name} className="flex min-w-0 flex-col gap-3">
            <h2 className="font-display text-base wrap-anywhere">{group.name}</h2>
            {group.notice && <p className="text-sm text-warn">{group.notice}</p>}
            <div className="grid min-w-0 gap-3 @min-[680px]:grid-cols-2">
              {group.items.map((item) => (
                <article
                  key={item.instanceId}
                  aria-label={item.def.name}
                  data-instance-id={item.instanceId}
                  className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3"
                >
                  <Preview
                    title={item.def.name}
                    content={<InventoryItemCard item={item} />}
                    onPin={() => pin(<LiveInventoryItemDetail instanceId={item.instanceId} />)}
                    sheetFooter={<InventoryItemControls instanceId={item.instanceId} />}
                  >
                    {({ ref, props }) => (
                      <button
                        ref={ref}
                        {...props}
                        type="button"
                        aria-label={`Details: ${item.def.name}`}
                        className="flex min-h-11 min-w-0 items-center gap-2 text-left font-semibold text-text hover:text-accent"
                      >
                        <Icon id={item.def.id} size={20} />
                        <span className="wrap-anywhere">{item.def.name}</span>
                      </button>
                    )}
                  </Preview>
                  <p className="text-xs text-text-muted">
                    {item.def.category}
                    {item.attuned ? ' · Attuned' : ''}
                    {/* Catalogue charges show in the item controls below. */}
                    {item.charges === undefined || item.def.charges
                      ? ''
                      : ` · ${item.charges} charges`}
                  </p>
                  {item.notes && (
                    <p className="whitespace-pre-line text-sm wrap-anywhere">{item.notes}</p>
                  )}
                  {item.locationNote && <p className="text-sm text-warn">{item.locationNote}</p>}
                  <InventoryItemControls instanceId={item.instanceId} />
                  <button
                    type="button"
                    aria-label={`Edit: ${item.def.name}`}
                    disabled={conflict}
                    onClick={(event) => {
                      opener.current = event.currentTarget;
                      setEditor({ kind: 'edit', instanceId: item.instanceId });
                    }}
                    className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
                  >
                    Edit
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
      {editor && (
        <InventoryEditor
          key={`${editor.kind}:${editor.instanceId}`}
          request={editor}
          onClose={() => setEditor(null)}
          returnFocusTo={() =>
            opener.current?.isConnected && !opener.current.matches(':disabled')
              ? opener.current
              : addButton.current
          }
        />
      )}
    </div>
  );
}
