import { z } from 'zod';
import type { Registry } from '../registry';
import { SkillSchema, refId, type Campaign, type CharacterBuild } from '../schema';
import { ABILITIES, type Ability } from './abilities';
import { optionalRules } from './campaign-rules';

/** PHB 2014: every class improves ability scores at 4, 8, 12, 16 and 19; Fighter also at 6 and 14, Rogue also at 10. */
export function asiLevels(classId: string): number[] {
  const extra = classId === 'class.fighter' ? [6, 14] : classId === 'class.rogue' ? [10] : [];
  return [4, 8, 12, 16, 19, ...extra].sort((a, b) => a - b);
}

export const MAX_ABILITY_SCORE = 20;

/** The choices a level can carry. All are optional; the check says what the level still lacks. */
export const LevelChoicesSchema = z.strictObject({
  subclassId: refId('subclass').optional(),
  asi: z
    .union([
      z.strictObject({
        kind: z.literal('abilities'),
        increases: z
          .array(
            z.strictObject({
              ability: z.enum(ABILITIES),
              value: z.union([z.literal(1), z.literal(2)]),
            }),
          )
          .min(1)
          .max(2),
      }),
      z.strictObject({
        kind: z.literal('feat'),
        featId: refId('feature'),
        /** The ability a feat raises by 1, when it offers a choice. */
        ability: z.enum(ABILITIES).optional(),
        /** Skills a feat lets you pick (Skilled). */
        skills: z.array(SkillSchema).optional(),
      }),
    ])
    .optional(),
  /** Skills, or tools by item id, that gain expertise at this level. */
  expertise: z.array(z.union([SkillSchema, refId('item')])).optional(),
  /** Option features picked at this level (a Fighting Style, Metamagic, an Invocation). */
  features: z.array(refId('feature')).optional(),
});

export type LevelChoices = z.infer<typeof LevelChoicesSchema>;

interface Input {
  campaign: Pick<Campaign, 'optionalRules'>;
  build: CharacterBuild;
  registry: Registry;
  /** Final ability scores before this level. */
  score: (ability: Ability) => number;
  classId: string;
  newLevel: number;
  choices: LevelChoices;
}

export type ChoiceResult = { blocked: string } | { build: CharacterBuild; summary: string[] };

/** Applies subclass, ability score improvement or feat, expertise and picked features to a build; blocks anything illegal. */
export function applyLevelChoices(input: Input): ChoiceResult {
  const { registry, classId, newLevel, choices } = input;
  const classDef = registry.entries.get(classId);
  if (classDef?.kind !== 'class') return { blocked: 'The selected class reference is unavailable' };
  const build = structuredClone(input.build);
  const summary: string[] = [];
  const entry = build.classes.find((row) => row.classId === classId);
  if (!entry) return { blocked: 'The class is not on this character' };

  // Subclass
  if (choices.subclassId !== undefined) {
    const subclass = registry.entries.get(choices.subclassId);
    if (subclass?.kind !== 'subclass' || subclass.classId !== classId)
      return { blocked: 'The selected subclass does not belong to this class' };
    if (entry.subclassId !== undefined)
      return { blocked: `${classDef.name} already has a subclass` };
    if (newLevel < classDef.subclassLevel)
      return { blocked: `${classDef.name} chooses a subclass at level ${classDef.subclassLevel}` };
    entry.subclassId = choices.subclassId;
    summary.push(`Subclass: ${subclass.name}`);
  }

  // Ability score improvement or feat
  const isAsiLevel = asiLevels(classId).includes(newLevel);
  if (choices.asi !== undefined && !isAsiLevel)
    return { blocked: `${classDef.name} ${newLevel} has no ability score improvement` };
  if (choices.asi?.kind === 'abilities') {
    const { increases } = choices.asi;
    const total = increases.reduce((sum, row) => sum + row.value, 0);
    const distinct = new Set(increases.map((row) => row.ability)).size === increases.length;
    if (total !== 2 || !distinct)
      return { blocked: 'Raise one ability by 2, or two different abilities by 1 each' };
    for (const { ability, value } of increases) {
      if (input.score(ability) + value > MAX_ABILITY_SCORE)
        return { blocked: `${ability} cannot go above ${MAX_ABILITY_SCORE}` };
      build.abilityScores.bonuses.push({
        source: `ASI: ${classDef.name} ${newLevel}`,
        ability,
        value,
      });
      summary.push(`${ability} +${value}`);
    }
  }
  if (choices.asi?.kind === 'feat') {
    if (!optionalRules(input.campaign).feats) return { blocked: 'Feats are off in this campaign' };
    const feat = registry.entries.get(choices.asi.featId);
    if (feat?.kind !== 'feature' || feat.origin !== 'feat')
      return { blocked: 'The selected feat is unavailable' };
    if (build.featureIds.includes(feat.id)) return { blocked: `You already have ${feat.name}` };
    const grants = feat.grants ?? {};
    const options = grants.ability ?? [];
    const ability = choices.asi.ability ?? (options.length === 1 ? options[0] : undefined);
    if (options.length > 0) {
      if (!ability || !options.includes(ability))
        return { blocked: `Choose which ability ${feat.name} raises: ${options.join(', ')}` };
      if (input.score(ability) + 1 > MAX_ABILITY_SCORE)
        return { blocked: `${ability} cannot go above ${MAX_ABILITY_SCORE}` };
      build.abilityScores.bonuses.push({ source: `Feat: ${feat.name}`, ability, value: 1 });
      if (grants.saveFromAbility && !build.proficiencies.saves.includes(ability))
        build.proficiencies.saves.push(ability);
    } else if (choices.asi.ability) {
      return { blocked: `${feat.name} does not raise an ability` };
    }
    const skills = choices.asi.skills ?? [];
    if (skills.length > (grants.skills ?? 0) || new Set(skills).size !== skills.length)
      return { blocked: `${feat.name} gives ${grants.skills ?? 0} skills` };
    for (const skill of skills) {
      if (build.proficiencies.skills.includes(skill))
        return { blocked: `Already proficient in ${skill}` };
      build.proficiencies.skills.push(skill);
    }
    for (const armor of grants.armor ?? [])
      if (!build.proficiencies.armor.includes(armor)) build.proficiencies.armor.push(armor);
    build.featureIds.push(feat.id);
    summary.push(`Feat: ${feat.name}`);
  }

  // Expertise
  for (const id of choices.expertise ?? []) {
    const isSkill = SkillSchema.safeParse(id).success;
    const proficient = isSkill
      ? build.proficiencies.skills.includes(id as never)
      : build.proficiencies.tools.includes(id);
    if (!proficient) return { blocked: `Expertise needs a proficiency first: ${id}` };
    if (build.proficiencies.expertise.includes(id as never))
      return { blocked: `Already has expertise: ${id}` };
    build.proficiencies.expertise.push(id as never);
    summary.push(`Expertise: ${registry.entries.get(id)?.name ?? id}`);
  }

  // Picked option features
  for (const id of choices.features ?? []) {
    const feature = registry.entries.get(id);
    if (feature?.kind !== 'feature') return { blocked: `Unknown feature ${id}` };
    if (build.featureIds.includes(id)) return { blocked: `You already have ${feature.name}` };
    if (
      feature.id.startsWith('feature.tce.') &&
      !optionalRules(input.campaign).optionalClassFeatures
    )
      return { blocked: `${feature.name} needs Tasha's optional class features` };
    build.featureIds.push(id);
    summary.push(feature.name);
  }

  return { build, summary };
}

/** What a new class level still asks the player to decide; the wizard shows these and the engine accepts them as choices. */
export function levelChoiceNeeds(
  registry: Registry,
  classId: string,
  build: Pick<CharacterBuild, 'classes'>,
): { subclass: boolean; asi: boolean } {
  const classDef = registry.entries.get(classId);
  if (classDef?.kind !== 'class') return { subclass: false, asi: false };
  const entry = build.classes.find((row) => row.classId === classId);
  const newLevel = (entry?.level ?? 0) + 1;
  const hasSubclasses = [...registry.entries.values()].some(
    (row) => row.kind === 'subclass' && row.classId === classId,
  );
  return {
    subclass:
      hasSubclasses && entry?.subclassId === undefined && newLevel >= classDef.subclassLevel,
    asi: asiLevels(classId).includes(newLevel),
  };
}
