import { z } from 'zod';
import {
  AbilitySchema,
  AnyRefIdSchema,
  ConditionSchema,
  DamageTypeSchema,
  DiceSchema,
  DieSchema,
  HitDieSchema,
  LevelKeySchema,
  RechargeSchema,
  refId,
  RulesetSchema,
  SchoolSchema,
  SkillSchema,
  SourceSchema,
  SpellTypeSchema,
  WeaponPropertySchema,
} from './common';

/** Layer A: reference entries (DATA.md §4). SRD import, `data/content/` and `data/mechanics/` all produce these. */

const MAX_SUMMARY_WORDS = 40;

export const SummarySchema = z.strictObject({
  effect: z
    .string()
    .min(1)
    .refine((text) => text.trim().split(/\s+/).length <= MAX_SUMMARY_WORDS, {
      message: `Keep the effect line to ${MAX_SUMMARY_WORDS} words or fewer (DATA.md §7)`,
    }),
  fail: z.string().optional(),
  success: z.string().optional(),
  hit: z.string().optional(),
  upcast: z.string().optional(),
  scaling: z.string().optional(),
});

const refBase = {
  name: z.string().min(1),
  ruleset: RulesetSchema,
  source: SourceSchema,
  srd: z.boolean(),
  summary: SummarySchema.optional(),
  /** False until the user checks an agent-written summary. */
  summaryReviewed: z.boolean().optional(),
  /** SRD entries only. */
  fullText: z.string().optional(),
  url: z.url().optional(),
  iconId: z.string().optional(),
};

/** The repo is public: book text may only ride on SRD entries (D16). */
const srdTextOnly = (entry: { srd: boolean; fullText?: string | undefined }) =>
  entry.srd || entry.fullText === undefined;
const SRD_TEXT_ONLY = { message: 'fullText is only allowed on SRD entries', path: ['fullText'] };

/** Small declarative numbers. Anything more complex is a code hook, never an expression language. */
export const FormulaSchema = z.union([
  z.int(),
  z.strictObject({ abilityMod: AbilitySchema, min: z.int().optional() }),
  z.strictObject({ proficiency: z.enum(['half', 'full', 'double']) }),
  /** A count that grows with the feature's level (Rage, Action Surge). */
  z.strictObject({ byLevel: z.record(LevelKeySchema, z.int().min(0)) }),
  /** The feature's level times this number (Ki points, sorcery points). */
  z.strictObject({ perLevel: z.int().positive() }),
]);

export const RechargeByLevelSchema = z.record(LevelKeySchema, RechargeSchema);
export const DieByLevelSchema = z.record(LevelKeySchema, DieSchema);

export const ModifierSchema = z.strictObject({
  target: z.enum(['ac', 'initiative', 'speed', 'saves', 'checks', 'unproficient-checks']),
  value: FormulaSchema,
});

/** Effect a spell puts on its target. Only effects that land on you go into your live state (D41). */
export const EffectTemplateSchema = z.strictObject({
  /** `self`: always you. `any`: the caster picks the target at cast time. */
  target: z.enum(['self', 'any']),
  conditions: z.array(ConditionSchema).optional(),
  modifiers: z.array(ModifierSchema).optional(),
  note: z.string().optional(),
});

const SpellRollSchema = z.strictObject({
  dice: DiceSchema,
  /** Healing Word: add the casting ability modifier. */
  addCastingMod: z.boolean().optional(),
  /** Extra dice per slot level above the spell's level. */
  upcastPerLevel: DiceSchema.optional(),
  /** Cantrip dice count ×2 / ×3 / ×4 at character level 5 / 11 / 17. */
  cantripScaling: z.boolean().optional(),
});

export const SpellDefSchema = z
  .strictObject({
    kind: z.literal('spell'),
    id: refId('spell'),
    ...refBase,
    level: z.int().min(0).max(9),
    school: SchoolSchema,
    casting: z.strictObject({
      cost: z.enum(['action', 'bonus', 'reaction', 'minutes', 'hours']),
      amount: z.int().positive().optional(),
      trigger: z.string().optional(),
    }),
    range: z.string().min(1),
    components: z.strictObject({ v: z.boolean(), s: z.boolean(), m: z.string().optional() }),
    duration: z.strictObject({
      text: z.string().min(1),
      /** Absent for instantaneous and "until dispelled" spells. */
      seconds: z.int().positive().optional(),
      concentration: z.boolean(),
    }),
    ritual: z.boolean(),
    save: AbilitySchema.optional(),
    attack: z.enum(['melee', 'ranged']).optional(),
    classes: z.array(refId('class')),
    /** Display only (D39). tags[0] is the main type; [] shows as utility. */
    tags: z.array(SpellTypeSchema),
    damage: SpellRollSchema.extend({ type: DamageTypeSchema }).optional(),
    heal: SpellRollSchema.optional(),
    effect: EffectTemplateSchema.optional(),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY)
  .refine(
    (spell) =>
      (spell.casting.cost !== 'minutes' && spell.casting.cost !== 'hours') ||
      spell.casting.amount !== undefined,
    { message: 'Casting in minutes or hours needs an amount', path: ['casting', 'amount'] },
  );

/** Source-backed display metadata only; target outcomes and damage reductions stay manual. */
export const FeatureDefensesSchema = z.strictObject({
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  saveAdvantages: z.array(z.union([ConditionSchema, DamageTypeSchema])).optional(),
  magicalSleepImmunity: z.boolean().optional(),
});

export const FeatureDefSchema = z
  .strictObject({
    kind: z.literal('feature'),
    id: refId('feature'),
    ...refBase,
    origin: z.enum(['race', 'class', 'subclass', 'background', 'feat', 'item', 'homebrew']),
    activation: z.enum(['passive', 'action', 'bonus', 'reaction', 'free', 'special']),
    /** Reactions: what lets you use it. */
    trigger: z.string().optional(),
    uses: z
      .strictObject({
        max: FormulaSchema,
        recharge: z.union([RechargeSchema, RechargeByLevelSchema]),
      })
      .optional(),
    /** Spends another feature's uses (Cutting Words spends Bardic Inspiration). */
    usesFrom: refId('feature').optional(),
    die: DieByLevelSchema.optional(),
    modifiers: z.array(ModifierSchema).optional(),
    defenses: FeatureDefensesSchema.optional(),
    /** Complex logic in `src/engine/hooks/<hook>.ts`. */
    hook: z.string().optional(),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY)
  .refine((feature) => feature.uses === undefined || feature.usesFrom === undefined, {
    message: 'A feature has its own uses or spends another feature’s uses, not both',
    path: ['usesFrom'],
  });

const ByClassLevelSchema = z.array(z.int().min(0)).length(20);

export const ClassDefSchema = z
  .strictObject({
    kind: z.literal('class'),
    id: refId('class'),
    ...refBase,
    hitDie: HitDieSchema,
    saves: z.array(AbilitySchema).length(2),
    spellcasting: z
      .strictObject({
        ability: AbilitySchema,
        progression: z.enum(['full', 'half', 'third', 'pact']),
        /** Index = class level − 1. */
        cantripsKnown: ByClassLevelSchema.optional(),
        /** Known casters only (Bard, Sorcerer, ...). Index = class level − 1. */
        spellsKnown: ByClassLevelSchema.optional(),
        ritual: z.enum(['known', 'prepared', 'none']),
      })
      .optional(),
    subclassLevel: z.int().min(1).max(20),
    features: z.array(
      z.strictObject({ level: z.int().min(1).max(20), featureId: refId('feature') }),
    ),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY);

export const SubclassDefSchema = z
  .strictObject({
    kind: z.literal('subclass'),
    id: refId('subclass'),
    ...refBase,
    classId: refId('class'),
    features: z.array(
      z.strictObject({ level: z.int().min(1).max(20), featureId: refId('feature') }),
    ),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY);

/** A subrace is a complete entry (parent's bonuses and features plus its own); `subraceOf` only groups it in pickers. */
export const RaceDefSchema = z
  .strictObject({
    kind: z.literal('race'),
    id: refId('race'),
    ...refBase,
    subraceOf: refId('race').optional(),
    size: z.enum(['small', 'medium']),
    speed: z.int().positive(),
    darkvision: z.int().positive().optional(),
    abilityBonuses: z.array(z.strictObject({ ability: AbilitySchema, value: z.int() })),
    /** Player-picked bonuses (Half-Elf: +1 to two abilities other than CHA). */
    abilityChoices: z
      .strictObject({
        count: z.int().positive(),
        value: z.int().positive(),
        exclude: z.array(AbilitySchema).optional(),
      })
      .optional(),
    languages: z.array(z.string()),
    featureIds: z.array(refId('feature')),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY);

export const BackgroundDefSchema = z
  .strictObject({
    kind: z.literal('background'),
    id: refId('background'),
    ...refBase,
    skills: z.array(SkillSchema),
    tools: z.array(refId('item')),
    featureIds: z.array(refId('feature')),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY);

const CURRENCY_UNITS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;

export const ItemRaritySchema = z.enum([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
  'varies',
]);

/**
 * Charges an item starts with and how it regains them. `regain` is absent only for items that
 * never recharge; 'all' refills automatically, while dice need the player's entered roll.
 */
/** Item recharge rolls also use d3 (Wand of Secrets: 1d3). */
const RegainDiceSchema = z
  .string()
  .regex(/^[1-9]\d*d(3|4|6|8|10|12|20)$/, 'Expected dice like "1d6"');

export const ItemChargesSchema = z
  .strictObject({
    max: z.int().positive(),
    recharge: RechargeSchema,
    regain: z
      .union([
        z.literal('all'),
        z.strictObject({ dice: RegainDiceSchema, bonus: z.int().positive().optional() }),
      ])
      .optional(),
  })
  .refine((charges) => (charges.recharge === 'none') === (charges.regain === undefined), {
    message: 'Only items that never recharge omit regain',
    path: ['regain'],
  });

/**
 * How one item is used up (data/mechanics/items.json). `action` costs your action in combat;
 * `special` takes the time the item states (a scroll uses the spell's casting time); `none`
 * is spent as part of something else, like ammunition. Effects beyond healing stay manual.
 */
export const ItemUseSchema = z.strictObject({
  activation: z.enum(['action', 'special', 'none']),
  /** Thrown or splashed as an attack (Acid, Holy Water); attacking ends your own Invisibility. */
  attack: z.literal(true).optional(),
  /** Hit points regained by the drinker: the entered dice roll plus the bonus. */
  healing: z.strictObject({ dice: DiceSchema, bonus: z.int().positive().optional() }).optional(),
});

export const ItemDefSchema = z
  .strictObject({
    kind: z.literal('item'),
    id: refId('item'),
    ...refBase,
    category: z.enum([
      'weapon',
      'armor',
      'gear',
      'tool',
      'instrument',
      'container',
      'consumable',
      'magic',
    ]),
    rarity: ItemRaritySchema.optional(),
    weight: z.number().min(0).optional(),
    cost: z.strictObject({ amount: z.number().min(0), unit: z.enum(CURRENCY_UNITS) }).optional(),
    /** Cost and weight are for this many (Arrows: 20). */
    bundle: z.int().min(2).optional(),
    weapon: z
      .strictObject({
        category: z.enum(['simple', 'martial']),
        type: z.enum(['melee', 'ranged']),
        /** Dice, or a flat number (Blowgun: 1). The Net deals no damage, so it has neither field. */
        damage: z.union([DiceSchema, z.int().positive()]).optional(),
        damageType: DamageTypeSchema.optional(),
        properties: z.array(WeaponPropertySchema),
        /** Ranged or thrown, in feet. */
        range: z.strictObject({ normal: z.int().positive(), long: z.int().positive() }).optional(),
        versatile: DiceSchema.optional(),
      })
      .refine((weapon) => (weapon.damage === undefined) === (weapon.damageType === undefined), {
        message: 'Weapon damage and damage type go together',
        path: ['damageType'],
      })
      .optional(),
    /** DEX limit follows the category: light full, medium +2, heavy none, shield adds baseAc. */
    armor: z
      .strictObject({
        category: z.enum(['light', 'medium', 'heavy', 'shield']),
        baseAc: z.int().positive(),
        strMin: z.int().positive().optional(),
        stealthDisadvantage: z.boolean(),
      })
      .optional(),
    attunement: z.boolean().optional(),
    charges: ItemChargesSchema.optional(),
    use: ItemUseSchema.optional(),
    /** Catalogue item this one counts as for weapon proficiency (a custom +1 rapier is a rapier). */
    baseItemId: refId('item').optional(),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY)
  .refine((item) => (item.category === 'weapon') === (item.weapon !== undefined), {
    message: 'Weapons, and only weapons, have weapon stats',
    path: ['weapon'],
  })
  .refine((item) => (item.category === 'armor') === (item.armor !== undefined), {
    message: 'Armor, and only armor, has armor stats',
    path: ['armor'],
  });

/** Id prefix for a character's own items. Bundled packs never use it. */
export const CUSTOM_ITEM_PREFIX = 'item.custom.';

/** An item the player defines. It lives on the build, so it travels with exports. */
export const CustomItemSchema = ItemDefSchema.refine(
  (item) =>
    item.id.startsWith(CUSTOM_ITEM_PREFIX) &&
    item.source === 'HB' &&
    !item.srd &&
    item.url === undefined,
  { message: 'Custom items use an item.custom. id, source HB and no book link', path: ['id'] },
);

export const ConditionDefSchema = z
  .strictObject({ kind: z.literal('condition'), id: refId('condition'), ...refBase })
  .refine(srdTextOnly, SRD_TEXT_ONLY);

export const RefEntrySchema = z.discriminatedUnion('kind', [
  SpellDefSchema,
  FeatureDefSchema,
  ClassDefSchema,
  SubclassDefSchema,
  RaceDefSchema,
  BackgroundDefSchema,
  ItemDefSchema,
  ConditionDefSchema,
]);

function uniqueIds(entries: { id: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate id ${entry.id}`, path: [index, 'id'] });
    }
    seen.add(entry.id);
  });
}

/** One JSON pack file: a list of entries with unique ids. */
export const RefPackSchema = z.array(RefEntrySchema).superRefine(uniqueIds);

/** `data/content/summaries.json`: own-words text for entries the SRD import created (DATA.md §7). */
export const SummaryOverlaySchema = z.strictObject({
  id: AnyRefIdSchema,
  summary: SummarySchema,
  summaryReviewed: z.boolean().optional(),
  url: z.url().optional(),
});

/** Identity, provenance and text never come from a mechanics overlay. */
const NOT_MECHANICS = [
  'kind',
  'name',
  'ruleset',
  'source',
  'srd',
  'fullText',
  'summary',
  'summaryReviewed',
  'url',
] as const;

/**
 * `data/mechanics/*.json`: rules data the source lacks (activation, uses, dice, modifiers,
 * effects, tags). Each field replaces the entry's field; the merged entry is then checked
 * against its own schema, so a misspelled field fails there.
 */
export const MechanicsOverlaySchema = z
  .looseObject({ id: AnyRefIdSchema, defenses: FeatureDefensesSchema.optional() })
  .refine((overlay) => NOT_MECHANICS.every((key) => !(key in overlay)), {
    message: `Mechanics overlays may not set ${NOT_MECHANICS.join(', ')} (text goes in data/content/)`,
  });

export const SummaryOverlayPackSchema = z.array(SummaryOverlaySchema).superRefine(uniqueIds);
export const MechanicsOverlayPackSchema = z.array(MechanicsOverlaySchema).superRefine(uniqueIds);

export type Summary = z.infer<typeof SummarySchema>;
export type Formula = z.infer<typeof FormulaSchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type FeatureDefenses = z.infer<typeof FeatureDefensesSchema>;
export type EffectTemplate = z.infer<typeof EffectTemplateSchema>;
export type SpellDef = z.infer<typeof SpellDefSchema>;
export type FeatureDef = z.infer<typeof FeatureDefSchema>;
export type ClassDef = z.infer<typeof ClassDefSchema>;
export type SubclassDef = z.infer<typeof SubclassDefSchema>;
export type RaceDef = z.infer<typeof RaceDefSchema>;
export type BackgroundDef = z.infer<typeof BackgroundDefSchema>;
export type ItemUse = z.infer<typeof ItemUseSchema>;
export type ItemDef = z.infer<typeof ItemDefSchema>;
export type ItemCharges = z.infer<typeof ItemChargesSchema>;
export type ItemRarity = z.infer<typeof ItemRaritySchema>;
export type ConditionDef = z.infer<typeof ConditionDefSchema>;
export type RefEntry = z.infer<typeof RefEntrySchema>;
export type SummaryOverlay = z.infer<typeof SummaryOverlaySchema>;
export type MechanicsOverlay = z.infer<typeof MechanicsOverlaySchema>;
