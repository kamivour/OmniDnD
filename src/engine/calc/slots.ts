import { PACT_SLOTS, SPELL_SLOTS } from '../rules2014';
import type { ClassDef } from '../schema';

type Progression = NonNullable<ClassDef['spellcasting']>['progression'];

export interface CasterClass {
  progression: Progression;
  level: number;
}

export interface SpellSlots {
  /** Index = slot level, so index 0 (cantrips) is always 0. Length 10. */
  max: number[];
  /** Warlock Pact Magic, tracked apart from other slots. */
  pact?: { count: number; level: number };
}

/** Caster level of a class when it is the character's only spellcasting class. */
function singleClassCasterLevel({ progression, level }: CasterClass): number {
  if (progression === 'full') return level;
  if (progression === 'half') return level < 2 ? 0 : Math.ceil(level / 2);
  if (progression === 'third') return level < 3 ? 0 : Math.ceil(level / 3);
  return 0;
}

/** PHB 2014 multiclass caster level: half casters and third casters round down. */
function multiclassCasterLevel(casters: CasterClass[]): number {
  return casters.reduce((sum, { progression, level }) => {
    if (progression === 'full') return sum + level;
    if (progression === 'half') return sum + Math.floor(level / 2);
    if (progression === 'third') return sum + Math.floor(level / 3);
    return sum;
  }, 0);
}

/**
 * Slot maximums. The multiclass table applies only when two or more classes already have the
 * Spellcasting feature: a Paladin 1 or an Eldritch Knight 2 does not count yet.
 */
export function spellSlots(casters: CasterClass[]): SpellSlots {
  const slotCasters = casters.filter((caster) => singleClassCasterLevel(caster) > 0);
  const casterLevel =
    slotCasters.length === 1 && slotCasters[0]
      ? singleClassCasterLevel(slotCasters[0])
      : multiclassCasterLevel(slotCasters);
  const row = SPELL_SLOTS[casterLevel - 1] ?? [];
  const max = Array.from({ length: 10 }, (_, slotLevel) => row[slotLevel - 1] ?? 0);

  const warlockLevel = casters
    .filter((caster) => caster.progression === 'pact')
    .reduce((sum, caster) => sum + caster.level, 0);
  const pact = PACT_SLOTS[warlockLevel - 1];
  return pact ? { max, pact } : { max };
}
