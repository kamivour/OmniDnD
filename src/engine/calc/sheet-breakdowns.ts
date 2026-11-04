import type { Registry } from '../registry';
import { xpForLevel } from '../creation';
import { CARRY_PER_STR } from '../rules2014';
import type { HitDieName } from '../schema';
import { ABILITIES, type Ability } from './abilities';
import type { CharacterState, Sheet } from './sheet';
import type { Stat } from './stat';

export interface SheetBreakdowns {
  level: Stat;
  proficiency: Stat;
  nextLevelXp?: Stat;
  modifiers: Record<Ability, Stat>;
  darkvision?: Stat;
  carryingCapacity: Stat;
  hitDice: { die: HitDieName; max: Stat; remaining: Stat }[];
  attacks: { instanceId: string; damageBonus?: Stat }[];
}

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;

/** Explanations for scalar Sheet fields. Values remain the existing computeSheet results. */
export function sheetBreakdowns(
  { campaign, build, live }: CharacterState,
  sheet: Sheet,
  registry: Registry,
): SheetBreakdowns {
  const classes = build.classes.map((entry) => ({
    ...entry,
    def: registry.get('class', entry.classId),
  }));
  const race = registry.get('race', build.subraceId ?? build.raceId);
  return {
    level: {
      value: sheet.level,
      parts: classes.map(({ def, level }) => ({ label: def.name, value: level })),
    },
    proficiency: {
      value: sheet.proficiency,
      parts: [],
      notes: [
        `Character level ${sheet.level}: ceil(${sheet.level} / 4) + 1 = ${signed(sheet.proficiency)}.`,
      ],
    },
    ...(campaign.leveling === 'xp' && sheet.level < 20
      ? {
          nextLevelXp: {
            value: xpForLevel(sheet.level + 1),
            parts: [],
            notes: [
              `2014 character advancement: level ${sheet.level + 1} requires ${xpForLevel(sheet.level + 1)} XP.`,
            ],
          },
        }
      : {}),
    modifiers: Object.fromEntries(
      ABILITIES.map((ability): [Ability, Stat] => {
        const { score, mod } = sheet.abilities[ability];
        return [
          ability,
          {
            value: mod,
            parts: [],
            notes: [
              `Score ${score.value}: ${score.parts.map(({ label, value }) => `${label} ${signed(value)}`).join(', ')}.`,
              `floor((${score.value} - 10) / 2) = ${signed(mod)}.`,
            ],
          },
        ];
      }),
    ) as Record<Ability, Stat>,
    ...(sheet.darkvision === undefined
      ? {}
      : {
          darkvision: {
            value: sheet.darkvision,
            parts: [{ label: race.name, value: sheet.darkvision }],
          },
        }),
    carryingCapacity: {
      value: sheet.carryingCapacity,
      parts: [],
      notes: [
        `STR ${sheet.abilities.STR.score.value} × ${CARRY_PER_STR} lb = ${sheet.carryingCapacity} lb.`,
      ],
    },
    hitDice: sheet.hitDice.map(({ die, max }) => {
      const maxParts = classes
        .filter(({ def }) => def.hitDie === die)
        .map(({ def, level }) => ({ label: def.name, value: level }));
      const spent = live.hitDiceSpent[die] ?? 0;
      const remaining = Math.max(0, max - spent);
      const parts = [...maxParts, { label: 'Spent Hit Dice', value: -spent }];
      if (max - spent < 0)
        parts.push({ label: 'Minimum remaining 0', value: remaining - (max - spent) });
      return { die, max: { value: max, parts: maxParts }, remaining: { value: remaining, parts } };
    }),
    attacks: sheet.attacks.map((attack) => {
      if (!attack.damage) return { instanceId: attack.instanceId };
      const weapon = registry.get('item', attack.itemId).weapon!;
      const mod = sheet.abilities[attack.ability].mod;
      const flat = typeof weapon.damage === 'number' ? weapon.damage : undefined;
      const parts = [
        ...(flat === undefined ? [] : [{ label: attack.name, value: flat }]),
        { label: attack.ability, value: mod },
      ];
      const notes =
        flat === undefined
          ? [
              `Damage dice: ${attack.damage.dice}. Add ${attack.ability} ${signed(mod)} to the rolled total.`,
            ]
          : [`Flat damage: max(0, ${flat} + (${mod})) = ${attack.damage.bonus}.`];
      notes.push(
        weapon.properties.includes('finesse')
          ? `Finesse uses the higher of STR and DEX; ${attack.ability} selected.`
          : `${attack.type === 'ranged' ? 'Ranged' : 'Melee'} weapon uses ${attack.ability}.`,
      );
      if (attack.versatile) {
        notes.push(
          `Versatile damage dice: ${attack.versatile}. The ${attack.ability} modifier is unchanged.`,
        );
      }
      if (flat !== undefined && flat + mod < 0) {
        parts.push({ label: 'Minimum flat damage 0', value: -(flat + mod) });
      }
      return {
        instanceId: attack.instanceId,
        damageBonus: { value: attack.damage.bonus, parts, notes },
      };
    }),
  };
}
