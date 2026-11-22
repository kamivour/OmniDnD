import { characterRegistry, type Registry } from '../registry';
import type { CharacterBuild, ItemDef, LiveState } from '../schema';
import { parseDice } from './dice';
import type { Sheet } from './sheet';

export const DEDICATED_WEAPON = 'feature.tce.monk-dedicated-weapon';
export const MARTIAL_ARTS = 'feature.monk.martial-arts';

export function weaponProficient(def: ItemDef, weapons: readonly string[]): boolean {
  return (
    !!def.weapon &&
    weapons.some(
      (entry) => entry === def.weapon!.category || entry === def.id || entry === def.baseItemId,
    )
  );
}

export function canDedicateWeapon(def: ItemDef, weapons: readonly string[]): boolean {
  return (
    !!def.weapon &&
    !def.weapon.properties.includes('heavy') &&
    !def.weapon.properties.includes('special') &&
    weaponProficient(def, weapons)
  );
}

export function isMonkWeapon(def: ItemDef, dedicated: boolean): boolean {
  const weapon = def.weapon;
  if (!weapon) return false;
  return (
    dedicated ||
    def.id === 'item.shortsword' ||
    def.baseItemId === 'item.shortsword' ||
    (weapon.category === 'simple' &&
      weapon.type === 'melee' &&
      !weapon.properties.includes('two-handed') &&
      !weapon.properties.includes('heavy'))
  );
}

export function dedicatedWeaponOptions(
  build: CharacterBuild,
  live: Pick<LiveState, 'items'>,
  sheet: Pick<Sheet, 'features' | 'proficiencies'>,
  registry: Registry,
): { instanceId: string; name: string }[] {
  if (!sheet.features.some(({ def }) => def.id === DEDICATED_WEAPON)) return [];
  const refs = characterRegistry(registry, build);
  return build.items
    .flatMap(({ instanceId, itemId }) => {
      const item = refs.entries.get(itemId);
      return item?.kind === 'item' &&
        (live.items[instanceId]?.qty ?? 0) > 0 &&
        canDedicateWeapon(item, sheet.proficiencies.weapons)
        ? [{ instanceId, name: item.name }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Apply the Martial Arts die when it has a higher average than the normal weapon. */
export function monkWeaponDamage(normal: string | number, die: string): string | number {
  const parsed = typeof normal === 'string' ? parseDice(normal) : undefined;
  const average =
    typeof normal === 'number'
      ? normal
      : parsed
        ? parsed.bonus +
          parsed.terms.reduce((total, { count, sides }) => total + (count * (sides + 1)) / 2, 0)
        : Infinity;
  const sides = Number(die.slice(1));
  return (sides + 1) / 2 > average ? `1${die}` : normal;
}
