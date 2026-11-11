import { z } from 'zod';
import {
  AbilitySchema,
  AnyRefIdSchema,
  ConditionSchema,
  DamageTypeSchema,
  DiceSchema,
  NonNegativeInt,
  RechargeSchema,
  refId,
} from './common';

/** Companions: pets, mounts, familiars, summons and sidekicks. The definition lives in the build; HP and the rest in live state (DATA.md §4). */

export const COMPANION_TYPES = ['pet', 'mount', 'familiar', 'summon', 'sidekick'] as const;
export const CompanionTypeSchema = z.enum(COMPANION_TYPES);

/**
 * A fixed number, or one worked out from the owner: base, plus a multiple of the owner's
 * level (one class's level when `classId` is set), plus an owner ability modifier, plus a
 * multiple of the owner's proficiency bonus.
 */
export const OwnerNumberSchema = z.union([
  z.int(),
  z.strictObject({
    base: z.int().optional(),
    ownerLevel: z.int().optional(),
    classId: refId('class').optional(),
    ownerAbilityMod: AbilitySchema.optional(),
    ownerProficiency: z.int().optional(),
    /** Adds the owner's best spell attack modifier (a summoned creature attacks with it). */
    ownerSpellAttack: z.boolean().optional(),
    /** The result is at least this many times the owner's level (the Ranger's companion HP). */
    atLeastOwnerLevel: z.int().optional(),
  }),
]);

export const CompanionAttackSchema = z.strictObject({
  name: z.string().trim().min(1),
  bonus: OwnerNumberSchema,
  damage: z
    .strictObject({
      dice: DiceSchema.optional(),
      bonus: OwnerNumberSchema.optional(),
      type: DamageTypeSchema,
    })
    .optional(),
  /** "5 ft." or "80/320 ft." */
  range: z.string().optional(),
  note: z.string().optional(),
});

export const CompanionUseSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  max: z.int().positive(),
  recharge: RechargeSchema,
});

export const CompanionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  type: CompanionTypeSchema,
  iconId: z.string().optional(),
  /** What it is, e.g. "Medium beast". */
  kind: z.string().optional(),
  ac: OwnerNumberSchema,
  maxHp: OwnerNumberSchema,
  /** Feet per round by movement type. */
  speed: z.strictObject({
    walk: NonNegativeInt.optional(),
    fly: NonNegativeInt.optional(),
    swim: NonNegativeInt.optional(),
    climb: NonNegativeInt.optional(),
    burrow: NonNegativeInt.optional(),
  }),
  abilities: z.record(AbilitySchema, z.int().min(1).max(30)),
  attacks: z.array(CompanionAttackSchema),
  /** Short own-words notes: senses, traits, special actions. */
  traits: z.array(z.string().trim().min(1)),
  uses: z.array(CompanionUseSchema),
  /** Creatures sharing a key count together toward the max (one Eldritch Cannon at a time). */
  limit: z.strictObject({ key: z.string().min(1), max: z.int().positive() }).optional(),
  /** Game seconds a created companion lasts; absent: until dismissed or destroyed. */
  durationSeconds: z.int().positive().optional(),
  /** The spell or feature that provides it. */
  sourceId: AnyRefIdSchema.optional(),
  notes: z.string().optional(),
});

export const COMPANION_STATUSES = ['active', 'dismissed', 'destroyed'] as const;

/** Independent of the owner: its own HP, conditions and uses. */
export const CompanionLiveSchema = z.strictObject({
  status: z.enum(COMPANION_STATUSES),
  hp: NonNegativeInt,
  tempHp: NonNegativeInt,
  conditions: z.array(ConditionSchema),
  /** Keyed by the definition's use id. Stores used, not remaining. */
  usesSpent: z.record(z.string(), NonNegativeInt),
  /** Game seconds when it expires. */
  endsAt: NonNegativeInt.optional(),
  initiative: z.int().optional(),
});

export type CompanionType = z.infer<typeof CompanionTypeSchema>;
export type OwnerNumber = z.infer<typeof OwnerNumberSchema>;
export type CompanionAttack = z.infer<typeof CompanionAttackSchema>;
export type CompanionUse = z.infer<typeof CompanionUseSchema>;
export type Companion = z.infer<typeof CompanionSchema>;
export type CompanionStatus = (typeof COMPANION_STATUSES)[number];
export type CompanionLive = z.infer<typeof CompanionLiveSchema>;
