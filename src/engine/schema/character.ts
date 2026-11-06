import { z } from 'zod';
import { SKILLS } from '../rules2014';
import {
  AbilitySchema,
  AnyRefIdSchema,
  ConditionSchema,
  HitDieSchema,
  NonNegativeInt,
  refId,
  RulesetSchema,
  SCHEMA_VERSION,
  SkillSchema,
  SourceSchema,
  SpellTypeSchema,
} from './common';
import { CustomItemSchema, ModifierSchema } from './refs';

/** Campaign rules plus layers B (build) and C (live state). DATA.md §4. */

/** D44. `none`: a level adds roll + CON as is. `one`: each level adds at least 1. */
export const HpLevelFloorSchema = z.enum(['none', 'one']);

export const CampaignSchema = z.strictObject({
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  ruleset: RulesetSchema,
  leveling: z.enum(['xp', 'milestone']),
  hpMethod: z.enum(['average', 'rolled']),
  hpLevelFloor: HpLevelFloorSchema,
  abilityMethod: z.enum(['standard-array', 'point-buy', 'rolled']),
  sources: z.array(SourceSchema).min(1),
  /** All false unless the user enables them. */
  optionalRules: z.record(z.string(), z.boolean()),
});

const HpEntrySchema = z.strictObject({
  /** Character level this entry belongs to. */
  level: z.int().min(1).max(20),
  classId: refId('class'),
  /** The die result (or max / average). CON is added by the engine, never stored. */
  value: z.int().min(1).max(12),
  method: z.enum(['max', 'average', 'rolled']),
  /** Locked when the entry is made. Older entries use the campaign floor until frozen. */
  floor: HpLevelFloorSchema.optional(),
});

const SKILL_SET: ReadonlySet<string> = new Set(SKILLS);

export const CharacterBuildSchema = z
  .strictObject({
    id: z.string().min(1),
    schemaVersion: z.literal(SCHEMA_VERSION),
    campaignId: z.string().min(1),
    name: z.string().min(1),
    portrait: z.string().optional(),
    raceId: refId('race'),
    subraceId: refId('race').optional(),
    backgroundId: refId('background'),
    alignment: z.string().optional(),
    classes: z
      .array(
        z.strictObject({
          classId: refId('class'),
          subclassId: refId('subclass').optional(),
          level: z.int().min(1).max(20),
        }),
      )
      .min(1),
    /** Only used when the campaign levels by XP. */
    xp: NonNegativeInt.optional(),
    abilityScores: z.strictObject({
      /** Entered per campaign method. Final score = base + bonuses (computed). */
      base: z.record(AbilitySchema, z.int().min(1).max(30)),
      /** Racial, ASI, feat, item. */
      bonuses: z.array(
        z.strictObject({ source: z.string().min(1), ability: AbilitySchema, value: z.int() }),
      ),
    }),
    /** One entry per character level, locked once added (D15). */
    hpEntries: z.array(HpEntrySchema).min(1),
    proficiencies: z.strictObject({
      saves: z.array(AbilitySchema),
      skills: z.array(SkillSchema),
      /** Skills, or tools by item id. */
      expertise: z.array(z.union([SkillSchema, refId('item')])),
      armor: z.array(z.enum(['light', 'medium', 'heavy', 'shield'])),
      /** Weapon categories or single weapons by item id. */
      weapons: z.array(z.union([z.enum(['simple', 'martial']), refId('item')])),
      tools: z.array(refId('item')),
      languages: z.array(z.string().min(1)),
    }),
    spells: z.array(
      z.strictObject({
        classId: refId('class'),
        known: z.array(refId('spell')),
        prepared: z.array(refId('spell')).optional(),
      }),
    ),
    /** Per-character spell type override, edited in Manage (M4). */
    spellTags: z.record(refId('spell'), z.array(SpellTypeSchema)).optional(),
    favorites: z.array(AnyRefIdSchema),
    /** Extra features only: feats, DM grants, homebrew. Race, class, subclass and background features are derived from refs (D48). */
    featureIds: z.array(refId('feature')),
    choices: z.record(z.string(), z.unknown()),
    items: z.array(
      z.strictObject({
        instanceId: z.string().min(1),
        itemId: refId('item'),
        /** instanceId of the container it sits in. */
        container: z.string().optional(),
        notes: z.string().optional(),
      }),
    ),
    /** Items the player defined, by `item.custom.` id. Absent in older saves. */
    customItems: z.array(CustomItemSchema).optional(),
    journal: z.strictObject({
      personality: z.string().optional(),
      ideals: z.string().optional(),
      bonds: z.string().optional(),
      flaws: z.string().optional(),
      backstory: z.string().optional(),
      appearance: z.record(z.string(), z.string()).optional(),
      notes: z.string().optional(),
    }),
    overrides: z.array(
      z.strictObject({ path: z.string().min(1), value: z.unknown(), note: z.string() }),
    ),
  })
  .superRefine((build, ctx) => {
    const totalLevel = build.classes.reduce((sum, entry) => sum + entry.level, 0);
    if (totalLevel > 20) {
      ctx.addIssue({ code: 'custom', message: 'Total level is above 20', path: ['classes'] });
    }

    if (build.hpEntries.length !== totalLevel) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected ${totalLevel} HP entries (one per level), got ${build.hpEntries.length}`,
        path: ['hpEntries'],
      });
    }
    const classIds = new Set(build.classes.map((entry) => entry.classId));
    build.hpEntries.forEach((entry, index) => {
      if (entry.level !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          message: `HP entry ${index} should be for level ${index + 1}`,
          path: ['hpEntries', index, 'level'],
        });
      }
      if ((entry.level === 1) !== (entry.method === 'max')) {
        ctx.addIssue({
          code: 'custom',
          message: 'Level 1, and only level 1, takes the maximum hit die',
          path: ['hpEntries', index, 'method'],
        });
      }
      if (!classIds.has(entry.classId)) {
        ctx.addIssue({
          code: 'custom',
          message: `${entry.classId} is not one of the character's classes`,
          path: ['hpEntries', index, 'classId'],
        });
      }
    });

    const skills = new Set<string>(build.proficiencies.skills);
    build.proficiencies.expertise.forEach((id, index) => {
      if (SKILL_SET.has(id) && !skills.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Expertise in ${id} needs proficiency in it`,
          path: ['proficiencies', 'expertise', index],
        });
      }
    });

    const instanceIds = new Set<string>();
    build.items.forEach((item, index) => {
      if (instanceIds.has(item.instanceId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate item instance ${item.instanceId}`,
          path: ['items', index, 'instanceId'],
        });
      }
      instanceIds.add(item.instanceId);
    });

    const customIds = new Set<string>();
    build.customItems?.forEach((item, index) => {
      if (customIds.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate custom item ${item.id}`,
          path: ['customItems', index, 'id'],
        });
      }
      customIds.add(item.id);
    });
  });

/** Times are game seconds since Day 1 00:00 (D46). */
const GameSeconds = NonNegativeInt;

export const ActiveEffectSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  sourceId: AnyRefIdSchema.optional(),
  /** Absent: lasts until removed. */
  endsAt: GameSeconds.optional(),
  /** Ends when your concentration ends. */
  concentration: z.boolean(),
  conditions: z.array(ConditionSchema),
  modifiers: z.array(ModifierSchema),
  note: z.string().optional(),
});

export const EconomySchema = z.strictObject({
  actionUsed: z.boolean(),
  bonusUsed: z.boolean(),
  reactionUsed: z.boolean(),
  /** Feet moved this turn. */
  movementUsed: NonNegativeInt,
  /** Extra movement allowances from Dash; absent in legacy/default turns. */
  dashCount: NonNegativeInt.optional(),
  objectInteractionUsed: z.boolean(),
  /** Bonus-action spell rule: a spell was cast as a bonus action this turn. */
  bonusActionSpellCast: z.boolean(),
  /** Bonus-action spell rule: a spell other than a 1-action cantrip was cast this turn. */
  otherSpellCast: z.boolean(),
});

export const PendingConcentrationSaveSchema = z.strictObject({
  /** The damage command's unique event id. */
  id: z.string().min(1),
  dc: z.int().min(10),
});

export const LiveStateSchema = z
  .strictObject({
    characterId: z.string().min(1),
    schemaVersion: z.literal(SCHEMA_VERSION),
    hp: NonNegativeInt,
    tempHp: NonNegativeInt,
    /** Ordinary Inspiration, separate from Bardic Inspiration. Absent in older saves: false. */
    inspiration: z.boolean().optional(),
    deathSaves: z.strictObject({ success: z.int().min(0).max(3), fail: z.int().min(0).max(3) }),
    hitDiceSpent: z.partialRecord(HitDieSchema, NonNegativeInt),
    /** Index = spell level, so index 0 (cantrips) stays 0. Stores used, not remaining (D6). */
    slotsUsed: z.array(NonNegativeInt).length(10),
    pactSlotsUsed: NonNegativeInt.optional(),
    featureUsesSpent: z.record(refId('feature'), NonNegativeInt),
    /** Your own concentration (D41). effectId only when the spell put an effect on you. */
    concentration: z
      .strictObject({
        spellId: refId('spell'),
        slotLevel: z.int().min(1).max(9).optional(),
        endsAt: GameSeconds.optional(),
        effectId: z.string().optional(),
        /** Optional in version 1 saves; replacing/ending concentration removes its requests. */
        pendingSaves: z.array(PendingConcentrationSaveSchema).optional(),
      })
      .optional(),
    /** Only effects whose target is this character (D41). */
    effects: z.array(ActiveEffectSchema),
    conditions: z.array(ConditionSchema),
    exhaustion: z.int().min(0).max(6),
    /** Keyed by build item instanceId. */
    items: z.record(
      z.string(),
      z.strictObject({
        qty: NonNegativeInt,
        charges: NonNegativeInt.optional(),
        equipped: z.boolean(),
        attuned: z.boolean(),
        /** A dice regain is due; the player enters the roll or dismisses it (D117). */
        rechargePending: z.literal(true).optional(),
      }),
    ),
    currency: z.strictObject({
      cp: NonNegativeInt,
      sp: NonNegativeInt,
      ep: NonNegativeInt,
      gp: NonNegativeInt,
      pp: NonNegativeInt,
    }),
    clock: z.strictObject({ seconds: GameSeconds }),
    lastLongRestEnd: GameSeconds.optional(),
    combat: z
      .strictObject({
        /** No initiative or turn order (D42). Start Turn advances the round. */
        round: NonNegativeInt,
        /** True between Start Turn and End Turn. */
        turnActive: z.boolean(),
        economy: EconomySchema,
      })
      .optional(),
  })
  .superRefine((live, ctx) => {
    if (live.slotsUsed[0] !== 0) {
      ctx.addIssue({ code: 'custom', message: 'Cantrips use no slots', path: ['slotsUsed', 0] });
    }
    const effectIds = new Set<string>();
    live.effects.forEach((effect, index) => {
      if (effectIds.has(effect.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate effect id ${effect.id}`,
          path: ['effects', index, 'id'],
        });
      }
      effectIds.add(effect.id);
    });
    const effectId = live.concentration?.effectId;
    if (effectId !== undefined && !effectIds.has(effectId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Concentration points to missing effect ${effectId}`,
        path: ['concentration', 'effectId'],
      });
    }
    const saveIds = new Set<string>();
    live.concentration?.pendingSaves?.forEach((save, index) => {
      if (saveIds.has(save.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate concentration save ${save.id}`,
          path: ['concentration', 'pendingSaves', index, 'id'],
        });
      }
      saveIds.add(save.id);
    });
  });

export type HpLevelFloor = z.infer<typeof HpLevelFloorSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
export type CharacterBuild = z.infer<typeof CharacterBuildSchema>;
export type HpEntry = z.infer<typeof HpEntrySchema>;
export type ActiveEffect = z.infer<typeof ActiveEffectSchema>;
export type Economy = z.infer<typeof EconomySchema>;
export type PendingConcentrationSave = z.infer<typeof PendingConcentrationSaveSchema>;
export type LiveState = z.infer<typeof LiveStateSchema>;
