import type { Registry } from '../registry';
import type {
  Campaign,
  CharacterBuild,
  FeatureDef,
  FeatureSpells,
  FreeCast,
  SpellDef,
} from '../schema';
import type { Ability } from './abilities';
import { sourceAllows } from './campaign-rules';
import type { Sheet } from './sheet';

type SpellPick = NonNullable<FeatureSpells['picks']>[number];

export interface FeatSpell {
  spellId: string;
  /** Casting without a slot: per long rest, per short rest, or at will. */
  free?: FreeCast;
  /** Spell level of the free casting, when it is above the spell's own level. */
  castLevel?: number;
}

/** A feat or racial trait that teaches spells, with its derived casting numbers. */
export interface FeatSpellSource {
  featureId: string;
  name: string;
  grant: FeatureSpells;
  classId?: string;
  /** Undefined until the player has said what the build cannot show (class or ability). */
  ability?: Ability;
  dc?: number;
  attack?: number;
  spells: FeatSpell[];
  /** Spells still to pick. */
  open: number;
  /** The player still has to pick a class or an ability for this source. */
  needs: ('class' | 'ability')[];
}

export interface FeatSpellContext {
  registry: Registry;
  build: CharacterBuild;
  sheet: Pick<Sheet, 'features' | 'abilities' | 'proficiency' | 'level'>;
}

/** Key for a free casting in `live.featSpellsUsed`. */
export const freeUseKey = (featureId: string, spellId: string) => `${featureId}|${spellId}`;

function abilityFor(ctx: FeatSpellContext, def: FeatureDef, grant: FeatureSpells) {
  const stored = ctx.build.featSpells?.[def.id];
  if (grant.ability === 'class') {
    const entry = stored?.classId ? ctx.registry.entries.get(stored.classId) : undefined;
    return entry?.kind === 'class' ? entry.spellcasting?.ability : undefined;
  }
  if (grant.ability !== 'raised') return grant.ability;
  return (
    stored?.ability ??
    ctx.build.abilityScores.bonuses.find((bonus) => bonus.source === `Feat: ${def.name}`)?.ability
  );
}

/** Every feat and racial trait on the character that teaches spells. */
export function featSpellSources(ctx: FeatSpellContext): FeatSpellSource[] {
  return ctx.sheet.features.flatMap(({ def }) => {
    const grant = def.spells;
    if (!grant) return [];
    const stored = ctx.build.featSpells?.[def.id];
    const ability = abilityFor(ctx, def, grant);
    const fixed = (grant.fixed ?? [])
      .filter((row) => (row.minLevel ?? 1) <= ctx.sheet.level)
      .map(({ spellId, free, castLevel }) => ({
        spellId,
        ...(free ? { free } : {}),
        ...(castLevel ? { castLevel } : {}),
      }));
    const picked = (stored?.spellIds ?? []).flatMap((spellId): FeatSpell[] => {
      const spell = ctx.registry.entries.get(spellId);
      if (spell?.kind !== 'spell') return [];
      const free = grant.picks?.find((row) => row.level === spell.level)?.free;
      return [{ spellId, ...(free ? { free } : {}) }];
    });
    const wanted = (grant.picks ?? []).reduce((sum, row) => sum + row.count, 0);
    const needs: FeatSpellSource['needs'] = [];
    if (grant.classOptions && !stored?.classId) needs.push('class');
    if (grant.ability === 'raised' && !ability) needs.push('ability');
    const mod = ability ? ctx.sheet.abilities[ability].mod : undefined;
    return [
      {
        featureId: def.id,
        name: def.name,
        grant,
        ...(stored?.classId ? { classId: stored.classId } : {}),
        ...(ability ? { ability } : {}),
        ...(mod === undefined
          ? {}
          : { dc: 8 + ctx.sheet.proficiency + mod, attack: ctx.sheet.proficiency + mod }),
        spells: [...fixed, ...picked],
        open: Math.max(0, wanted - picked.length),
        needs,
      },
    ];
  });
}

/** The spells one pick can come from in this campaign. */
export function featSpellCandidates(
  registry: Registry,
  campaign: Pick<Campaign, 'ruleset'> & Parameters<typeof sourceAllows>[0],
  pick: SpellPick,
  classId: string | undefined,
): SpellDef[] {
  return [...registry.entries.values()]
    .filter(
      (entry): entry is SpellDef =>
        entry.kind === 'spell' &&
        entry.ruleset === campaign.ruleset &&
        sourceAllows(campaign, entry) &&
        entry.level === pick.level &&
        (!pick.schools || pick.schools.includes(entry.school)) &&
        (!pick.fromClass || (classId !== undefined && entry.classes.includes(classId))) &&
        (!pick.classes || pick.classes.some((id) => entry.classes.includes(id))) &&
        (!pick.attack || entry.attack !== undefined),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Why these picks do not fit the feature, or undefined when they do. */
export function featSpellPickProblem(
  registry: Registry,
  campaign: Parameters<typeof featSpellCandidates>[1],
  def: FeatureDef,
  choice: { classId?: string; ability?: Ability; spellIds: string[] },
): string | undefined {
  const grant = def.spells;
  if (!grant) return `${def.name} teaches no spells to pick`;
  if (grant.classOptions) {
    if (!choice.classId || !grant.classOptions.includes(choice.classId))
      return `Choose a class for ${def.name}`;
  } else if (choice.classId) return `${def.name} has no class to choose`;
  if (choice.ability !== undefined) {
    const options = def.grants?.ability ?? [];
    if (grant.ability !== 'raised' || !options.includes(choice.ability))
      return `${def.name} does not use ${choice.ability} for its spells`;
  }
  if (new Set(choice.spellIds).size !== choice.spellIds.length)
    return 'Each spell can be picked once';
  for (const pick of grant.picks ?? []) {
    const allowed = new Set(
      featSpellCandidates(registry, campaign, pick, choice.classId).map((spell) => spell.id),
    );
    const level = choice.spellIds.filter(
      (id) =>
        registry.entries.get(id)?.kind === 'spell' &&
        registry.get('spell', id).level === pick.level,
    );
    if (level.length !== pick.count)
      return `${def.name}: pick ${pick.count} ${pick.level === 0 ? 'cantrip' : `level ${pick.level} spell`}${pick.count > 1 ? 's' : ''}`;
    const wrong = level.find((id) => !allowed.has(id));
    if (wrong) return `${registry.get('spell', wrong).name} is not an option for ${def.name}`;
  }
  const levels = new Set((grant.picks ?? []).map((pick) => pick.level));
  const extra = choice.spellIds.find(
    (id) =>
      registry.entries.get(id)?.kind !== 'spell' || !levels.has(registry.get('spell', id).level),
  );
  if (extra)
    return `${registry.entries.get(extra)?.name ?? extra} is not an option for ${def.name}`;
  return undefined;
}
