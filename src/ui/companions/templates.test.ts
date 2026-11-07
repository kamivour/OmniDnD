import { describe, expect, it } from 'vitest';
import { companionStats } from '../../engine/calc/companions';
import { computeSheet } from '../../engine/calc/sheet';
import { addCompanion } from '../../engine/commands/companions';
import { freshState, Session } from '../../engine/commands/test-utils';
import { registry } from '../../data/registry';
import { CompanionSchema, type Companion } from '../../engine/schema';
import { COMPANION_TEMPLATES } from './templates';

const template = (label: string) => {
  const found = COMPANION_TEMPLATES.find((entry) => entry.label === label);
  if (!found) throw new Error(label);
  return { ...found.companion, id: label } as Companion;
};

const ownerAt = (classId: string, level: number) => {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId, level }];
  state.build.hpEntries = [];
  return { build: state.build, sheet: computeSheet(state, registry) };
};

describe('companion templates', () => {
  it('are all valid, with unique labels', () => {
    expect(new Set(COMPANION_TEMPLATES.map((entry) => entry.label)).size).toBe(
      COMPANION_TEMPLATES.length,
    );
    for (const { companion, label } of COMPANION_TEMPLATES)
      expect(CompanionSchema.safeParse({ ...companion, id: label }).success, label).toBe(true);
  });

  it("gives a ranger's companion the higher of its HP or 4 x ranger level", () => {
    const wolf = template("Wolf (Ranger's companion)");
    expect(companionStats(wolf, ownerAt('class.ranger', 1)).maxHp).toBe(11);
    expect(companionStats(wolf, ownerAt('class.ranger', 2)).maxHp).toBe(11);
    expect(companionStats(wolf, ownerAt('class.ranger', 5)).maxHp).toBe(20);
  });

  it("adds the ranger's proficiency bonus to AC, attack and damage", () => {
    const wolf = template("Wolf (Ranger's companion)");
    const owner = ownerAt('class.ranger', 9);
    const pb = owner.sheet.proficiency;
    const stats = companionStats(wolf, owner);
    expect(stats.ac).toBe(13 + pb);
    expect(stats.attacks[0]).toMatchObject({
      bonus: 2 + pb,
      damage: { dice: '2d4', bonus: 2 + pb, type: 'piercing' },
    });
  });

  it('follows the artificer for the Steel Defender and Eldritch Cannon', () => {
    const owner = ownerAt('class.artificer', 5);
    const intMod = owner.sheet.abilities.INT.mod;
    expect(companionStats(template('Steel Defender'), owner).maxHp).toBe(2 + intMod + 25);
    const cannon = companionStats(template('Eldritch Cannon'), owner);
    expect(cannon.maxHp).toBe(25);
    expect(cannon.attacks[0]!.bonus).toBe(intMod + owner.sheet.proficiency);
  });

  it('warns on a second ranger companion and keeps familiars from attacking', () => {
    const session = new Session(structuredClone(freshState));
    session.run(addCompanion, { companion: template("Wolf (Ranger's companion)") });
    const second = template("Panther (Ranger's companion)");
    const preview = session.preview(addCompanion, { companion: { ...second, id: 'second' } });
    expect(preview.result).toBe('warn');
    expect(template('Owl (familiar)').attacks).toEqual([]);
    expect(template('Owl (familiar)').speed).toEqual({ walk: 5, fly: 60 });
  });
});
