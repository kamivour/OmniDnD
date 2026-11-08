import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { createCharacter, type CreateCharacterInput } from '../creation';
import { pendingChoices } from './pending-choices';

const ABILITIES = { STR: 15, DEX: 13, CON: 14, INT: 12, WIS: 10, CHA: 8 };

function make(classId: string, level: number, patch: Partial<CreateCharacterInput> = {}) {
  const campaign = structuredClone(seedFile.campaign);
  const input: CreateCharacterInput = {
    id: 'pending-test',
    name: 'Tester',
    campaign,
    raceId: 'race.human',
    classId,
    backgroundId: 'background.acolyte',
    level,
    abilityBases: ABILITIES,
    racialChoices: [],
    hpRolls: Array.from({ length: level - 1 }, () => 4),
    ...patch,
  };
  return { campaign, ...createCharacter(input, registry) };
}

const kinds = (classId: string, level: number, patch?: Partial<CreateCharacterInput>) =>
  pendingChoices(make(classId, level, patch), registry).map((item) => item.kind);

describe('pendingChoices', () => {
  it('asks a level 3 Fighter for a subclass and a Fighting Style', () => {
    expect(kinds('class.fighter', 3)).toEqual(expect.arrayContaining(['subclass', 'option']));
    expect(kinds('class.fighter', 3)).not.toContain('asi');
  });

  it('does not ask for a subclass before the class gets one', () => {
    expect(kinds('class.fighter', 2)).not.toContain('subclass');
  });

  it('opens an ability score improvement at level 4', () => {
    expect(kinds('class.fighter', 4)).toContain('asi');
    expect(kinds('class.fighter', 3)).not.toContain('asi');
  });

  it('asks a level 1 Rogue for two expertise picks', () => {
    const expertise = pendingChoices(make('class.rogue', 1), registry).find(
      (item) => item.kind === 'expertise',
    );
    expect(expertise?.count).toBe(2);
  });

  it('lists a new Wizard cantrips, spellbook spells and optional prepared spells', () => {
    const items = pendingChoices(make('class.wizard', 1), registry);
    expect(items.find((item) => item.kind === 'cantrips')?.count).toBe(3);
    expect(items.find((item) => item.kind === 'spellbook')?.count).toBe(6);
    const prepared = items.find((item) => item.kind === 'prepared');
    expect(prepared?.optional).toBe(true);
    expect(items.filter((item) => item.optional)).toEqual([prepared]);
  });

  it('gives every item a stable unique id and an area', () => {
    const items = pendingChoices(make('class.wizard', 5), registry);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    for (const item of items) expect(['choices', 'spells']).toContain(item.area);
  });
});
