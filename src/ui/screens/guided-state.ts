import { CLASS_START } from '../../engine/calc/class-start';
import type { GuidedChoices } from '../../engine/creation';
import type { Skill } from '../../engine/rules2014';

export interface GuidedState {
  skills: Skill[];
  instruments: string[];
  equipment: { option: number; slots: string[] }[];
  spells: string[];
}

export const emptyGuided = (classId: string): GuidedState => ({
  skills: [],
  instruments: [],
  equipment: (CLASS_START[classId]?.equipment ?? []).map(() => ({ option: 0, slots: [] })),
  spells: [],
});

/** The engine input for a guided build, with unfilled slots left out so the engine can say what is missing. */
export function toGuidedChoices(state: GuidedState): GuidedChoices {
  return {
    skills: state.skills,
    instruments: state.instruments,
    equipment: state.equipment.map(({ option, slots }) => ({ option, slots })),
    ...(state.spells.length > 0 ? { spells: { add: state.spells } } : {}),
  };
}
