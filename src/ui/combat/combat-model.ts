import type { CharacterState, Sheet, WeaponAttack } from '../../engine/calc/sheet';
import { featureUseDetails } from '../../engine/commands';
import type { Registry } from '../../engine/registry';
import type { FeatureView } from '../fixtures/the-fool';
import { signed } from '../format';
import { spellbookModel, type SpellbookEntry } from '../spells/spellbook-model';

export interface CombatWeapon {
  instanceId: string;
  type: WeaponAttack['type'];
  attack: {
    id: string;
    name: string;
    toHit: number;
    damage?: string;
    damageType?: string;
    notes: string;
  };
}

export interface CombatFeature {
  feature: FeatureView & { cost: 'A' | 'BA' | 'R' };
  meta: string;
  remainingUses?: number;
  unavailableReason?: string;
}

const COSTS = { action: 'A', bonus: 'BA', reaction: 'R' } as const;
const RECHARGE = { short: 'Short rest', long: 'Long rest', dawn: 'Dawn', none: 'No recharge' };

/** Formatting only: dice and modifiers are already derived by the engine. */
function damageText(dice: string | undefined, bonus: number): string {
  return dice ? `${dice}${bonus === 0 ? '' : signed(bonus)}` : String(bonus);
}

/** Default tab visibility only; the engine still checks every attempted cast and exception. */
export function combatSpellsForEconomy(
  entries: readonly SpellbookEntry[],
  combat: CharacterState['live']['combat'],
): SpellbookEntry[] {
  if (!combat) return [...entries];
  return entries.filter(({ spell }) => {
    if (spell.cost === 'R') return !combat.economy.reactionUsed;
    if (spell.cost === 'BA') return combat.turnActive && !combat.economy.bonusUsed;
    return combat.turnActive && !combat.economy.actionUsed;
  });
}

/** Live display adapter. Ownership, stats, shared resources and action costs come from the engine. */
export function combatModel(state: CharacterState, sheet: Sheet, registry: Registry) {
  const weapons: CombatWeapon[] = sheet.attacks.map((attack) => ({
    instanceId: attack.instanceId,
    type: attack.type,
    attack: {
      id: attack.itemId,
      name: attack.name,
      toHit: attack.toHit.value,
      ...(attack.damage
        ? {
            damage: damageText(attack.damage.dice, attack.damage.bonus),
            damageType: attack.damage.type,
          }
        : {}),
      notes: [
        attack.type === 'melee' ? 'Melee weapon' : 'Ranged weapon',
        attack.proficient ? 'Proficient' : 'Not proficient',
        ...attack.properties,
        attack.range && `Range ${attack.range.normal}/${attack.range.long} ft`,
        attack.versatile && `Versatile ${damageText(attack.versatile, attack.damage?.bonus ?? 0)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  }));
  const features: CombatFeature[] = sheet.features.flatMap(({ def }) => {
    if (!(def.activation in COSTS)) return [];
    const cost = COSTS[def.activation as keyof typeof COSTS];
    const details = featureUseDetails({ live: state.live, sheet }, def.id);
    const lines = def.summary
      ? [def.summary.effect]
      : (def.fullText?.split(/\n\s*\n/).filter(Boolean) ?? []);
    if (def.trigger) lines.unshift(`Trigger: ${def.trigger}`);
    if (details.unavailableReason) lines.push(details.unavailableReason);
    const recharge = details.uses ? RECHARGE[details.uses.recharge] : '';
    const poolLabel = details.poolId === def.id ? '' : details.pool?.def.name;
    return [
      {
        feature: {
          id: def.id,
          name: def.name,
          cost,
          ...(details.uses
            ? {
                uses: {
                  max: details.uses.max,
                  used: details.uses.spent,
                  die: details.die ?? '',
                  recharge: [recharge, poolLabel && `Uses ${poolLabel}`]
                    .filter(Boolean)
                    .join(' · '),
                },
              }
            : {}),
          lines,
        },
        meta: details.uses
          ? [
              `${details.uses.remaining} / ${details.uses.max} left`,
              details.die,
              recharge,
              poolLabel && `Uses ${poolLabel}`,
            ]
              .filter(Boolean)
              .join(' · ')
          : (details.unavailableReason ?? lines[0] ?? 'Use this feature; outcomes stay manual.'),
        ...(details.uses ? { remainingUses: details.uses.remaining } : {}),
        ...(details.unavailableReason ? { unavailableReason: details.unavailableReason } : {}),
      },
    ];
  });
  return { weapons, features, spells: spellbookModel(state, sheet, registry) };
}
