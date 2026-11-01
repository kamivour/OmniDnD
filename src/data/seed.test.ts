import { describe, expect, it } from 'vitest';
import seed from '../../data/characters/the-fool.json';
import { ABILITIES } from '../engine/calc/abilities';
import { ExportFileSchema } from '../engine/schema';

/** The seed must match TEST_CHARACTER.md §1–3. */
const fool = ExportFileSchema.parse(seed);

describe('The Fool seed', () => {
  it('uses campaign #273 rules', () => {
    expect(fool.campaign).toMatchObject({
      ruleset: '5e-2014',
      leveling: 'milestone',
      hpMethod: 'rolled',
      abilityMethod: 'rolled',
      sources: ['PHB', 'XGE', 'TCE'],
    });
    expect(fool.build.xp).toBeUndefined();
  });

  it('adds racial bonuses to the rolled scores', () => {
    const final = Object.fromEntries(
      ABILITIES.map((ability) => [
        ability,
        fool.build.abilityScores.base[ability] +
          fool.build.abilityScores.bonuses
            .filter((bonus) => bonus.ability === ability)
            .reduce((sum, bonus) => sum + bonus.value, 0),
      ]),
    );
    expect(final).toEqual({ STR: 11, DEX: 15, CON: 13, INT: 12, WIS: 12, CHA: 20 });
  });

  it('is a Bard 3 with the expected HP entries, proficiencies, and spells', () => {
    expect(fool.build.classes).toEqual([
      { classId: 'class.bard', subclassId: 'subclass.bard.lore', level: 3 },
    ]);
    expect(fool.build.hpEntries.map((entry) => entry.value)).toEqual([8, 4, 4]);
    expect(fool.build.proficiencies.skills).toHaveLength(10);
    expect(fool.build.proficiencies.expertise).toEqual(['deception', 'sleight-of-hand']);
    expect(fool.build.spells[0]?.known).toHaveLength(8);
  });

  it('carries the §2 inventory and currency', () => {
    const qty = (itemId: string) =>
      fool.build.items
        .filter((item) => item.itemId === itemId)
        .reduce((sum, item) => sum + (fool.live.items[item.instanceId]?.qty ?? 0), 0);
    expect(qty('item.disguise-kit')).toBe(2);
    expect(qty('item.candle')).toBe(5);
    expect(qty('item.rations-1-day')).toBe(6);
    expect(qty('item.signet-ring')).toBe(1);
    const equipped = fool.build.items
      .filter((item) => fool.live.items[item.instanceId]?.equipped)
      .map((item) => item.itemId);
    expect(equipped).toEqual(['item.rapier', 'item.dagger', 'item.leather-armor']);
    expect(fool.live.currency).toEqual({ cp: 0, sp: 5, ep: 0, gp: 49, pp: 0 });
  });

  it('loads the §3 live state', () => {
    expect(fool.live.hp).toBe(11);
    expect(fool.live.tempHp).toBe(0);
    expect(fool.live.slotsUsed.slice(1, 3)).toEqual([4, 0]);
    expect(fool.live.featureUsesSpent).toEqual({ 'feature.bard.bardic-inspiration': 2 });
    expect(fool.live.hitDiceSpent).toEqual({});
    expect(fool.live.concentration).toBeUndefined();
    expect(fool.live.effects).toEqual([]);
    expect(fool.live.conditions).toEqual([]);
    expect(fool.live.clock.seconds).toBe(8 * 3600);
  });
});

describe('ExportFileSchema cross-checks', () => {
  it('rejects a build from another campaign', () => {
    const file = structuredClone(seed);
    file.build.campaignId = 'campaign-999';
    expect(ExportFileSchema.safeParse(file).success).toBe(false);
  });

  it('rejects live state for another character', () => {
    const file = structuredClone(seed);
    file.live.characterId = 'someone-else';
    expect(ExportFileSchema.safeParse(file).success).toBe(false);
  });

  it('needs live state for every owned item, and only those', () => {
    const missing = structuredClone(seed) as { live: { items: Record<string, unknown> } };
    delete missing.live.items['rapier-1'];
    expect(ExportFileSchema.safeParse(missing).error?.issues[0]?.message).toBe(
      'Item rapier-1 has no live state',
    );

    const extra = structuredClone(seed) as { live: { items: Record<string, unknown> } };
    extra.live.items['ghost-1'] = { qty: 1, equipped: false, attuned: false };
    expect(ExportFileSchema.safeParse(extra).error?.issues[0]?.message).toBe(
      'Live state has unknown item ghost-1',
    );
  });
});
