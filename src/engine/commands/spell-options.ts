import type { SpellcastingStats } from '../calc/sheet';
import type { Ability } from '../calc/abilities';
import { elementalAffinity } from '../calc/ancestry';
import { featureResource } from '../calc/features';
import { entryCasting } from '../calc/casting';
import {
  featSpellSources,
  freeUseKey,
  MYSTIC_ARCANUM,
  SIGNATURE_SPELLS,
  type FeatSpell,
  type FeatSpellSource,
} from '../calc/feat-spells';
import { spellListsWithGrants } from '../calc/granted-spells';
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
  /** Cast through a feat or racial trait instead of a class. */
  featureId?: string;
}

/** Casting through a feat or racial trait: its own ability, DC and free use. */
export interface FeatCastDetails {
  source: FeatSpellSource;
  /** Undefined when the source does not teach this spell. */
  spell?: FeatSpell;
  /** Free castings left before the next rest; Infinity at will, 0 without a free use. */
  freeLeft: number;
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
  damage?: SpellRollDetails & {
    type: DamageType;
    /** Elemental Affinity: add this to one damage roll. */
    affinity?: { name: string; bonus: number };
    /** Class features that add an ability modifier to this spell's damage (Potent Spellcasting). */
    bonuses?: { name: string; bonus: number }[];
    /** Elemental Adept for this damage type: ignore resistance, treat 1s as 2s. */
    adept?: string;
  };
  upcastText?: string;
  feat?: FeatCastDetails;
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
  if (options.featureId !== undefined) return featCastDetails(ctx, spell, options);
  const associations = spellListsWithGrants(ctx.registry, ctx.build).filter(
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
    ...(spell.damage ? { damage: spellDamage(ctx, spell, deriveRoll, classId) } : {}),
    ...(spell.summary?.upcast ? { upcastText: spell.summary.upcast } : {}),
  };
}

/**
 * Damage dice plus Elemental Affinity, Elemental Adept, and class damage bonuses when the spell is
 * cast as that class's spell (feat castings carry no class).
 */
function spellDamage(
  ctx: SpellOptionsContext,
  spell: SpellDef,
  deriveRoll: (roll: NonNullable<SpellDef['heal']>) => SpellRollDetails,
  classId?: string,
): SpellCastDetails['damage'] {
  const damage = spell.damage!;
  const mods = Object.fromEntries(
    Object.entries(ctx.sheet.abilities).map(([ability, value]) => [ability, value.mod]),
  ) as Record<Ability, number>;
  const affinity = elementalAffinity(ctx.sheet.features, mods, damage.type);
  const adept = ctx.sheet.features.find(({ def }) => def.elementalAdept === damage.type)?.def.name;
  const bonuses = ctx.sheet.features.flatMap(({ def }) => {
    const rule = def.spellDamageBonus;
    if (!rule || rule.classId !== classId) return [];
    if (rule.cantripsOnly && spell.level !== 0) return [];
    if (rule.school && rule.school !== spell.school) return [];
    return [{ name: def.name, bonus: mods[rule.ability] }];
  });
  return {
    ...deriveRoll(damage),
    type: damage.type,
    ...(affinity ? { affinity } : {}),
    ...(adept ? { adept } : {}),
    ...(bonuses.length > 0 ? { bonuses } : {}),
  };
}

/** Number of free castings left for one feat spell. */
export function featFreeLeft(
  live: SpellOptionsContext['live'],
  featureId: string,
  feat: FeatSpell | undefined,
  sheet?: Pick<SpellOptionsContext['sheet'], 'features'>,
): number {
  if (!feat?.free) return 0;
  if (feat.useFeaturePool)
    return sheet ? (featureResource(sheet.features, live, featureId)?.remaining ?? 0) : 0;
  if (feat.free === 'will') return Infinity;
  if (featureId === SIGNATURE_SPELLS) {
    const legacy = live.featureUsesSpent[SIGNATURE_SPELLS] ?? 0;
    const tracked = Object.entries(live.featSpellsUsed ?? {}).filter(
      ([key, spent]) => key.startsWith(`${SIGNATURE_SPELLS}|`) && spent > 0,
    ).length;
    if (legacy + tracked >= 2) return 0;
  }
  const legacySpent = live.featureUsesSpent[MYSTIC_ARCANUM] ?? 0;
  if (sheet && legacySpent > 0 && featureId.startsWith(MYSTIC_ARCANUM)) {
    const tiers = sheet.features
      .map(({ def }) => def.id)
      .filter((id) => id.startsWith(MYSTIC_ARCANUM));
    const spentTiers = new Set(
      Object.entries(live.featSpellsUsed ?? {})
        .filter(([, spent]) => spent > 0)
        .map(([key]) => key.split('|')[0])
        .filter((id) => id !== undefined && tiers.includes(id)),
    );
    if (legacySpent + spentTiers.size >= tiers.length) return 0;
  }
  return (live.featSpellsUsed?.[freeUseKey(featureId, feat.spellId)] ?? 0) > 0 ? 0 : 1;
}

function featCastDetails(
  ctx: SpellOptionsContext,
  spell: SpellDef,
  options: SpellCastOptions,
): SpellCastDetails {
  const source = featSpellSources(ctx).find((row) => row.featureId === options.featureId);
  const feat = source?.spells.find((row) => row.spellId === spell.id);
  const modifier = source?.ability ? ctx.sheet.abilities[source.ability].mod : undefined;
  const deriveRoll = (roll: NonNullable<SpellDef['heal']>) =>
    rollDetails(roll, spell, options, ctx.sheet.level, modifier);
  return {
    selected: feat !== undefined,
    needsPreparation: false,
    preparedForCasting: true,
    ritualEligible: !!(source?.grant.ritual && feat && spell.ritual),
    ...(source
      ? {
          feat: {
            source,
            ...(feat ? { spell: feat } : {}),
            freeLeft: featFreeLeft(ctx.live, source.featureId, feat, ctx.sheet),
          },
        }
      : {}),
    ...(spell.heal ? { healing: deriveRoll(spell.heal) } : {}),
    ...(spell.damage ? { damage: spellDamage(ctx, spell, deriveRoll) } : {}),
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
