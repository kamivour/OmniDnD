import type { Registry } from '../registry';
import { recordedLevel, xpForLevel } from './advancement';
import { CARRY_PER_STR } from '../rules2014';
import type { HitDieName } from '../schema';
import { ABILITIES, abilityModifier, type Ability } from './abilities';
import { proficiencyBonus } from './proficiency';
import type { CharacterState, Sheet } from './sheet';
import type { Stat } from './stat';
import { counterCorrection, overridePath, overrideStat } from './value-overrides';

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
  const actualLevel = recordedLevel(build);
  // Follow computeSheet's accepted override metadata, including its unsafe-legacy fallback.
  const explain = (path: string, base: Stat): Stat => {
    const accepted = sheet.values[path]?.stat.override;
    return accepted
      ? overrideStat({ overrides: [{ path, value: accepted.value, note: accepted.note }] }, path, {
          ...base,
          ...(base.notes ? { notes: base.notes.map((note) => `Before override: ${note}`) } : {}),
        })
      : base;
  };
  return {
    level: explain('/level', {
      value: actualLevel,
      parts: classes.map(({ def, level }) => ({ label: def.name, value: level })),
    }),
    proficiency: explain('/proficiency', {
      value: proficiencyBonus(sheet.level),
      parts: [],
      notes: [
        `Character level ${sheet.level}: ceil(${sheet.level} / 4) + 1 = ${signed(proficiencyBonus(sheet.level))}.`,
      ],
    }),
    ...(campaign.leveling === 'xp' && actualLevel < 20
      ? {
          nextLevelXp: explain('/nextLevelXp', {
            value: xpForLevel(actualLevel + 1),
            parts: [],
            notes: [
              `2014 character advancement: level ${actualLevel + 1} requires ${xpForLevel(actualLevel + 1)} XP.`,
            ],
          }),
        }
      : {}),
    modifiers: Object.fromEntries(
      ABILITIES.map((ability): [Ability, Stat] => {
        const { score } = sheet.abilities[ability];
        const mod = abilityModifier(score.value);
        return [
          ability,
          explain(overridePath('abilities', ability, 'mod'), {
            value: mod,
            parts: [],
            notes: [
              `Score ${score.value}: ${score.parts.map(({ label, value }) => `${label} ${signed(value)}`).join(', ')}.`,
              `floor((${score.value} - 10) / 2) = ${signed(mod)}.`,
            ],
          }),
        ];
      }),
    ) as Record<Ability, Stat>,
    ...(sheet.darkvision === undefined
      ? {}
      : {
          darkvision: explain('/darkvision', {
            value: race.darkvision ?? 0,
            parts: [{ label: race.name, value: race.darkvision ?? 0 }],
          }),
        }),
    carryingCapacity: explain('/carryingCapacity', {
      value: sheet.abilities.STR.score.value * CARRY_PER_STR,
      parts: [],
      notes: [
        `STR ${sheet.abilities.STR.score.value} × ${CARRY_PER_STR} lb = ${sheet.abilities.STR.score.value * CARRY_PER_STR} lb.`,
      ],
    }),
    hitDice: sheet.hitDice.map(({ die, max }) => {
      const maxParts = classes
        .filter(({ def }) => def.hitDie === die)
        .map(({ def, level }) => ({ label: def.name, value: level }));
      const spent = live.hitDiceSpent[die] ?? 0;
      const maximum = explain(overridePath('hitDice', die, 'max'), {
        value: maxParts.reduce((sum, part) => sum + part.value, 0),
        parts: maxParts,
      });
      const remaining = Math.max(0, max - spent);
      const parts = [...maximum.parts, { label: 'Spent Hit Dice', value: -spent }];
      if (max - spent < 0)
        parts.push({ label: 'Minimum remaining 0', value: remaining - (max - spent) });
      const correction = counterCorrection(
        build,
        overridePath('hitDice', die, 'remaining'),
        spent,
        max,
      );
      const current: Stat = { value: remaining, parts };
      if (correction) {
        current.override = {
          path: correction.path,
          note: correction.note,
          calculated: Math.max(0, max - correction.value.spentBefore),
          value: remaining,
        };
        current.notes = [
          `Correction: ${correction.note}. Spent ${correction.value.spentBefore} → ${spent}; later spending or recovery clears this marker.`,
        ];
      }
      return { die, max: maximum, remaining: current };
    }),
    attacks: sheet.attacks.map((attack) => {
      if (!attack.damage) return { instanceId: attack.instanceId };
      const weapon = registry.get('item', attack.itemId).weapon!;
      const mod = sheet.abilities[attack.ability].mod;
      const flat = typeof weapon.damage === 'number' ? weapon.damage : undefined;
      const calculated = flat === undefined ? mod : Math.max(0, flat + mod);
      const parts = [
        ...(flat === undefined ? [] : [{ label: attack.name, value: flat }]),
        { label: attack.ability, value: mod },
      ];
      const notes =
        flat === undefined
          ? [
              `Damage dice: ${attack.damage.dice}. Add ${attack.ability} ${signed(mod)} to the rolled total.`,
            ]
          : [`Flat damage: max(0, ${flat} + (${mod})) = ${calculated}.`];
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
        damageBonus: explain(overridePath('attacks', attack.instanceId, 'damage', 'bonus'), {
          value: calculated,
          parts,
          notes,
        }),
      };
    }),
  };
}
