import { describe, expect, it } from 'vitest';
import { computeSheet } from '../engine/calc/sheet';
import { createCharacter, type CreateCharacterInput } from '../engine/creation';
import { companionLink } from '../ui/companions/companion-links';
import { registry } from './registry';
import { seedFile } from './seed';

function make(patch: Partial<CreateCharacterInput>) {
  return createCharacter(
    {
      id: 'c',
      name: 'Test',
      campaign: structuredClone(seedFile.campaign),
      raceId: 'race.wood-elf',
      classId: 'class.ranger',
      backgroundId: 'background.outlander',
      level: 3,
      abilityBases: { STR: 10, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 10 },
      hpRolls: [5, 5],
      ...patch,
    },
    registry,
  );
}

describe('M27 PHB races', () => {
  it.each([
    ['race.wood-elf', 'race.elf'],
    ['race.drow', 'race.elf'],
    ['race.mountain-dwarf', 'race.dwarf'],
    ['race.stout-halfling', 'race.halfling'],
    ['race.forest-gnome', 'race.gnome'],
    ['race.variant-human', 'race.human'],
  ])('%s is a subrace of %s', (id, parent) => {
    const race = registry.get('race', id);
    expect(race.subraceOf).toBe(parent);
    race.featureIds.forEach((featureId) => registry.get('feature', featureId));
  });

  it('gives a Wood Elf 35 ft speed and darkvision', () => {
    const created = make({});
    const sheet = computeSheet({ campaign: seedFile.campaign, ...created }, registry);
    expect(sheet.speed.value).toBe(35);
  });

  it('lets a Variant Human pick two +1 scores', () => {
    const { build } = make({ raceId: 'race.variant-human', racialChoices: ['DEX', 'WIS'] });
    const bonuses = build.abilityScores.bonuses.filter((b) => b.source === 'race.variant-human');
    expect(bonuses.map((b) => [b.ability, b.value])).toEqual([
      ['DEX', 1],
      ['WIS', 1],
    ]);
  });

  it('gives a Drow 120 ft darkvision', () => {
    expect(registry.get('race', 'race.drow').darkvision).toBe(120);
  });
});

describe('M27 Beast Master', () => {
  it('is a Ranger subclass with four features from level 3', () => {
    const sub = registry.get('subclass', 'subclass.ranger.beast-master');
    expect(sub.classId).toBe('class.ranger');
    expect(sub.features.map((f) => f.level)).toEqual([3, 7, 11, 15]);
  });

  it("links the Ranger's Companion feature to Companions", () => {
    const link = companionLink('feature.ranger.beast-master-rangers-companion');
    expect(link?.limitKey).toBe('ranger-companion');
  });
});
