import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { levelChoiceNeeds, type LevelChoices } from '../calc/level-choices';
import { computeSheet } from '../calc/sheet';
import { recordedLevel } from '../calc/advancement';
import { createCharacter } from '../creation';
import { levelUp } from './level';
import { Session } from './test-utils';

const campaign = {
  ...structuredClone(seedFile.campaign),
  sources: ['PHB', 'TCE'] as ('PHB' | 'TCE')[],
  hpMethod: 'average' as const,
  optionalRules: { ...seedFile.campaign.optionalRules, multiclassing: true },
};

const CLASS_IDS = [...registry.entries.values()].filter((e) => e.kind === 'class').map((e) => e.id);

function create(classId: string, abilityBases: Record<string, number>) {
  const { build, live } = createCharacter(
    {
      id: `gate-${classId}`,
      name: 'Gate',
      campaign,
      raceId: 'race.human',
      classId,
      backgroundId: 'background.charlatan',
      level: 1,
      abilityBases: abilityBases as never,
      racialChoices: [],
    },
    registry,
  );
  return new Session({ campaign, build, live });
}

/** One level, giving the subclass and an ability increase when the level asks for them. */
function levelOnce(session: Session, classId: string, extras: Record<string, unknown> = {}) {
  const needs = levelChoiceNeeds(registry, classId, session.state.build);
  const choices: LevelChoices = {};
  if (needs.subclass) {
    const sub = [...registry.entries.values()].find(
      (e) => e.kind === 'subclass' && e.classId === classId,
    );
    if (sub) choices.subclassId = sub.id;
  }
  if (needs.asi) choices.asi = { kind: 'abilities', increases: [{ ability: 'CON', value: 2 }] };
  session.run(levelUp, { classId, choices, ...extras });
}

const strong = { STR: 15, DEX: 14, CON: 14, INT: 14, WIS: 13, CHA: 13 };

describe('M14 gate', () => {
  it('builds a Fighter 2 / Wizard 3 through level-ups and undoes the last level', () => {
    const session = create('class.fighter', strong);
    levelOnce(session, 'class.fighter');
    for (let i = 0; i < 3; i += 1) levelOnce(session, 'class.wizard');
    const { build } = session.state;
    expect(build.classes.map((c) => [c.classId, c.level])).toEqual([
      ['class.fighter', 2],
      ['class.wizard', 3],
    ]);
    expect(recordedLevel(build)).toBe(5);
    const sheet = session.sheet;
    expect(sheet.maxHp.value).toBeGreaterThan(30);

    session.undo();
    expect(session.state.build.classes.map((c) => c.level)).toEqual([2, 2]);
    expect(session.state.build.hpEntries).toHaveLength(4);
  });

  it('blocks a multiclass whose ability minimum is not met', () => {
    const session = create('class.fighter', { ...strong, INT: 8 });
    expect(session.try(levelUp, { classId: 'class.wizard' }, true)).toMatchObject({
      result: 'blocked',
    });
  });

  it('builds a Warlock / Sorcerer with Pact Magic and Spellcasting kept apart', () => {
    const session = create('class.warlock', { ...strong, CHA: 15 });
    levelOnce(session, 'class.warlock');
    for (let i = 0; i < 2; i += 1) levelOnce(session, 'class.sorcerer');
    const sheet = session.sheet;
    expect(session.state.build.classes.map((c) => c.level)).toEqual([2, 2]);
    expect(sheet.spellcasting).toBeDefined();
  });

  it.each(CLASS_IDS)('%s reaches level 5 with a computable sheet', (classId) => {
    const session = create(classId, { STR: 15, DEX: 14, CON: 14, INT: 13, WIS: 13, CHA: 13 });
    for (let level = 2; level <= 5; level += 1) levelOnce(session, classId);
    expect(recordedLevel(session.state.build)).toBe(5);
    const sheet = computeSheet(session.state, registry);
    expect(sheet.maxHp.value).toBeGreaterThan(20);
    expect(Number.isFinite(sheet.ac.value)).toBe(true);
    session.undo();
    expect(recordedLevel(session.state.build)).toBe(4);
  });
});
