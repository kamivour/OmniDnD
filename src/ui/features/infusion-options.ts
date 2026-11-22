import { isReplicateInfusion } from '../../engine/calc/infusions';

interface InfusionOption {
  id: string;
  name: string;
}

export function groupInfusionOptions(options: InfusionOption[]) {
  const standard: InfusionOption[] = [];
  const recipes: InfusionOption[] = [];
  for (const option of options) {
    if (isReplicateInfusion(option.id)) {
      recipes.push({ ...option, name: option.name.replace(/^Replicate Magic Item: /, '') });
    } else {
      standard.push(option);
    }
  }
  return [
    { label: 'Standard infusions', options: standard },
    { label: 'Replicate Magic Item', options: recipes },
  ].filter((group) => group.options.length > 0);
}
