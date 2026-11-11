import type { SpellcastingStats } from '../calc/sheet';
import { entryCasting } from '../calc/casting';
import { isPreparedCaster2014 } from '../calc/spell-selections';
import type { DamageType } from '../rules2014';
import type { SpellDef } from '../schema';
import type { CommandContext } from './runner';
import { diceRange } from './shared';

export type SpellOptionsContext = Pick<CommandContext, 'build' | 'live' | 'sheet' | 'registry'>;

export interface SpellCastOptions {
  spellId: string;
  classId?: string;
  slotLevel?: number;
  ritual?: boolean;
}

export interface SpellRollDetails {
  dice: string;
  minRoll: number;
  maxRoll: number;
  /** Undefined only when the roll needs a casting modifier that cannot be derived. */
  modifier?: number;
}

export interface SpellCastDetails {
  classId?: string;
  /** Exact owned class only; explicit choices also support unknown-spell overrides (D56). */
  casting?: SpellcastingStats;
  selected: boolean;
  /** Normal leveled casting for the four prepared classes in the 2014 rules. */
  needsPreparation: boolean;
  preparedForCasting: boolean;
  ritualEligible: boolean;
  ritualReason?: string;
  healing?: SpellRollDetails;
  damage?: SpellRollDetails & { type: DamageType };
  upcastText?: string;
}

/** Derives dice from mechanics, never from reference prose. */
function rollDetails(
  roll: NonNullable<SpellDef['heal']>,
  spell: SpellDef,
  options: SpellCastOptions,
  characterLevel: number,
  castingModifier: number | undefined,
): SpellRollDetails {
  const scaling =
    spell.level === 0 && roll.cantripScaling
      ? characterLevel >= 17
        ? 4
        : characterLevel >= 11
          ? 3
          : characterLevel >= 5
            ? 2
            : 1
      : 1;
  const above = options.ritual ? 0 : Math.max(0, (options.slotLevel ?? spell.level) - spell.level);
  const terms = new Map<string, number>();
  const add = (dice: string, multiplier: number) => {
    const [count = '0', die = '0'] = dice.split('d');
    terms.set(die, (terms.get(die) ?? 0) + Number(count) * multiplier);
  };
  add(roll.dice, scaling);
  if (roll.upcastPerLevel && above > 0) add(roll.upcastPerLevel, above);
  const dice = [...terms].map(([die, count]) => `${count}d${die}`).join(' + ');
  const base = diceRange(roll.dice);
  const extra = roll.upcastPerLevel ? diceRange(roll.upcastPerLevel) : { min: 0, max: 0 };
  const modifier = roll.addCastingMod ? castingModifier : 0;
  return {
    dice,
    minRoll: base.min * scaling + extra.min * above,
    maxRoll: base.max * scaling + extra.max * above,
    ...(modifier === undefined ? {} : { modifier }),
  };
}

/** Casting choices and derived numbers for both command validation and the casting UI. */
export function spellCastDetails(
  ctx: SpellOptionsContext,
  options: SpellCastOptions,
): SpellCastDetails {
  const spell = ctx.registry.get('spell', options.spellId);
  const associations = ctx.build.spells.filter(
    (list) => list.known.includes(spell.id) || list.prepared?.includes(spell.id),
  );
  const classIds = [...new Set(associations.map((list) => list.classId))];
  const classId = options.classId ?? (classIds.length === 1 ? classIds[0] : undefined);
  const selections = associations.filter((list) => list.classId === classId);
  const classEntry = ctx.build.classes.find((entry) => entry.classId === classId);
  const selected = selections.length > 0 && classEntry !== undefined;
  const classDef = classEntry ? ctx.registry.get('class', classEntry.classId) : undefined;
  const casting = ctx.sheet.spellcasting.find((stats) => stats.classId === classEntry?.classId);
  const needsPreparation =
    spell.level > 0 && classDef !== undefined && isPreparedCaster2014(classDef.id);
  const preparedForCasting =
    !needsPreparation || selections.some((list) => list.prepared?.includes(spell.id));
  const ritual = classEntry
    ? entryCasting(ctx.registry, classEntry, classDef)?.ritual
    : classDef?.spellcasting?.ritual;
  const ritualSelected =
    ritual === 'known'
      ? selections.some((list) => list.known.includes(spell.id))
      : ritual === 'prepared'
        ? selections.some((list) => list.prepared?.includes(spell.id))
        : false;
  const ritualEligible = spell.ritual && ritualSelected && casting !== undefined;
  let ritualReason: string | undefined;
  if (spell.ritual && !ritualEligible) {
    if (!classDef) ritualReason = 'Ritual casting class is unavailable';
    else if (!ritual || ritual === 'none')
      ritualReason = `${classDef.name} does not grant ritual casting`;
    else
      ritualReason = `${spell.name} is not ${ritual === 'prepared' ? 'prepared' : 'known'} as a ${classDef.name} spell`;
  }
  const castingModifier = casting ? ctx.sheet.abilities[casting.ability].mod : undefined;
  const deriveRoll = (roll: NonNullable<SpellDef['heal']>) =>
    rollDetails(roll, spell, options, ctx.sheet.level, castingModifier);
  return {
    ...(classId === undefined ? {} : { classId }),
    ...(casting === undefined ? {} : { casting }),
    selected,
    needsPreparation,
    preparedForCasting,
    ritualEligible,
    ...(ritualReason === undefined ? {} : { ritualReason }),
    ...(spell.heal ? { healing: deriveRoll(spell.heal) } : {}),
    ...(spell.damage ? { damage: { ...deriveRoll(spell.damage), type: spell.damage.type } } : {}),
    ...(spell.summary?.upcast ? { upcastText: spell.summary.upcast } : {}),
  };
}

/** Preview self healing from a valid dice total without mutating HP or resolving a DM outcome. */
export function previewSpellHealing(
  ctx: SpellOptionsContext,
  options: SpellCastOptions,
  roll: number,
): { amount: number; before: number; after: number } | undefined {
  const healing = spellCastDetails(ctx, options).healing;
  if (
    !healing ||
    healing.modifier === undefined ||
    !Number.isInteger(roll) ||
    roll < healing.minRoll ||
    roll > healing.maxRoll
  )
    return undefined;
  const amount = Math.max(0, roll + healing.modifier);
  const before = ctx.live.hp;
  const after = Math.max(before, Math.min(ctx.sheet.maxHp.value, before + amount));
  return { amount, before, after };
}
