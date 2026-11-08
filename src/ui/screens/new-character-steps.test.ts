import { describe, expect, it } from 'vitest';
import { stepProblems, type StepInput } from './new-character-steps';

const blank = { STR: '', DEX: '', CON: '', INT: '', WIS: '', CHA: '' };
const input = (patch: Partial<StepInput> = {}): StepInput => ({
  name: 'Ana',
  raceId: 'race.human',
  classId: 'class.fighter',
  backgroundId: 'background.acolyte',
  level: 1,
  bases: { STR: '15', DEX: '14', CON: '13', INT: '12', WIS: '10', CHA: '8' },
  racialChoices: [],
  race: undefined,
  campaign: { abilityMethod: 'standard-array' },
  complete: true,
  pointCost: 27,
  ...patch,
});

describe('stepProblems', () => {
  it('asks for the one thing each early step needs', () => {
    expect(stepProblems('name', input({ name: '  ' }))).toEqual(['Enter a name.']);
    expect(stepProblems('race', input({ raceId: '' }))).toEqual(['Choose a race.']);
    expect(stepProblems('class', input({ classId: '' }))).toEqual(['Choose a class.']);
    expect(stepProblems('background', input({ backgroundId: '' }))).toEqual([
      'Choose a background.',
    ]);
    expect(stepProblems('level', input())).toEqual([]);
  });

  it('checks ability entry by method', () => {
    expect(stepProblems('abilities', input())).toEqual([]);
    expect(stepProblems('abilities', input({ bases: blank }))).toEqual([
      'Enter a base score for every ability.',
    ]);
    expect(stepProblems('abilities', input({ bases: { ...input().bases, CHA: '15' } }))).toEqual([
      'Use 15, 14, 13, 12, 10, 8, each once.',
    ]);
    expect(
      stepProblems(
        'abilities',
        input({
          campaign: { abilityMethod: 'point-buy' },
          bases: { STR: '15', DEX: '15', CON: '15', INT: '8', WIS: '8', CHA: '8' },
          pointCost: 36,
        }),
      ),
    ).toEqual(['You spent more than 27 points.']);
    expect(stepProblems('abilities', input({ race: { abilityChoices: { count: 2 } } }))).toEqual([
      'Choose 2 racial bonus abilities.',
    ]);
  });

  it('needs every HP roll before the choices step is done', () => {
    expect(stepProblems('choices', input({ complete: false }))).toEqual(['Fill in every HP roll.']);
    expect(stepProblems('review', input({ complete: false }))).toEqual([]);
  });
});
