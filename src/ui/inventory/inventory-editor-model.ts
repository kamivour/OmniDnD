import type { CharacterState } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { CUSTOM_ITEM_PREFIX, type ItemDef, type Source } from '../../engine/schema';
import { inventoryGroups } from './inventory-model';

/** Search small catalogue fields; large SRD descriptions remain available in item details. */
export function catalogueItems(
  registry: Registry,
  {
    search,
    category,
    sources,
  }: { search: string; category?: ItemDef['category']; sources?: readonly Source[] },
): ItemDef[] {
  const query = search.trim().toLowerCase();
  return [...registry.entries.values()]
    .filter(
      (entry): entry is ItemDef =>
        entry.kind === 'item' &&
        (category === undefined || entry.category === category) &&
        // DMG magic items are DM-awarded treasure, so campaign source filters never hide them (D116).
        (sources === undefined ||
          entry.source === 'DMG' ||
          entry.id.startsWith(CUSTOM_ITEM_PREFIX) ||
          sources.includes(entry.source)) &&
        (!query || `${entry.name} ${entry.summary?.effect ?? ''}`.toLowerCase().includes(query)),
    )
    .sort(
      (first, second) =>
        first.name.localeCompare(second.name, 'en', { sensitivity: 'base' }) ||
        first.id.localeCompare(second.id),
    );
}

/** Offer valid current destinations without changing or repairing any recorded locations. */
export function containerOptions(
  state: Pick<CharacterState, 'build' | 'live'>,
  registry: Registry,
  { movingInstanceId }: { movingInstanceId?: string } = {},
): { value: string; label: string }[] {
  const groups = inventoryGroups(state, registry);
  const items = new Map(
    groups.flatMap((group) =>
      group.items.map((item) => [item.instanceId, { item, group }] as const),
    ),
  );
  const containers = state.build.items.flatMap(({ instanceId }) => {
    const entry = items.get(instanceId);
    return entry?.item.def.category === 'container' ? [entry] : [];
  });
  const ownName = ({ item }: (typeof containers)[number]) =>
    [item.def.name, item.notes?.trim()].filter(Boolean).join(' · ');
  const counts = new Map<string, number>();
  containers.forEach((container) => {
    const name = ownName(container);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  const ordinals = new Map<string, number>();
  const labels = new Map(
    containers.map((container) => {
      const name = ownName(container);
      const ordinal = (ordinals.get(name) ?? 0) + 1;
      ordinals.set(name, ordinal);
      return [container.item.instanceId, counts.get(name) === 1 ? name : `${name} (${ordinal})`];
    }),
  );

  // This traversal only excludes the moving subtree. Path validity comes from inventoryGroups.
  const children = new Map<string, string[]>();
  for (const { instanceId, container } of state.build.items) {
    if (!container) continue;
    const entries = children.get(container) ?? [];
    entries.push(instanceId);
    children.set(container, entries);
  }
  const excluded = new Set<string>();
  if (movingInstanceId) {
    const pending = [movingInstanceId];
    excluded.add(movingInstanceId);
    for (let index = 0; index < pending.length; index += 1) {
      for (const child of children.get(pending[index]!) ?? []) {
        if (excluded.has(child)) continue;
        excluded.add(child);
        pending.push(child);
      }
    }
  }

  const groupNames = new Map(groups.map(({ id, name }) => [id, name]));
  const ownedById = new Map(state.build.items.map((item) => [item.instanceId, item]));
  // Grouping deliberately retains contents of quantity-zero containers. New destinations
  // additionally require every already-valid ancestor to be present, matching the command.
  const hasPresentPath = (instanceId: string) => {
    let current: string | undefined = instanceId;
    while (current) {
      if ((items.get(current)?.item.quantity ?? 0) <= 0) return false;
      current = ownedById.get(current)?.container;
    }
    return true;
  };
  return [
    { value: '', label: 'Carried' },
    ...containers.flatMap(({ item, group }) => {
      if (item.locationNote || excluded.has(item.instanceId) || !hasPresentPath(item.instanceId))
        return [];
      const label =
        groupNames.get(`container:${item.instanceId}`) ??
        [group.id === 'carried' ? undefined : group.name, labels.get(item.instanceId)]
          .filter(Boolean)
          .join(' › ');
      return [{ value: item.instanceId, label }];
    }),
  ];
}
