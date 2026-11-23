import { useState } from 'react';
import type { CharacterState } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { containerLoads } from '../../engine/calc/inventory-weight';
import { entryFacts } from '../compendium/compendium-facts';
import { CompendiumArt } from '../compendium/CompendiumArt';
import { CompendiumFacts } from '../compendium/CompendiumDetail';
import {
  inventoryGroups,
  itemCountText,
  regainText,
  type InventoryItem,
} from '../inventory/inventory-model';
import { Markdown } from '../components/Markdown';
import { inputClass } from '../components/fields';
import { ReaderRow, ReaderSection, type OpenReaderDetail } from './ReaderSection';

function itemState(item: InventoryItem) {
  const { def, quantity, charges } = item;
  return [
    def.unit ? itemCountText(quantity, def) : `×${quantity}`,
    item.equipped && quantity > 0 && 'Equipped',
    item.attuned && 'Attuned',
    charges !== undefined && `${charges}${def.charges ? `/${def.charges.max}` : ''} charges`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function PartyReaderInventory({
  state,
  references,
}: {
  state: CharacterState;
  references: Registry;
}) {
  const [search, setSearch] = useState('');
  const [equipped, setEquipped] = useState(false);
  const query = search.trim().toLocaleLowerCase();
  const groups = inventoryGroups(state, references, { includeNotes: false });
  const items = new Map(
    groups.flatMap((group) =>
      group.items.map((item) => [item.instanceId, { item, path: group.name }] as const),
    ),
  );
  const matches = (item: InventoryItem) =>
    item.def.name.toLocaleLowerCase().includes(query) &&
    (!equipped || (item.equipped && item.quantity > 0));
  const visible = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.quantity > 0 && matches(item)),
    }))
    .filter((group) => group.items.length > 0);
  const depleted = [...items.values()].filter(({ item }) => item.quantity === 0 && matches(item));
  const row = (item: InventoryItem, open: OpenReaderDetail, selected?: string, path?: string) => (
    <ReaderRow
      key={item.instanceId}
      id={item.instanceId}
      name={item.def.name}
      selected={selected}
      open={open}
      icon={<CompendiumArt entry={item.def} />}
      meta={[itemState(item), path].filter(Boolean).join(' · ')}
    />
  );

  return (
    <ReaderSection
      id="inventory"
      label="Inventory"
      detail={(id) => {
        const found = items.get(id);
        if (!found) return;
        const { item, path } = found;
        const { def } = item;
        const facts = entryFacts(def, references);
        const capacity =
          def.storage &&
          containerLoads(state, references).find(({ instanceId }) => instanceId === id);
        const description = def.summary?.effect ?? def.fullText;
        return {
          title: def.name,
          body: (
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-3">
                <CompendiumArt entry={def} large />
                <div className="min-w-0">
                  <p className="font-medium">{itemState(item)}</p>
                  <p className="text-xs text-text-muted wrap-anywhere">
                    {path} · {def.source}
                  </p>
                </div>
              </div>
              {item.locationNote && <p className="text-warn">{item.locationNote}</p>}
              {description && <Markdown text={description} />}
              <CompendiumFacts {...facts} />
              {capacity && (
                <p className="text-text-muted">
                  Contents weigh {capacity.pounds}
                  {capacity.capacityPounds === undefined ? '' : ` / ${capacity.capacityPounds}`} lb
                  {capacity.unknown > 0 ? ' plus unrecorded weight' : ''}
                  {capacity.cubicFeet === undefined
                    ? ''
                    : ` · Capacity ${capacity.cubicFeet} cu ft`}
                </p>
              )}
              {def.charges && <p className="text-text-muted">{regainText(def.charges)}</p>}
            </div>
          ),
        };
      }}
    >
      {(open, selected) => (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-40 flex-1 gap-1 text-xs text-text-muted">
              Search inventory
              <input
                type="search"
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              aria-pressed={equipped}
              onClick={() => setEquipped(!equipped)}
              className="min-h-11 rounded-btn border border-border px-3 text-sm aria-pressed:border-accent aria-pressed:text-accent"
            >
              Equipped
            </button>
          </div>
          {visible.length === 0 && depleted.length === 0 && (
            <p className="text-sm text-text-muted">
              {items.size ? 'No items match your filters.' : 'No items recorded.'}
            </p>
          )}
          {visible.map((group) =>
            group.id === 'carried' ? (
              <div className="grid gap-1.5" key={group.id}>
                <h3 className="text-sm font-semibold">Carried</h3>
                {group.items.map((item) => row(item, open, selected))}
              </div>
            ) : (
              <details
                open={query || equipped ? true : undefined}
                key={group.id}
                className="min-w-0 rounded-btn border border-border px-2"
              >
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold wrap-anywhere">
                  {group.name}{' '}
                  <span className="font-normal text-text-muted">· {group.items.length}</span>
                </summary>
                <div className="grid gap-1.5 pb-2">
                  {group.notice && <p className="text-xs text-warn">{group.notice}</p>}
                  {group.items.map((item) =>
                    row(item, open, selected, query ? group.name : undefined),
                  )}
                </div>
              </details>
            ),
          )}
          {depleted.length > 0 && (
            <details
              open={query ? true : undefined}
              className="rounded-btn border border-border px-2"
            >
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                Depleted · {depleted.length}
              </summary>
              <div className="grid gap-1.5 pb-2">
                {depleted.map(({ item, path }) => row(item, open, selected, path))}
              </div>
            </details>
          )}
        </>
      )}
    </ReaderSection>
  );
}
