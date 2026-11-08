import { z } from 'zod';
import { AbilitySchema, SkillSchema } from './common';

/**
 * Beginner guidance for one class, subclass, race or background (DATA.md, Guidance). Written in
 * our own words. It only ever suggests: nothing here is applied to a character by itself.
 */
const Line = z.string().min(1).max(110);
const Why = z.object({ id: z.string().min(1), why: Line });

export const GuidanceKindSchema = z.enum(['class', 'subclass', 'race', 'background']);
export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const GuidanceSchema = z.object({
  id: z.string().min(1),
  kind: GuidanceKindSchema,
  pitch: z.string().min(1).max(160),
  difficulty: DifficultySchema.optional(),
  /** Best abilities first. Classes and subclasses only. */
  mainAbilities: z.array(AbilitySchema).max(3).optional(),
  strengths: z.array(Line).min(1).max(3),
  weaknesses: z.array(Line).min(1).max(3),
  /** Suggested skill picks, best first. */
  skills: z.array(SkillSchema).max(6).optional(),
  /** Suggested starting spells with a reason. Classes only. */
  starterSpells: z.array(Why).max(8).optional(),
  /** Pairings that work well, by registry id. */
  goodWith: z.array(Why).max(4).optional(),
});
export type Guidance = z.infer<typeof GuidanceSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;

export const GuidancePackSchema = z.array(GuidanceSchema);
