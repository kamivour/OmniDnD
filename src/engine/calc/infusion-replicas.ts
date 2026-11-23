import type { Registry } from '../registry';
import type { ItemDef } from '../schema';
import { COMMON_REPLICA_PREFIX, REPLICATE_RECIPES, magicalItem } from './infusions';

const normalize = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Resolve the bundled magic item described by a known replica recipe. */
export function replicaItem(registry: Registry, featureId: string): ItemDef | undefined {
  const { entries } = registry.base ?? registry;
  if (featureId.startsWith(COMMON_REPLICA_PREFIX)) {
    const item = entries.get(`item.${featureId.slice(COMMON_REPLICA_PREFIX.length)}`);
    return item?.kind === 'item' ? item : undefined;
  }

  const recipe = REPLICATE_RECIPES.find(({ id }) => id === featureId);
  if (!recipe) return undefined;

  // The SRD publishes Quiver of Ehlonna as Efficient Quiver.
  const name = normalize(recipe.name === 'Quiver of Ehlonna' ? 'Efficient Quiver' : recipe.name);
  let found: ItemDef | undefined;
  for (const entry of entries.values()) {
    if (entry.kind !== 'item' || normalize(entry.name) !== name) continue;
    if (found) return undefined;
    found = entry;
  }
  return found;
}

/** Known mechanical types must match. The table confirms each recipe's specific object. */
export function replicaFits(replica: ItemDef, base: ItemDef): boolean {
  if (magicalItem(base)) return false;
  if (replica.armor) return replica.armor.category === base.armor?.category;
  if (replica.weapon)
    return (
      replica.weapon.category === base.weapon?.category && replica.weapon.type === base.weapon.type
    );
  if (replica.category === 'container' || base.category === 'container')
    return replica.category === base.category;
  return !base.armor && !base.weapon;
}
