import type { Companion, CharacterBuild, OwnerNumber, CompanionLive } from '../schema';
import type { Sheet } from './sheet';
import { abilityModifier } from './abilities';

/** Owner values a companion's numbers can follow. */
export interface CompanionOwner {
  build: Pick<CharacterBuild, 'classes'>;
  sheet: Pick<Sheet, 'level' | 'proficiency' | 'abilities'>;
}

/** Resolves a fixed or owner-derived number. */
export function resolveOwnerNumber(value: OwnerNumber, owner: CompanionOwner): number {
  if (typeof value === 'number') return value;
  const level =
    value.classId === undefined
      ? owner.sheet.level
      : (owner.build.classes.find((entry) => entry.classId === value.classId)?.level ?? 0);
  return (
    (value.base ?? 0) +
    (value.ownerLevel ?? 0) * level +
    (value.ownerAbilityMod ? owner.sheet.abilities[value.ownerAbilityMod].mod : 0) +
    (value.ownerProficiency ?? 0) * owner.sheet.proficiency
  );
}

export interface CompanionStats {
  ac: number;
  maxHp: number;
  abilities: Companion['abilities'];
  attacks: {
    name: string;
    bonus: number;
    damage?: { dice?: string; bonus: number; type: string };
    range?: string;
    note?: string;
  }[];
}

/** The companion's numbers for the owner as they are now. */
export function companionStats(companion: Companion, owner: CompanionOwner): CompanionStats {
  return {
    ac: resolveOwnerNumber(companion.ac, owner),
    maxHp: Math.max(1, resolveOwnerNumber(companion.maxHp, owner)),
    abilities: companion.abilities,
    attacks: companion.attacks.map((attack) => ({
      name: attack.name,
      bonus: resolveOwnerNumber(attack.bonus, owner),
      ...(attack.damage && {
        damage: {
          ...(attack.damage.dice && { dice: attack.damage.dice }),
          bonus: resolveOwnerNumber(attack.damage.bonus ?? 0, owner),
          type: attack.damage.type,
        },
      }),
      ...(attack.range && { range: attack.range }),
      ...(attack.note && { note: attack.note }),
    })),
  };
}

export const companionAbilityMod = (companion: Companion, ability: keyof Companion['abilities']) =>
  abilityModifier(companion.abilities[ability] ?? 10);

/** A fresh, full-health live entry. */
export function freshCompanionLive(maxHp: number, endsAt?: number): CompanionLive {
  return {
    status: 'active',
    hp: maxHp,
    tempHp: 0,
    conditions: [],
    usesSpent: {},
    ...(endsAt !== undefined && { endsAt }),
  };
}
