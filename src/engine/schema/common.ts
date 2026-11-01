import { z } from 'zod';
import { ABILITIES } from '../calc/abilities';
import { CONDITIONS, DAMAGE_TYPES, SCHOOLS, SKILLS, WEAPON_PROPERTIES } from '../rules2014';

/** Version of every saved record (build, live, campaign). Bump it and add a migration together. */
export const SCHEMA_VERSION = 1;

export const RulesetSchema = z.literal('5e-2014');
export const SourceSchema = z.enum(['PHB', 'XGE', 'TCE', 'HB']);
export const AbilitySchema = z.enum(ABILITIES);
export const SkillSchema = z.enum(SKILLS);
export const ConditionSchema = z.enum(CONDITIONS);
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export const SchoolSchema = z.enum(SCHOOLS);
export const WeaponPropertySchema = z.enum(WEAPON_PROPERTIES);
export const RechargeSchema = z.enum(['short', 'long', 'dawn', 'none']);
export const DieSchema = z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
export const HitDieSchema = z.enum(['d6', 'd8', 'd10', 'd12']);
export const SpellTypeSchema = z.enum([
  'damage',
  'control',
  'healing',
  'buff',
  'debuff',
  'utility',
]);

/** Dice count + die, e.g. "3d6". Flat bonuses are added by the engine, never written here. */
export const DiceSchema = z
  .string()
  .regex(/^[1-9]\d*d(4|6|8|10|12|20|100)$/, 'Expected dice like "3d6"');

export const NonNegativeInt = z.int().min(0);

export const REF_KINDS = [
  'spell',
  'feature',
  'item',
  'condition',
  'class',
  'subclass',
  'race',
  'background',
] as const;
export type RefKind = (typeof REF_KINDS)[number];

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** Stable kebab id with a kind prefix: `spell.faerie-fire`, `feature.bard.cutting-words` (DATA.md §3). */
export function refId(kind: RefKind) {
  return z.string().regex(new RegExp(`^${kind}(?:\\.${SEGMENT})+$`), `Expected a "${kind}." id`);
}

export const AnyRefIdSchema = z
  .string()
  .regex(new RegExp(`^(?:${REF_KINDS.join('|')})(?:\\.${SEGMENT})+$`), 'Expected a reference id');

/** Key of a by-level table, as JSON stores it: "1" … "20". */
export const LevelKeySchema = z.string().regex(/^(?:[1-9]|1\d|20)$/, 'Expected a level 1–20');

export type Source = z.infer<typeof SourceSchema>;
export type Recharge = z.infer<typeof RechargeSchema>;
export type Die = z.infer<typeof DieSchema>;
export type HitDieName = z.infer<typeof HitDieSchema>;
export type SpellType = z.infer<typeof SpellTypeSchema>;
