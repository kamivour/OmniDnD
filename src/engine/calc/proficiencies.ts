import type { CharacterBuild, FeatureDef, ItemDef, ProficiencyChoice } from '../schema';
import type { Registry } from '../registry';
import { SKILLS, type Skill } from '../rules2014';
import { LANGUAGES, toolGroupOptions } from './background-choices';

export type Proficiencies = CharacterBuild['proficiencies'];
export type ProficiencyPicks = NonNullable<CharacterBuild['proficiencyPicks']>[string];
type Kind = keyof Proficiencies;

/** One proficiency a race trait or class feature gives, shown as locked in editors. */
export interface GrantedProficiency {
  kind: Kind;
  value: string;
  source: string;
}

export interface FeatureProficiencyResult {
  /** The build's own proficiencies plus every feature grant and pick. */
  proficiencies: Proficiencies;
  granted: GrantedProficiency[];
  /** Darkvision picked for a feature (Custom Lineage), in feet. */
  darkvision: number;
}

/** Darkvision range a Custom Lineage pick gives. */
export const PICKED_DARKVISION_FEET = 60;

/**
 * Merges the build's proficiencies with what the character's features give: fixed grants
 * (Keen Senses, War Domain armor) and the picks stored for each feature (Skill Versatility).
 */
export function featureProficiencies(
  build: Pick<CharacterBuild, 'proficiencies' | 'proficiencyPicks'>,
  features: readonly { def: FeatureDef }[],
): FeatureProficiencyResult {
  const granted: GrantedProficiency[] = [];
  let darkvision = 0;
  const add = (kind: Kind, values: readonly string[] | undefined, source: string) => {
    for (const value of values ?? []) granted.push({ kind, value, source });
  };
  for (const { def } of features) {
    const grant = def.proficiencies;
    if (!grant) continue;
    add('saves', grant.saves, def.name);
    add('skills', grant.skills, def.name);
    add('expertise', grant.expertise, def.name);
    add('armor', grant.armor, def.name);
    add('weapons', grant.weapons, def.name);
    add('tools', grant.tools, def.name);
    add('languages', grant.languages, def.name);
    const picks = build.proficiencyPicks?.[def.id];
    if (!picks || !grant.choose) continue;
    add('skills', picks.skills, def.name);
    add('tools', picks.tools, def.name);
    add('weapons', picks.weapons, def.name);
    add('languages', picks.languages, def.name);
    add('expertise', picks.expertise, def.name);
    // Skills picked for an expertise row (Blessings of Knowledge) are doubled too.
    const doubled = grant.choose.some((row) => row.expertise);
    if (doubled)
      add(
        'expertise',
        (picks.skills ?? []).filter((skill) =>
          grant.choose?.some((row) => row.expertise && (row.skills ?? SKILLS).includes(skill)),
        ),
        def.name,
      );
    if (picks.darkvision) darkvision = PICKED_DARKVISION_FEET;
  }
  const merged = structuredClone(build.proficiencies) as Proficiencies;
  for (const { kind, value } of granted) {
    const list = merged[kind] as string[];
    if (!list.includes(value)) list.push(value);
  }
  const toolExpertise = features.find(({ def }) => def.id === 'feature.artificer.tool-expertise');
  if (toolExpertise) {
    for (const tool of merged.tools) {
      if (!merged.expertise.includes(tool)) merged.expertise.push(tool);
      granted.push({ kind: 'expertise', value: tool, source: toolExpertise.def.name });
    }
  }
  return { proficiencies: merged, granted, darkvision };
}

/** Total picks a feature asks for. */
export const pickCount = (choose: readonly ProficiencyChoice[]) =>
  choose.reduce((sum, row) => sum + row.count, 0);

/** Number of picks stored for a feature. */
export const pickedCount = (picks: ProficiencyPicks | undefined) =>
  (picks?.skills?.length ?? 0) +
  (picks?.tools?.length ?? 0) +
  (picks?.weapons?.length ?? 0) +
  (picks?.languages?.length ?? 0) +
  (picks?.expertise?.length ?? 0) +
  (picks?.darkvision ? 1 : 0);

/** The skills a skill or expertise pick may take. */
export const choiceSkills = (row: ProficiencyChoice): readonly Skill[] => row.skills ?? SKILLS;

/** The tools a tool pick may take. */
export function choiceTools(row: ProficiencyChoice, registry: Registry): string[] {
  if (Array.isArray(row.tools)) return row.tools;
  const items = [...registry.entries.values()].filter(
    (entry): entry is ItemDef => entry.kind === 'item',
  );
  return toolGroupOptions(row.tools ?? 'any', items);
}

export const choiceLanguages: readonly string[] = LANGUAGES;

type Token =
  | { kind: 'skill' | 'expertise'; value: Skill }
  | { kind: 'tool' | 'language' | 'weapon'; value: string }
  | { kind: 'darkvision' };

/**
 * Why these picks do not fit the feature, or undefined when they do. `proficient` holds the
 * skills the character has from other sources, which expertise picks need.
 */
export function proficiencyPickProblem(
  def: FeatureDef,
  picks: ProficiencyPicks,
  registry: Registry,
  proficient: ReadonlySet<string>,
): string | undefined {
  const choose = def.proficiencies?.choose;
  if (!choose) return `${def.name} has nothing to pick`;
  const lists = [picks.skills, picks.tools, picks.weapons, picks.languages, picks.expertise];
  if (lists.some((list) => list && new Set(list).size !== list.length))
    return 'Pick each option once';
  const tokens: Token[] = [
    ...(picks.skills ?? []).map((value) => ({ kind: 'skill' as const, value })),
    ...(picks.expertise ?? []).map((value) => ({ kind: 'expertise' as const, value })),
    ...(picks.tools ?? []).map((value) => ({ kind: 'tool' as const, value })),
    ...(picks.weapons ?? []).map((value) => ({ kind: 'weapon' as const, value })),
    ...(picks.languages ?? []).map((value) => ({ kind: 'language' as const, value })),
    ...(picks.darkvision ? [{ kind: 'darkvision' as const }] : []),
  ];
  const fits = (row: ProficiencyChoice, token: Token) => {
    if (!row.kinds.includes(token.kind)) return false;
    if (token.kind === 'skill' || token.kind === 'expertise')
      return choiceSkills(row).includes(token.value);
    if (token.kind === 'tool') return choiceTools(row, registry).includes(token.value);
    if (token.kind === 'weapon') return row.weapons?.includes(token.value) ?? false;
    if (token.kind === 'language') return token.value.trim().length > 0;
    return true;
  };
  // Fill each row in order; any pick left over fits nowhere.
  const left = [...tokens];
  for (const row of choose) {
    for (let taken = 0; taken < row.count; taken++) {
      const at = left.findIndex((token) => fits(row, token));
      if (at === -1) return `${def.name}: ${pickCount(choose)} picks needed`;
      left.splice(at, 1);
    }
  }
  if (left.length > 0) return `${def.name}: ${pickCount(choose)} picks needed`;
  // A skill picked by the same feature counts (Prodigy: a new skill, then expertise in it).
  const unproficient = (picks.expertise ?? []).find(
    (skill) => !proficient.has(skill) && !(picks.skills ?? []).includes(skill),
  );
  if (unproficient)
    return `Expertise needs proficiency first: ${unproficient.replaceAll('-', ' ')}`;
  return undefined;
}

/** Features on the character whose proficiency picks are still open. */
export function openProficiencyPicks(
  build: Pick<CharacterBuild, 'proficiencyPicks'>,
  features: readonly { def: FeatureDef }[],
): { def: FeatureDef; open: number }[] {
  return features.flatMap(({ def }) => {
    const choose = def.proficiencies?.choose;
    if (!choose) return [];
    const open = pickCount(choose) - pickedCount(build.proficiencyPicks?.[def.id]);
    return open > 0 ? [{ def, open }] : [];
  });
}
