import { z } from 'zod';
import { ConditionSchema, NonNegativeInt, refId } from './common';

/**
 * The ally/enemy tracker (M15, D141): one encounter per character, saved in the live state.
 * You and your companions keep their HP and conditions where they already live; the encounter
 * owns only their place in the order. Allies and enemies keep their own HP here.
 */

export const COMBATANT_SIDES = ['you', 'companion', 'ally', 'enemy'] as const;
export const CombatantSideSchema = z.enum(COMBATANT_SIDES);

export const CombatantSchema = z
  .strictObject({
    id: z.string().min(1),
    /** "Goblin 2". */
    name: z.string().trim().min(1),
    side: CombatantSideSchema,
    /** Build companion id, for side "companion". */
    companionId: z.string().min(1).optional(),
    /** SRD or content statblock, when the combatant came from one. */
    creatureId: refId('creature').optional(),
    /** Allies and enemies only: their own numbers. */
    ac: NonNegativeInt.optional(),
    maxHp: NonNegativeInt.optional(),
    hp: NonNegativeInt.optional(),
    tempHp: NonNegativeInt.optional(),
    conditions: z.array(ConditionSchema),
    /** Added to the d20 the player enters. */
    initiativeBonus: z.int(),
    /** Absent until entered. */
    initiative: z.int().optional(),
    /** A companion that acts on your turn, straight after you. */
    withOwner: z.boolean().optional(),
    /** Set by the player; the tracker never decides it. */
    defeated: z.boolean(),
    note: z.string().max(200).optional(),
  })
  .superRefine((combatant, ctx) => {
    const own = combatant.side === 'ally' || combatant.side === 'enemy';
    const fields = ['ac', 'maxHp', 'hp', 'tempHp'] as const;
    for (const field of fields) {
      if (own && combatant[field] === undefined)
        ctx.addIssue({ code: 'custom', message: `${field} is required`, path: [field] });
      if (!own && combatant[field] !== undefined)
        ctx.addIssue({ code: 'custom', message: `${field} lives elsewhere`, path: [field] });
    }
    if (combatant.side === 'companion' && combatant.companionId === undefined)
      ctx.addIssue({ code: 'custom', message: 'A companion needs its id', path: ['companionId'] });
    if (
      combatant.hp !== undefined &&
      combatant.maxHp !== undefined &&
      combatant.hp > combatant.maxHp
    )
      ctx.addIssue({ code: 'custom', message: 'HP is above max HP', path: ['hp'] });
  });

export const EncounterSchema = z
  .strictObject({
    /** Its own id, so a shared tracker could be added later (D141). */
    id: z.string().min(1),
    /** 0 until the first turn starts. */
    round: NonNegativeInt,
    /** Whose turn it is; absent before the first turn. */
    currentId: z.string().min(1).optional(),
    combatants: z.array(CombatantSchema),
  })
  .superRefine((encounter, ctx) => {
    const ids = new Set<string>();
    encounter.combatants.forEach((combatant, index) => {
      if (ids.has(combatant.id))
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate combatant ${combatant.id}`,
          path: ['combatants', index, 'id'],
        });
      ids.add(combatant.id);
    });
    if (encounter.currentId !== undefined && !ids.has(encounter.currentId))
      ctx.addIssue({
        code: 'custom',
        message: 'Current combatant is missing',
        path: ['currentId'],
      });
    if (encounter.combatants.filter((entry) => entry.side === 'you').length > 1)
      ctx.addIssue({ code: 'custom', message: 'Only one combatant is you', path: ['combatants'] });
  });

export type CombatantSide = z.infer<typeof CombatantSideSchema>;
export type Combatant = z.infer<typeof CombatantSchema>;
export type Encounter = z.infer<typeof EncounterSchema>;
