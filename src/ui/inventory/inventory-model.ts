import type { CharacterState } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import type { ItemDef } from '../../engine/schema';

export interface InventoryItem {
  instanceId: string;
  def: ItemDef;
  notes?: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  charges?: number;
  locationNote?: string;
}

export interface InventoryGroup {
  id: string;
  name: string;
  notice?: string;
  items: InventoryItem[];
}

type InventoryState = Pick<CharacterState, 'build' | 'live'>;
type OwnedItem = InventoryState['build']['items'][number];
type ResolvedItem = { owned: OwnedItem; item: InventoryItem };

function resolveItem(owned: OwnedItem, state: InventoryState, registry: Registry): InventoryItem {
  const live = state.live.items[owned.instanceId];
  return {
    instanceId: owned.instanceId,
    def: registry.get('item', owned.itemId),
    ...(owned.notes === undefined ? {} : { notes: owned.notes }),
    quantity: live?.qty ?? 0,
    equipped: live?.equipped ?? false,
    attuned: live?.attuned ?? false,
    ...(live?.charges === undefined ? {} : { charges: live.charges }),
  };
}

/** Resolve current item fields without rebuilding container groups for each live control. */
export function inventoryItem(
  state: InventoryState,
  registry: Registry,
  instanceId: string,
): InventoryItem | undefined {
  const owned = state.build.items.find((entry) => entry.instanceId === instanceId);
  return owned ? resolveItem(owned, state, registry) : undefined;
}

/** Presentation only: keep recorded quantities, flags, notes and immediate container links. */
export function inventoryGroups(state: InventoryState, registry: Registry): InventoryGroup[] {
  const entries: ResolvedItem[] = state.build.items.map((owned) => ({
    owned,
    item: resolveItem(owned, state, registry),
  }));
  const byId = new Map(entries.map((entry) => [entry.owned.instanceId, entry]));
  const containers = entries.filter(({ item }) => item.def.category === 'container');
  const baseName = ({ owned, item }: ResolvedItem) =>
    [item.def.name, owned.notes?.trim()].filter(Boolean).join(' · ');
  const nameCounts = new Map<string, number>();
  for (const container of containers) {
    const name = baseName(container);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const nameOrder = new Map<string, number>();
  const names = new Map(
    containers.map((container) => {
      const base = baseName(container);
      const ordinal = (nameOrder.get(base) ?? 0) + 1;
      nameOrder.set(base, ordinal);
      return [
        container.owned.instanceId,
        nameCounts.get(base) === 1 ? base : `${base} (${ordinal})`,
      ];
    }),
  );
  const carried: InventoryGroup = { id: 'carried', name: 'Carried', items: [] };
  const review: InventoryGroup = {
    id: 'review-container-links',
    name: 'Review container links',
    notice: 'Container links stay as recorded until you review them.',
    items: [],
  };
  const grouped = new Map<string, InventoryGroup>();

  for (const entry of entries) {
    const path: ResolvedItem[] = [];
    const visited = new Set([entry.owned.instanceId]);
    let current = entry;
    let locationNote: string | undefined;
    while (current.owned.container) {
      const parentId = current.owned.container;
      if (parentId === current.owned.instanceId) {
        locationNote = 'The recorded container path includes an item containing itself.';
        break;
      }
      if (visited.has(parentId)) {
        locationNote = 'The recorded container path is circular.';
        break;
      }
      const parent = byId.get(parentId);
      if (!parent) {
        locationNote = 'The recorded container path includes a missing container.';
        break;
      }
      if (parent.item.def.category !== 'container') {
        locationNote = 'The recorded container path includes an item that is not a container.';
        break;
      }
      visited.add(parentId);
      path.push(parent);
      current = parent;
    }

    if (locationNote) {
      review.items.push({ ...entry.item, locationNote });
    } else if (path.length === 0) {
      carried.items.push(entry.item);
    } else {
      const parentId = path[0]!.owned.instanceId;
      let group = grouped.get(parentId);
      if (!group) {
        group = {
          id: `container:${parentId}`,
          name: [...path]
            .reverse()
            .map(({ owned }) => names.get(owned.instanceId))
            .join(' › '),
          ...(path.some(({ item }) => item.quantity === 0)
            ? {
                notice:
                  'A container in this path has quantity 0. Its contents stay listed as recorded.',
              }
            : {}),
          items: [],
        };
        grouped.set(parentId, group);
      }
      group.items.push(entry.item);
    }
  }

  return [
    ...(carried.items.length ? [carried] : []),
    ...containers.flatMap(({ owned }) => {
      const group = grouped.get(owned.instanceId);
      return group ? [group] : [];
    }),
    ...(review.items.length ? [review] : []),
  ];
}
