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
  z.strictObject({
    abilityMod: AbilitySchema,
    min: z.int().optional(),
    /** Added after the minimum is applied (Divine Sense: 1 + CHA). */
    plus: z.int().optional(),
  }),
  z.strictObject({ proficiency: z.enum(['half', 'full', 'double']) }),
  /** A count that grows with the feature's level (Rage, Action Surge). */
  z.strictObject({ byLevel: z.record(LevelKeySchema, z.int().min(0)) }),
  /** The feature's level times this number (Ki points, sorcery points). */
  z.strictObject({ perLevel: z.int().positive() }),
]);

export const RechargeByLevelSchema = z.record(LevelKeySchema, RechargeSchema);
export const DieByLevelSchema = z.record(LevelKeySchema, DieSchema);

export const ModifierSchema = z.strictObject({
  target: z.enum(['ac', 'initiative', 'speed', 'saves', 'checks', 'unproficient-checks', 'hp']),
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
    /** Reference retained for older saves after removing an incompatible spell from play. */
    retired: z.literal(true).optional(),
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
  /** Conditions you cannot gain (Aura of Courage: frightened, while conscious). */
  conditionImmunities: z.array(ConditionSchema).optional(),
});

export const FeatGrantsSchema = z.strictObject({
  /** +1 to one of these abilities (the player picks when there is more than one). */
  ability: z.array(AbilitySchema).optional(),
  /** Also gain proficiency in the saving throw of the ability picked (Resilient). */
  saveFromAbility: z.boolean().optional(),
  /** Free skill proficiencies the player picks (Skilled). */
  skills: z.int().positive().optional(),
  armor: z.array(z.enum(['light', 'medium', 'heavy', 'shield'])).optional(),
});

const ArmorCategorySchema = z.enum(['light', 'medium', 'heavy', 'shield']);

/** One pick a feature asks for: a skill, tool or language, expertise in a skill, or darkvision (Custom Lineage). */
export const ProficiencyChoiceSchema = z.strictObject({
  count: z.int().positive(),
  /** What each pick may be; with several kinds the player picks any mix (Samurai: a skill or a language). */
  kinds: z.array(z.enum(['skill', 'tool', 'language', 'expertise', 'darkvision', 'weapon'])).min(1),
  /** Skill picks (and expertise picks) come from these skills; absent means any skill. */
  skills: z.array(SkillSchema).optional(),
  /** Tool picks come from these tools, or a tool group. */
  tools: z.union([z.array(refId('item')), z.enum(['artisan', 'gaming', 'any'])]).optional(),
  weapons: z.array(refId('item')).optional(),
  /** Picked skills also get double proficiency (Blessings of Knowledge). */
  expertise: z.boolean().optional(),
});

/** Proficiencies a race trait or class feature gives while the character has it. */
export const FeatureProficienciesSchema = z.strictObject({
  saves: z.array(AbilitySchema).optional(),
  skills: z.array(SkillSchema).optional(),
  /** Double proficiency in these skills (Survivalist). */
  expertise: z.array(SkillSchema).optional(),
  armor: z.array(ArmorCategorySchema).optional(),
  weapons: z.array(z.union([z.enum(['simple', 'martial']), refId('item')])).optional(),
  tools: z.array(refId('item')).optional(),
  languages: z.array(z.string().min(1)).optional(),
  choose: z.array(ProficiencyChoiceSchema).optional(),
});

/** How often a feat or racial spell can be cast without a slot: per long rest, per short rest, or at will. */
export const FreeCastSchema = z.enum(['long', 'short', 'will']);

/**
 * Spells a feat or racial trait teaches (Magic Initiate, Fey Touched, Infernal Legacy). The
 * spells are cast with this ability, outside any class's lists and limits.
 */
export const FeatureSpellsSchema = z.strictObject({
  /** Class-list grants use the owning class's casting stats and leave its normal limits intact. */
  castingClassId: refId('class').optional(),
  requiredSubclassId: refId('subclass').optional(),
  /** A fixed ability, the ability the feat raised, or the spellcasting ability of the picked class. */
  ability: z.union([AbilitySchema, z.enum(['raised', 'class'])]),
  /** The player picks one of these classes; its spell list supplies `fromClass` picks. */
  classOptions: z.array(refId('class')).optional(),
  /** The spells can also be cast with spell slots of the right level. */
  slots: z.boolean(),
  /** The spells can be cast as rituals. If slots are disabled, ritual casting is the only mode. */
  ritual: z.literal(true).optional(),
  fixed: z
    .array(
      z.strictObject({
        spellId: refId('spell'),
        free: FreeCastSchema.optional(),
        /** Class level for a class-list grant, character level otherwise. */
        minLevel: z.int().min(1).max(20).optional(),
        /** The free casting is at this spell level (Infernal Legacy: hellish rebuke as 2nd level). */
        castLevel: z.int().min(1).max(9).optional(),
      }),
    )
    .optional(),
  /** Spells the player picks. Each pick in one feature has its own spell level. */
  picks: z
    .array(
      z.strictObject({
        count: z.int().positive(),
        level: z.int().min(0).max(9),
        spellIds: z.array(refId('spell')).optional(),
        schools: z.array(SchoolSchema).optional(),
        /** From the picked class's spell list. */
        fromClass: z.boolean().optional(),
        /** From one of these class lists. */
        classes: z.array(refId('class')).optional(),
        /** Only spells that make an attack roll (Spell Sniper). */
        attack: z.boolean().optional(),
        /** Only spells with the ritual tag (Ritual Caster). */
        ritual: z.boolean().optional(),
        free: FreeCastSchema.optional(),
      }),
    )
    .optional(),
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
    /** Pool uses spent per activation (Quickened Healing: 2 ki). */
    cost: z.int().min(2).optional(),
    /** Also spends one use of this feature's pool (Harness Divine Power spends Channel Divinity). */
    alsoSpends: refId('feature').optional(),
    /** Regain one expended spell slot of level up to half the proficiency bonus, rounded up. */
    restoreSlot: z.literal(true).optional(),
    /** Lasts while you concentrate, as if on a spell (Favored Foe). */
    concentration: z.literal(true).optional(),
    /** Only before moving this turn; speed drops to 0 for the rest of the turn (Steady Aim). */
    stationary: z.literal(true).optional(),
    /** Added to the die roll: the proficiency bonus (Quickened Healing) or a number (Healer: 4). */
    dieBonus: z.union([z.literal('proficiency'), z.int().min(1)]).optional(),
    /** Warns on use when this item is not carried (Healer: a healer's kit). */
    needsItem: refId('item').optional(),
    /** Short reminder added to the log on use (Healer: plus the target's Hit Dice). */
    useNote: z.string().optional(),
    /** Grants you temporary HP equal to your level + this ability's modifier (Inspiring Leader). */
    tempHp: z.strictObject({ abilityMod: AbilitySchema }).optional(),
    die: DieByLevelSchema.optional(),
    /** Display only: a dice count that grows with level (Sneak Attack). */
    dice: z.record(LevelKeySchema, DiceSchema).optional(),
    /** Display only: a flat bonus that grows with level (Rage damage). */
    bonus: z.record(LevelKeySchema, z.int()).optional(),
    /** Attacks per Attack action at this level (Extra Attack: 2; fighter 3 at 11, 4 at 20). */
    attacks: z.record(LevelKeySchema, z.int().min(2).max(4)).optional(),
    /** Extra weapon damage dice on a melee critical hit (Savage Attacks, Brutal Critical). */
    critDice: z.record(LevelKeySchema, z.int().min(1).max(3)).optional(),
    /** Raises how many magic items you can attune to at once (Magic Item Adept: 4). */
    attunementSlots: z.int().min(4).max(6).optional(),
    /** Use at 0 HP to stand back up at 1 HP instead (Relentless Endurance). */
    dropToOne: z.literal(true).optional(),
    /** Spend a spell slot on a hit for extra damage (Divine Smite, Eldritch Smite). */
    smite: z
      .object({
        /** Dice for a 1st-level slot; each slot level above adds one die. */
        dice: z.int().min(1),
        die: DieSchema,
        /** Cap before the bonus die (Divine Smite: 5). */
        maxDice: z.int().min(1).optional(),
        type: DamageTypeSchema,
        /** One more die against these targets (Divine Smite: "undead or fiend"). */
        bonusVs: z.string().optional(),
        /** Only Pact Magic slots may pay (Eldritch Smite). */
        pactOnly: z.boolean().optional(),
        /** Reminder added to the log line. */
        note: z.string().optional(),
      })
      .optional(),
    /** A draconic ancestry pick: its damage type, plus the breath weapon's save and area for Dragonborn. */
    ancestry: z
      .strictObject({
        type: DamageTypeSchema,
        save: AbilitySchema.optional(),
        area: z.string().optional(),
      })
      .optional(),
    /** Breath Weapon: save DC 8 + this ability + proficiency; save, area and type come from the ancestry pick. */
    breath: z.strictObject({ ability: AbilitySchema }).optional(),
    /** Elemental Affinity: add this ability's modifier to one damage roll of a spell of the ancestry's type. */
    affinity: z.strictObject({ ability: AbilitySchema }).optional(),
    /** Elemental Adept pick: spells of this damage type ignore resistance and treat 1s as 2s. */
    elementalAdept: DamageTypeSchema.optional(),
    /** Extra damage on every hit with a melee weapon (Improved Divine Smite). */
    meleeDamage: z.object({ dice: DiceSchema, type: DamageTypeSchema }).optional(),
    /** Once per turn extra weapon damage (Divine Strike); 'weapon' uses the weapon's own type, a list is a choice. */
    weaponStrike: z
      .strictObject({
        dice: z.record(LevelKeySchema, DiceSchema),
        type: z.union([DamageTypeSchema, z.literal('weapon'), z.array(DamageTypeSchema).min(2)]),
      })
      .optional(),
    /** Add this ability's modifier to damage of this class's spells (Potent Spellcasting, Empowered Evocation). */
    spellDamageBonus: z
      .strictObject({
        ability: AbilitySchema,
        classId: refId('class'),
        cantripsOnly: z.literal(true).optional(),
        school: SchoolSchema.optional(),
      })
      .optional(),
    /** Optional -5 to hit for +10 damage with proficient weapons (Great Weapon Master, Sharpshooter). */
    powerAttack: z.enum(['heavy-melee', 'ranged']).optional(),
    modifiers: z.array(ModifierSchema).optional(),
    /** Dual Wielder: +1 AC while a melee weapon is equipped in each hand (two melee weapons, no shield). */
    dualWieldAc: z.literal(true).optional(),
    /** Soul of Artifice: +1 to every saving throw for each attuned item. */
    attunedSaves: z.literal(true).optional(),
    /** Reminders shown beside a save, initiative or ability checks (Evasion, Reliable Talent). */
    rollNotes: z
      .array(
        z.strictObject({
          on: z.union([AbilitySchema, z.enum(['initiative', 'checks'])]),
          text: z.string(),
        }),
      )
      .optional(),
    /** Feats: what taking the feat adds to the build, applied once when it is picked. */
    grants: FeatGrantsSchema.optional(),
    /** Spells the feature teaches, cast outside class lists. */
    spells: FeatureSpellsSchema.optional(),
    /** Proficiencies the feature gives while the character has it, fixed or picked. */
    proficiencies: FeatureProficienciesSchema.optional(),
    /** Tasha optional class feature: granted at this class level when the campaign enables them. */
    optional: z
      .strictObject({
        classId: refId('class'),
        level: z.int().min(1).max(20),
        replaces: refId('feature').optional(),
      })
      .optional(),
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

/** Class-level casting; spellcasting subclasses (Eldritch Knight, Arcane Trickster) reuse it. */
const SpellcastingSchema = z.strictObject({
  ability: AbilitySchema,
  progression: z.enum(['full', 'half', 'third', 'artificer', 'pact']),
  /** Index = class level − 1. */
  cantripsKnown: ByClassLevelSchema.optional(),
  /** Known casters only (Bard, Sorcerer, ...). Index = class level − 1. */
  spellsKnown: ByClassLevelSchema.optional(),
  ritual: z.enum(['known', 'prepared', 'none']),
  /** Subclass casters: the class whose spell list supplies the choices. */
  spellList: refId('class').optional(),
});

export const ClassDefSchema = z
  .strictObject({
    kind: z.literal('class'),
    id: refId('class'),
    ...refBase,
    hitDie: HitDieSchema,
    saves: z.array(AbilitySchema).length(2),
    spellcasting: SpellcastingSchema.optional(),
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
    spellcasting: SpellcastingSchema.optional(),
    /** Extra candidates the subclass adds to its class list, never learned automatically. */
    expandedSpellIds: z.array(refId('spell')).optional(),
    /** Other class lists this subclass can learn from, such as Divine Soul's cleric spells. */
    additionalSpellLists: z.array(refId('class')).optional(),
    /**
     * Domain, oath and similar spells by class level: always prepared (or known) and never
     * counted against the class's limits.
     */
    grantedSpells: z
      .array(
        z.strictObject({
          level: z.int().min(1).max(20),
          spellIds: z.array(refId('spell')).min(1),
        }),
      )
      .optional(),
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
    /** Extra skills the player picks from any skill. */
    skillChoices: z.int().positive().optional(),
    /** Extra languages the player picks. */
    languageChoices: z.int().positive().optional(),
    /** Tools the player picks, from the named group. */
    toolChoices: z
      .array(
        z.strictObject({
          count: z.int().positive(),
          group: z.enum(['gaming', 'artisan', 'instrument', 'any']),
        }),
      )
      .optional(),
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
export const ItemUseSchema = z
  .strictObject({
    activation: z.enum(['action', 'special', 'none']),
    /** A drinkable potion; the campaign's self-drinking house rule applies only to these. */
    potion: z.literal(true).optional(),
    /** Thrown or splashed as an attack (Acid, Holy Water); attacking ends your own Invisibility. */
    attack: z.literal(true).optional(),
    /** Hit points regained by the drinker: the entered dice roll plus the bonus. */
    healing: z.strictObject({ dice: DiceSchema, bonus: z.int().positive().optional() }).optional(),
  })
  .refine((use) => !use.potion || (use.activation === 'action' && !use.attack), {
    message: 'A drinkable potion uses an action by default and is not a thrown attack',
    path: ['potion'],
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
    /** Published magic-item type for catalog filters, independent of the inventory category. */
    magicType: z
      .enum(['armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous'])
      .optional(),
    weight: z.number().min(0).optional(),
    cost: z.strictObject({ amount: z.number().min(0), unit: z.enum(CURRENCY_UNITS) }).optional(),
    /** Cost and weight are for this many (Arrows: 20). */
    bundle: z.int().min(2).optional(),
    /** What one counts as, for items the player measures ("liter of water"); weight is per unit. */
    unit: z.string().trim().min(1).max(40).optional(),
    /** How much a container holds. Contents of an extradimensional one add no carried weight. */
    storage: z
      .strictObject({
        pounds: z.number().positive().optional(),
        cubicFeet: z.number().positive().optional(),
        extradimensional: z.literal(true).optional(),
        /** Separate spaces (Handy Haversack pouches); pounds and cubicFeet are their totals. */
        spaces: z
          .array(
            z.strictObject({
              name: z.string().min(1),
              pounds: z.number().positive(),
              cubicFeet: z.number().positive(),
            }),
          )
          .optional(),
      })
      .optional(),
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
    /** Book's attunement prerequisite, for reference. */
    attunementBy: z.string().trim().min(1).optional(),
    charges: ItemChargesSchema.optional(),
    use: ItemUseSchema.optional(),
    /** Catalogue item this one counts as for weapon proficiency (a custom +1 rapier is a rapier). */
    baseItemId: refId('item').optional(),
  })
  .refine(srdTextOnly, SRD_TEXT_ONLY)
  .refine((item) => item.attunementBy === undefined || item.attunement === true, {
    message: 'Only attuned items have an attunement prerequisite',
    path: ['attunementBy'],
  })
  .refine((item) => (item.category === 'weapon') === (item.weapon !== undefined), {
    message: 'Weapons, and only weapons, have weapon stats',
    path: ['weapon'],
  })
  .refine((item) => (item.category === 'armor') === (item.armor !== undefined), {
    message: 'Armor, and only armor, has armor stats',
    path: ['armor'],
  })
  .refine((item) => item.storage === undefined || item.category === 'container', {
    message: 'Only containers hold other items',
    path: ['storage'],
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

const CreatureTextSchema = z.strictObject({
  name: z.string().min(1),
  text: z.string().min(1),
  /** "Recharge 5–6", "3/day" and similar. */
  usage: z.string().optional(),
  attackBonus: z.int().optional(),
  damage: z
    .array(
      z.strictObject({
        dice: z.string().regex(/^\d+(?:d\d+)?(?:[+-]\d+)?$/, 'Expected dice like "2d6+3"'),
        type: DamageTypeSchema,
      }),
    )
    .optional(),
});

const SpeedFeetSchema = z.int().min(0);
const SensesSchema = z.strictObject({
  darkvision: z.int().positive().optional(),
  blindsight: z.int().positive().optional(),
  truesight: z.int().positive().optional(),
  tremorsense: z.int().positive().optional(),
  passivePerception: z.int().min(0),
});

/** A statblock: monsters, animals and NPCs (SRD import, or our own words in data/content/). */
export const CreatureDefSchema = z
  .strictObject({
    kind: z.literal('creature'),
    id: refId('creature'),
    ...refBase,
    size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']),
    /** "beast", "humanoid (goblinoid)", "swarm of Tiny beasts". */
    creatureType: z.string().min(1),
    alignment: z.string().min(1),
    ac: z.int().min(0),
    /** Armor worn, or the other ways the number changes ("15 with mage armor"). */
    acNote: z.string().optional(),
    hp: z.int().min(1),
    /** Hit dice with the flat bonus, e.g. "2d6+4". */
    hpFormula: z.string().regex(/^\d+d\d+(?:[+-]\d+)?$/),
    speed: z.strictObject({
      walk: SpeedFeetSchema.optional(),
      fly: SpeedFeetSchema.optional(),
      swim: SpeedFeetSchema.optional(),
      climb: SpeedFeetSchema.optional(),
      burrow: SpeedFeetSchema.optional(),
      hover: z.boolean().optional(),
    }),
    abilities: z.strictObject({
      STR: z.int().min(1).max(30),
      DEX: z.int().min(1).max(30),
      CON: z.int().min(1).max(30),
      INT: z.int().min(1).max(30),
      WIS: z.int().min(1).max(30),
      CHA: z.int().min(1).max(30),
    }),
    /** Total modifiers, not proficiency flags. */
    saves: z.partialRecord(AbilitySchema, z.int()).optional(),
    skills: z.partialRecord(SkillSchema, z.int()).optional(),
    /** Plain text, with the qualifier when there is one. */
    vulnerabilities: z.array(z.string()),
    resistances: z.array(z.string()),
    immunities: z.array(z.string()),
    conditionImmunities: z.array(z.string()),
    senses: SensesSchema,
    languages: z.string(),
    /** 0.125, 0.25 and 0.5 are the fractions. */
    cr: z.number().min(0),
    xp: z.int().min(0),
    proficiencyBonus: z.int().min(2),
    traits: z.array(CreatureTextSchema),
    actions: z.array(CreatureTextSchema),
    reactions: z.array(CreatureTextSchema),
    legendaryActions: z.array(CreatureTextSchema),
  })
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
  CreatureDefSchema,
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
  name: z.string().min(1).optional(),
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
export type FeatureSpells = z.infer<typeof FeatureSpellsSchema>;
export type FeatureProficiencies = z.infer<typeof FeatureProficienciesSchema>;
export type ProficiencyChoice = z.infer<typeof ProficiencyChoiceSchema>;
export type FreeCast = z.infer<typeof FreeCastSchema>;
export type ClassDef = z.infer<typeof ClassDefSchema>;
export type SubclassDef = z.infer<typeof SubclassDefSchema>;
export type RaceDef = z.infer<typeof RaceDefSchema>;
export type BackgroundDef = z.infer<typeof BackgroundDefSchema>;
export type ItemUse = z.infer<typeof ItemUseSchema>;
export type ItemDef = z.infer<typeof ItemDefSchema>;
export type ItemCharges = z.infer<typeof ItemChargesSchema>;
export type ItemRarity = z.infer<typeof ItemRaritySchema>;
export type ConditionDef = z.infer<typeof ConditionDefSchema>;
export type CreatureDef = z.infer<typeof CreatureDefSchema>;
export type RefEntry = z.infer<typeof RefEntrySchema>;
export type SummaryOverlay = z.infer<typeof SummaryOverlaySchema>;
export type MechanicsOverlay = z.infer<typeof MechanicsOverlaySchema>;
