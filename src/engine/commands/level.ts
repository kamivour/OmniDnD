import { z } from 'zod';
import { recordedLevel } from '../calc/advancement';
import { averageHpRoll, type HitDie } from '../calc/hp';
import { computeSheet } from '../calc/sheet';
import {
  CampaignSchema,
  CharacterBuildSchema,
  LiveStateSchema,
  refId,
  type HpEntry,
} from '../schema';
import { equalData } from './management';
import type { Check, Command, CommandContext } from './runner';
import { block, faces, rangeCheck, warn, withNotes } from './shared';

const LevelUpPayloadSchema = z.strictObject({
  classId: refId('class'),
  /** Absent: use the class die's fixed average. Die-specific roll bounds are checked below. */
  roll: z.number().optional(),
  expected: z
    .strictObject({ campaign: CampaignSchema, build: CharacterBuildSchema, live: LiveStateSchema })
    .optional(),
});

export type LevelUpPayload = z.infer<typeof LevelUpPayloadSchema>;

function safeCalculatedNumbers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.every(safeCalculatedNumbers);
  if (value && typeof value === 'object')
    return Object.entries(value).every(
      ([key, part]) => key === 'def' || safeCalculatedNumbers(part),
    );
  return true;
}

/** Check and Apply derive the same proposed level; neither replaces a saved snapshot. */
function prepare(ctx: CommandContext, input: LevelUpPayload) {
  const parsed = LevelUpPayloadSchema.safeParse(input);
  if (!parsed.success) return { checks: [block('Level-up details are invalid')] };
  const { classId, roll, expected } = parsed.data;
  const current = { campaign: ctx.campaign, build: ctx.build, live: ctx.live };
  if (expected !== undefined && !equalData(expected, current))
    return {
      checks: [
        block(
          'The character or campaign changed after this level-up was reviewed. Reopen Level up.',
        ),
      ],
    };
  const entries = ctx.build.classes.filter((entry) => entry.classId === classId);
  if (entries.length === 0)
    return { checks: [block('Multiclassing comes later: level up a class you have')] };
  if (entries.length !== 1)
    return {
      checks: [block('This class has multiple saved records. Review them before leveling up.')],
    };
  if (recordedLevel(ctx.build) >= 20) return { checks: [block('Already level 20')] };
  const def = ctx.registry.entries.get(classId);
  if (def?.kind !== 'class')
    return { checks: [block('The selected class reference is unavailable')] };
  const die = faces(def.hitDie);
  if (roll !== undefined) {
    const invalidRoll = rangeCheck('Hit Die roll', roll, 1, die);
    if (invalidRoll.length) return { checks: invalidRoll };
  }
  const checks: Check[] = [];
  if (roll !== undefined && ctx.campaign.hpMethod === 'average')
    checks.push(warn('Campaign uses average HP: using your roll'));
  if (roll === undefined && ctx.campaign.hpMethod === 'rolled')
    checks.push(warn('Campaign uses rolled HP: taking the average'));
  const hpEntry: HpEntry = {
    level: ctx.build.hpEntries.length + 1,
    classId,
    value: roll ?? averageHpRoll(die as HitDie),
    method: roll === undefined ? 'average' : 'rolled',
    floor: ctx.campaign.hpLevelFloor,
  };
  const build = {
    ...ctx.build,
    classes: ctx.build.classes.map((entry) =>
      entry.classId === classId ? { ...entry, level: entry.level + 1 } : entry,
    ),
    hpEntries: [...ctx.build.hpEntries, hpEntry],
  };
  if (!CharacterBuildSchema.safeParse(build).success)
    return { checks: [block('This level would leave invalid class or HP records')] };
  try {
    const nextSheet = computeSheet({ ...current, build }, ctx.registry);
    const before = ctx.sheet.maxHp.value;
    const after = nextSheet.maxHp.value;
    if (!Number.isSafeInteger(before) || !safeCalculatedNumbers(nextSheet))
      return { checks: [block('This level produces an unsafe calculated value')] };
    // D60: preserve damage taken, clamp a living character to 1..new max, and never revive 0 HP.
    const hp =
      ctx.live.hp > 0 ? Math.min(after, Math.max(1, ctx.live.hp + (after - before))) : ctx.live.hp;
    const live = { ...ctx.live, hp };
    if (!LiveStateSchema.safeParse(live).success)
      return { checks: [block('This level produces invalid current HP')] };
    return {
      checks,
      build,
      live,
      name: def.name,
      classLevel: entries[0]!.level + 1,
      before,
      after,
    };
  } catch {
    return {
      checks: [block('This level could not be calculated. Review the class and HP records.')],
    };
  }
}

/** One class level and one locked HP entry; spent resources and game time stay recorded. */
export const levelUp: Command<LevelUpPayload> = {
  name: 'levelUp',
  check: (ctx, input) => prepare(ctx, input).checks,
  apply: (draft, input, ctx) => {
    const next = prepare(ctx, input);
    if (!next.build || !next.live) throw new Error('Invalid level-up reached Apply');
    draft.build.classes = next.build.classes;
    draft.build.hpEntries = next.build.hpEntries;
    draft.live.hp = next.live.hp;
    return withNotes(
      `Level up: ${next.name} ${next.classLevel} (max HP ${next.before} → ${next.after})`,
      next.live.hp !== ctx.live.hp ? [`HP ${ctx.live.hp} → ${next.live.hp}`] : [],
    );
  },
};
