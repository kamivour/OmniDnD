import { describe, expect, it } from 'vitest';
import { computeSheet } from '../engine/calc/sheet';
import { pendingChoices } from '../engine/calc/pending-choices';
import { spellSelectionDetails } from '../engine/calc/spell-selections';
import { createCharacter } from '../engine/creation';
import { registry } from './registry';
import { seedFile } from './seed';

function make(classId: string, subclassId: string | undefined, level: number) {
  const created = createCharacter(
    {
      id: 'c',
      name: 'Test',
      campaign: structuredClone(seedFile.campaign),
      raceId: 'race.human',
      classId,
      backgroundId: 'background.outlander',
      level,
      abilityBases: { STR: 14, DEX: 14, CON: 13, INT: 15, WIS: 10, CHA: 10 },
      hpRolls: Array<number>(Math.max(0, level - 1)).fill(5),
    },
    registry,
  );
  if (subclassId) created.build.classes[0]!.subclassId = subclassId;
  const state = { campaign: seedFile.campaign, ...created };
  return { state, sheet: computeSheet(state, registry) };
}

describe('M28 martial subclasses', () => {
  it('Eldritch Knight casts as a one-third caster from the wizard list', () => {
    const { state, sheet } = make('class.fighter', 'subclass.fighter.eldritch-knight', 7);
    expect(sheet.spellcasting).toHaveLength(1);
    expect(sheet.spellcasting[0]!.ability).toBe('INT');
    expect(sheet.spellcasting[0]!.spellsKnown).toBe(5);
    expect(sheet.slots.max.slice(1, 3)).toEqual([4, 2]);
    const details = spellSelectionDetails({ ...state, sheet, registry }, 'class.fighter');
    expect(details.mode).toBe('known');
    expect(details.candidates.known).toContain('spell.shield');
  });

  it('Eldritch Knight has no casting before level 3 or without the subclass', () => {
    expect(make('class.fighter', 'subclass.fighter.eldritch-knight', 2).sheet.spellcasting).toEqual(
      [],
    );
    expect(make('class.fighter', undefined, 5).sheet.spellcasting).toEqual([]);
  });

  it('Arcane Trickster gets 3 cantrips at level 3', () => {
    const { sheet } = make('class.rogue', 'subclass.rogue.arcane-trickster', 3);
    expect(sheet.spellcasting[0]!.cantripsKnown).toBe(3);
    expect(sheet.slots.max[1]).toBe(2);
  });

  it('Battle Master asks for three maneuvers at level 3', () => {
    const { state } = make('class.fighter', 'subclass.fighter.battle-master', 3);
    const pick = pendingChoices(state, registry).find(
      (row) => row.kind === 'option' && row.prefix === 'feature.fighter.maneuver-',
    );
    expect(pick?.count).toBe(3);
  });

  it('other fighters never see maneuver picks', () => {
    const { state } = make('class.fighter', 'subclass.fighter.champion', 3);
    expect(
      pendingChoices(state, registry).some((row) => row.prefix === 'feature.fighter.maneuver-'),
    ).toBe(false);
  });

  it('Totem Warrior picks a totem spirit at level 3', () => {
    const { state } = make('class.barbarian', 'subclass.barbarian.totem-warrior', 3);
    expect(
      pendingChoices(state, registry).some(
        (row) => row.prefix === 'feature.barbarian.totem-spirit-',
      ),
    ).toBe(true);
  });

  it('Combat Superiority has four d8 dice at level 3', () => {
    const feature = registry.get('feature', 'feature.fighter.battle-master-combat-superiority');
    expect(feature.uses?.max).toEqual({ byLevel: { 3: 4, 7: 5, 15: 6 } });
    expect(feature.die).toEqual({ 3: 'd8', 10: 'd10', 18: 'd12' });
  });
});
