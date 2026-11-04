import type { Registry } from '../registry';
import type { CharacterBuild, Die, FeatureDef, Formula, Recharge } from '../schema';
import type { Ability } from './abilities';

/** A feature the character has, with its level-based values resolved. */
export interface CharacterFeature {
  def: FeatureDef;
  /** The level its tables read: class level for class and subclass features, character level otherwise. */
  level: number;
  uses?: { max: number; recharge: Recharge };
  die?: Die;
  dieOverride?: { path: string; note: string; calculated: Die; value: Die };
}

/** Value of a by-level table (`{ 1: 'd6', 5: 'd8' }`) at a level: the row with the highest key at or below it. */
export function byLevel<T>(table: Readonly<Record<string, T>>, level: number): T | undefined {
  let best: { level: number; value: T } | undefined;
  for (const [key, value] of Object.entries(table)) {
    const row = Number(key);
    if (row <= level && (!best || row > best.level)) best = { level: row, value };
  }
  return best?.value;
}

export interface FormulaContext {
  mods: Record<Ability, number>;
  proficiency: number;
}

export function resolveFormula(formula: Formula, { mods, proficiency }: FormulaContext): number {
  if (typeof formula === 'number') return formula;
  if ('abilityMod' in formula) return Math.max(formula.min ?? -Infinity, mods[formula.abilityMod]);
  if (formula.proficiency === 'half') return Math.floor(proficiency / 2);
  if (formula.proficiency === 'double') return proficiency * 2;
  return proficiency;
}

/**
 * Every feature the character has (D48): race (or subrace), background, class and subclass
 * features up to the class level, then the build's extra features. A feature listed at several
 * levels (Bardic Inspiration at 1, 5, 10, 15) appears once.
 */
export function characterFeatures(
  build: CharacterBuild,
  registry: Registry,
  ctx: FormulaContext,
  characterLevel?: number,
): CharacterFeature[] {
  const totalLevel = characterLevel ?? build.classes.reduce((sum, entry) => sum + entry.level, 0);
  const granted: { featureId: string; level: number }[] = [];
  const atCharacterLevel = (featureId: string) => granted.push({ featureId, level: totalLevel });

  registry.get('race', build.subraceId ?? build.raceId).featureIds.forEach(atCharacterLevel);
  registry.get('background', build.backgroundId).featureIds.forEach(atCharacterLevel);
  for (const { classId, subclassId, level } of build.classes) {
    const rows = [
      ...registry.get('class', classId).features,
      ...(subclassId ? registry.get('subclass', subclassId).features : []),
    ];
    for (const row of rows) {
      if (row.level <= level) granted.push({ featureId: row.featureId, level });
    }
  }
  build.featureIds.forEach(atCharacterLevel);

  const seen = new Set<string>();
  return granted.flatMap(({ featureId, level }) => {
    if (seen.has(featureId)) return [];
    seen.add(featureId);
    const def = registry.get('feature', featureId);
    const feature: CharacterFeature = { def, level };
    if (def.uses) {
      const { max, recharge } = def.uses;
      const atLevel = typeof recharge === 'string' ? recharge : byLevel(recharge, level);
      feature.uses = { max: resolveFormula(max, ctx), recharge: atLevel ?? 'none' };
    }
    const die = def.die && byLevel(def.die, level);
    if (die) feature.die = die;
    return [feature];
  });
}
