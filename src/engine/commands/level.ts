import { z } from 'zod';
import { recordedLevel } from '../calc/advancement';
import { applyLevelChoices, LevelChoicesSchema } from '../calc/level-choices';
import { applyLevelSpells, LevelSpellsSchema } from '../calc/level-spells';
import { optionalRules } from '../calc/campaign-rules';
import { averageHpRoll, type HitDie } from '../calc/hp';
import { MULTICLASS_RULES, meetsMinimum, minimumText } from '../calc/multiclass';
import { computeSheet } from '../calc/sheet';
import {
  CampaignSchema,
  CharacterBuildSchema,
  LiveStateSchema,
  refId,
  SkillSchema,
  type HpEntry,
  type CharacterBuild,
} from '../schema';
import { equalData } from './management';
import type { Check, Command, CommandContext } from './runner';
import { block, faces, rangeCheck, warn, withNotes } from './shared';

const LevelUpPayloadSchema = z.strictObject({
  classId: refId('class'),
  /** Absent: use the class die's fixed average. Die-specific roll bounds are checked below. */
  roll: z.number().optional(),
  /** Multiclass only: the skill and instrument a new class lets you pick. */
  choices: LevelChoicesSchema.optional(),
  spells: LevelSpellsSchema.optional(),
  skill: SkillSchema.optional(),
  tool: refId('item').optional(),
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

/** PHB 2014 multiclassing: campaign switch, 13+ in the old and new classes' abilities, then the smaller proficiency set. */
function multiclassGrants(
  ctx: CommandContext,
  classId: string,
  className: string,
  skill: string | undefined,
  tool: string | undefined,
): { blocked: string } | { checks: Check[]; proficiencies: CharacterBuild['proficiencies'] } {
  if (!optionalRules(ctx.campaign).multiclassing)
    return { blocked: 'Multiclassing is off in this campaign' };
  const rule = MULTICLASS_RULES[classId];
  if (!rule) return { blocked: `${className} has no multiclass rules in this app yet` };
  const score = (ability: keyof typeof ctx.sheet.abilities) =>
    ctx.sheet.abilities[ability].score.value;
  for (const [id, label] of [
    ...ctx.build.classes.map((entry) => [entry.classId, 'current'] as const),
    [classId, 'new'] as const,
  ]) {
    const needs = MULTICLASS_RULES[id];
    if (needs && !meetsMinimum(needs, score)) {
      const name = ctx.registry.entries.get(id)?.name ?? id;
      return { blocked: `The ${label} class ${name} needs ${minimumText(needs)}` };
    }
  }
  const have = ctx.build.proficiencies;
  const checks: Check[] = [];
  const skills = [...have.skills];
  if (rule.skill) {
    if (skill === undefined) return { blocked: `Pick a skill for ${className}` };
    if (rule.skill !== 'any' && !rule.skill.includes(skill as never))
      return { blocked: `${className} does not offer that skill` };
    if (skills.includes(skill as never)) checks.push(warn('You already have that skill'));
    else skills.push(skill as never);
  } else if (skill !== undefined) return { blocked: `${className} grants no skill` };
  const tools = [...have.tools];
  if (rule.tool === 'instrument') {
    const item = tool === undefined ? undefined : ctx.registry.entries.get(tool);
    if (item?.kind !== 'item' || item.category !== 'instrument')
      return { blocked: 'Pick a musical instrument' };
    if (!tools.includes(tool!)) tools.push(tool!);
  } else if (rule.tool) {
    if (!tools.includes(rule.tool)) tools.push(rule.tool);
    if (tool !== undefined) return { blocked: `${className} grants a fixed tool` };
  } else if (tool !== undefined) return { blocked: `${className} grants no tool` };
  const merge = <T>(list: T[], more: T[]) => [...list, ...more.filter((x) => !list.includes(x))];
  return {
    checks,
    proficiencies: {
      ...have,
      skills,
      tools,
      armor: merge(have.armor, rule.armor),
      weapons: merge(have.weapons, rule.weapons),
    },
  };
}

/** Check and Apply derive the same proposed level; neither replaces a saved snapshot. */
function prepare(ctx: CommandContext, input: LevelUpPayload) {
  const parsed = LevelUpPayloadSchema.safeParse(input);
  if (!parsed.success) return { checks: [block('Level-up details are invalid')] };
  const { classId, roll, skill, tool, expected, choices, spells } = parsed.data;
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
  if (entries.length > 1)
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
  let proficiencies: CharacterBuild['proficiencies'] = ctx.build.proficiencies;
  if (entries.length === 0) {
    const added = multiclassGrants(ctx, classId, def.name, skill, tool);
    if ('blocked' in added) return { checks: [block(added.blocked)] };
    checks.push(...added.checks);
    proficiencies = added.proficiencies;
  }
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
    proficiencies,
    classes:
      entries.length === 0
        ? [...ctx.build.classes, { classId, level: 1 }]
        : ctx.build.classes.map((entry) =>
            entry.classId === classId ? { ...entry, level: entry.level + 1 } : entry,
          ),
    hpEntries: [...ctx.build.hpEntries, hpEntry],
  };
  const applied = applyLevelChoices({
    campaign: ctx.campaign,
    build,
    registry: ctx.registry,
    score: (ability) => ctx.sheet.abilities[ability].score.value,
    classId,
    newLevel: (entries[0]?.level ?? 0) + 1,
    choices: choices ?? {},
  });
  if ('blocked' in applied) return { checks: [block(applied.blocked)] };
  let finalBuild: CharacterBuild = applied.build;
  const summary = [...applied.summary];
  if (spells) {
    try {
      const sheet = computeSheet({ ...current, build: finalBuild }, ctx.registry);
      const picked = applyLevelSpells(
        {
          campaign: ctx.campaign,
          build: finalBuild,
          live: ctx.live,
          sheet,
          registry: ctx.registry,
        },
        classId,
        entries.length === 0,
        spells,
      );
      if ('blocked' in picked) return { checks: [block(picked.blocked)] };
      finalBuild = picked.build;
      summary.push(...picked.summary);
    } catch {
      return { checks: [block('The spell picks could not be checked')] };
    }
  }
  if (!CharacterBuildSchema.safeParse(finalBuild).success)
    return { checks: [block('This level would leave invalid class or HP records')] };
  try {
    const nextSheet = computeSheet({ ...current, build: finalBuild }, ctx.registry);
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
      build: finalBuild,
      summary,
      live,
      name: def.name,
      classLevel: (entries[0]?.level ?? 0) + 1,
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
    draft.build.proficiencies = next.build.proficiencies;
    draft.build.abilityScores.bonuses = next.build.abilityScores.bonuses;
    draft.build.featureIds = next.build.featureIds;
    draft.build.spells = next.build.spells;
    draft.live.hp = next.live.hp;
    return withNotes(
      `Level up: ${next.name} ${next.classLevel} (max HP ${next.before} → ${next.after})`,
      [
        ...next.summary,
        ...(next.live.hp !== ctx.live.hp ? [`HP ${ctx.live.hp} → ${next.live.hp}`] : []),
      ],
    );
  },
};
