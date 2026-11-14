import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import { asiLevels } from '../../engine/calc/level-choices';
import { STANDARD_ARRAY } from '../../engine/creation';
import type { Registry } from '../../engine/registry';
import type { Campaign } from '../../engine/schema';

/** Order the step-by-step builder asks for things. */
export const STEPS = [
  { id: 'name', label: 'Name' },
  { id: 'race', label: 'Race' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'level', label: 'Level' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'choices', label: 'Choices' },
  { id: 'levels', label: 'Levels' },
  { id: 'review', label: 'Review' },
] as const;

export type StepId = (typeof STEPS)[number]['id'];

export interface StepInput {
  name: string;
  raceId: string;
  classId: string;
  backgroundId: string;
  level: number;
  bases: Record<Ability, string>;
  racialChoices: Ability[];
  /** Set when Tasha custom origin is in use: whether every racial increase has its own ability. */
  originReady?: boolean;
  race: { abilityChoices?: { count: number } } | undefined;
  campaign: Pick<Campaign, 'abilityMethod'>;
  /** Scores and every needed HP roll are filled in. */
  complete: boolean;
  pointCost: number;
}

/** What still blocks the Next button on a step; empty means the step is done. */
export function stepProblems(step: StepId, input: StepInput): string[] {
  const problems: string[] = [];
  switch (step) {
    case 'name':
      if (input.name.trim() === '') problems.push('Enter a name.');
      break;
    case 'race':
      if (!input.raceId) problems.push('Choose a race.');
      break;
    case 'class':
      if (!input.classId) problems.push('Choose a class.');
      break;
    case 'background':
      if (!input.backgroundId) problems.push('Choose a background.');
      break;
    case 'abilities': {
      const values = ABILITIES.map((a) => input.bases[a]);
      if (values.some((v) => v === '' || !Number.isInteger(Number(v)))) {
        problems.push('Enter a base score for every ability.');
        break;
      }
      const numbers = values.map(Number);
      const count = input.race?.abilityChoices?.count ?? 0;
      if (input.originReady === false) {
        problems.push('Move each racial increase to a different ability.');
      } else if (input.originReady === undefined && input.racialChoices.length !== count) {
        problems.push(`Choose ${count} racial bonus abilities.`);
      }
      if (input.campaign.abilityMethod === 'standard-array') {
        const sorted = [...numbers].sort((x, y) => y - x).join();
        if (sorted !== [...STANDARD_ARRAY].sort((x, y) => y - x).join()) {
          problems.push(`Use ${STANDARD_ARRAY.join(', ')}, each once.`);
        }
      }
      if (input.campaign.abilityMethod === 'point-buy') {
        if (numbers.some((n) => n < 8 || n > 15)) problems.push('Base scores run from 8 to 15.');
        else if (input.pointCost > 27) problems.push('You spent more than 27 points.');
      }
      break;
    }
    case 'choices':
      if (!input.complete) problems.push('Fill in every HP roll.');
      break;
    default:
      break;
  }
  return problems;
}

/** Levels up to the starting level where the class asks for a subclass or an ability score improvement. */
export function levelPickRows(
  registry: Registry,
  classId: string,
  level: number,
): { level: number; subclass: boolean; asi: boolean }[] {
  const def = registry.entries.get(classId);
  if (def?.kind !== 'class') return [];
  const hasSubclasses = [...registry.entries.values()].some(
    (row) => row.kind === 'subclass' && row.classId === classId,
  );
  const subclassAt = Math.max(1, def.subclassLevel);
  const asi = asiLevels(classId);
  return Array.from({ length: level }, (_, index) => index + 1)
    .map((at) => ({
      level: at,
      subclass: hasSubclasses && at === subclassAt,
      asi: asi.includes(at),
    }))
    .filter((row) => row.subclass || row.asi);
}
