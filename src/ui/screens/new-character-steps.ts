import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import { STANDARD_ARRAY } from '../../engine/creation';
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
      if (input.racialChoices.length !== count) {
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
