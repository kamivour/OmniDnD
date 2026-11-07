import type { Companion, CompanionAttack, CreatureDef, OwnerNumber } from '../schema';

export type CompanionTemplateData = Omit<Companion, 'id'>;

/** "2d4+2" gives dice 2d4 and bonus 2; a bare "1" gives a bonus only. */
function splitDamage(text: string): { dice?: string; bonus: number } {
  const match = /^(\d+d\d+)?(?:([+-]?)(\d+))?$/.exec(text.replace(/\s+/g, ''));
  if (!match) return { bonus: 0 };
  const flat = match[3] ? Number(match[3]) * (match[2] === '-' ? -1 : 1) : 0;
  return { ...(match[1] && { dice: match[1] }), bonus: flat };
}

export interface CreatureCompanionOptions {
  type: Companion['type'];
  /** The PHB Ranger's companion: the owner's proficiency bonus replaces its own and is added to AC and damage. */
  ownerProficiency?: boolean;
  /** Max HP is at least this many times the owner's level in a class. */
  hpFloor?: { perLevel: number; classId: string };
  /** Companions that cannot attack on their own (a familiar). */
  noAttacks?: boolean;
  extraTraits?: string[];
  limit?: Companion['limit'];
  sourceId?: Companion['sourceId'];
}

/** A companion template from a bundled creature. Text is not copied: traits keep their names only. */
export function creatureCompanion(
  creature: CreatureDef,
  options: CreatureCompanionOptions,
): CompanionTemplateData {
  const owner = options.ownerProficiency;
  const attacks = options.noAttacks
    ? []
    : creature.actions.flatMap((action): CompanionAttack[] => {
        if (action.attackBonus === undefined) return [];
        const damage = action.damage?.[0];
        const split = damage ? splitDamage(damage.dice) : undefined;
        const bonus: OwnerNumber = owner
          ? { base: action.attackBonus - creature.proficiencyBonus, ownerProficiency: 1 }
          : action.attackBonus;
        const damageBonus: OwnerNumber | undefined = owner
          ? { base: split?.bonus ?? 0, ownerProficiency: 1 }
          : split?.bonus
            ? split.bonus
            : undefined;
        const reach = /reach (\d+) ft/.exec(action.text)?.[1];
        return [
          {
            name: action.name,
            bonus,
            ...(damage &&
              split && {
                damage: {
                  ...(split.dice && { dice: split.dice }),
                  ...(damageBonus !== undefined && { bonus: damageBonus }),
                  type: damage.type,
                },
              }),
            range: `${reach ?? 5} ft.`,
          },
        ];
      });
  const { walk, fly, swim, climb, burrow } = creature.speed;
  return {
    name: creature.name,
    type: options.type,
    kind: `${creature.size[0]!.toUpperCase()}${creature.size.slice(1)} ${creature.creatureType}`,
    ac: owner ? { base: creature.ac, ownerProficiency: 1 } : creature.ac,
    maxHp: options.hpFloor
      ? {
          base: creature.hp,
          atLeastOwnerLevel: options.hpFloor.perLevel,
          classId: options.hpFloor.classId,
        }
      : creature.hp,
    speed: {
      ...(walk !== undefined && { walk }),
      ...(fly !== undefined && { fly }),
      ...(swim !== undefined && { swim }),
      ...(climb !== undefined && { climb }),
      ...(burrow !== undefined && { burrow }),
    },
    abilities: creature.abilities,
    attacks,
    traits: [...creature.traits.map((trait) => trait.name), ...(options.extraTraits ?? [])],
    uses: [],
    ...(options.limit && { limit: options.limit }),
    ...(options.sourceId && { sourceId: options.sourceId }),
  };
}
