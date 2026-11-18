import { describe, expect, it } from 'vitest';
import seed from '../../data/characters/the-fool.json';
import { ABILITIES } from '../engine/calc/abilities';
import {
  addCharacter,
  importCharacter,
  runManagement,
  type ManagementData,
} from '../engine/commands/management';
import { ExportFileSchema } from '../engine/schema';
import { registry } from './registry';
import { createCharacterStore } from '../state/character-store';
import { freshSampleFile, sampleFileFor, seedFile } from './seed';

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
    // Five skills from class and background; the race trait and Lore picks add five more.
    expect(fool.build.proficiencies.skills).toHaveLength(5);
    expect(
      Object.values(fool.build.proficiencyPicks ?? {}).flatMap((row) => row.skills ?? []),
    ).toHaveLength(5);
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

describe('sampleFileFor', () => {
  const campaign = {
    ...fool.campaign,
    id: 'campaign-home',
    name: 'Home game',
    sources: ['PHB' as const],
    hpMethod: 'average' as const,
    abilityMethod: 'point-buy' as const,
  };

  it('places a fresh copy of the Fool in the chosen campaign', () => {
    const file = sampleFileFor(campaign, 'sample-1');
    expect(file.campaign).toEqual(campaign);
    expect(file.build).toMatchObject({ id: 'sample-1', campaignId: 'campaign-home' });
    expect(file.build.name).toBe('The Fool');
    expect(file.live.characterId).toBe('sample-1');
    expect(seedFile.build.id).toBe('the-fool');
  });

  it('adds cleanly to a campaign with other rules', () => {
    const result = runManagement(
      addCharacter,
      { campaigns: { [campaign.id]: campaign }, characters: {} },
      { file: sampleFileFor(campaign, 'sample-1') },
      registry,
      { eventId: 'e1', realTime: '2026-11-16T00:00:00.000Z' },
    );
    expect(result.result).toBe('ok');
  });
});

describe('freshSampleFile', () => {
  it('never reuses the shipped ids, so two devices cannot collide', () => {
    const a = freshSampleFile();
    const b = freshSampleFile();
    for (const file of [a, b]) {
      expect(file.campaign.id).not.toBe(seedFile.campaign.id);
      expect(file.build.id).not.toBe(seedFile.build.id);
      expect(file.build.campaignId).toBe(file.campaign.id);
      expect(file.campaign.name).toBe(seedFile.campaign.name);
    }
    expect(a.campaign.id).not.toBe(b.campaign.id);
    expect(a.build.id).not.toBe(b.build.id);
  });

  it('imports twice as two separate campaigns', () => {
    let state: ManagementData = { campaigns: {}, characters: {} };
    for (const id of ['e1', 'e2']) {
      const result = runManagement(importCharacter, state, { file: freshSampleFile() }, registry, {
        eventId: id,
        realTime: '2026-11-19T00:00:00.000Z',
      });
      expect(result.result).toBe('ok');
      if (result.result === 'ok') state = result.next;
    }
    expect(Object.keys(state.campaigns)).toHaveLength(2);
    expect(Object.keys(state.characters)).toHaveLength(2);
  });

  it('is not loaded by a default store', () => {
    expect(createCharacterStore().getState().characters).toEqual({});
  });
});

describe('ExportFileSchema cross-checks', () => {
  function renameFirstInstance(instanceId: string) {
    const file = structuredClone(fool);
    const item = file.build.items[0]!;
    const liveItem = file.live.items[item.instanceId]!;
    delete file.live.items[item.instanceId];
    item.instanceId = instanceId;
    return { file, item, liveItem };
  }

  it.each(['constructor', 'toString', '__proto__'])(
    'rejects missing own live state for legacy instance %s after a JSON round trip',
    (instanceId) => {
      const { file } = renameFirstInstance(instanceId);
      const raw: unknown = JSON.parse(JSON.stringify(file));
      const result = ExportFileSchema.safeParse(raw);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: `Item ${instanceId} has no live state`,
          path: ['live', 'items'],
        }),
      );
    },
  );

  it('rejects an owned __proto__ row that the live-record parser cannot retain', () => {
    const { file, liveItem } = renameFirstInstance('__proto__');
    file.live.items = { ...file.live.items, ...Object.fromEntries([['__proto__', liveItem]]) };
    expect(Object.hasOwn(file.live.items, '__proto__')).toBe(true);
    const result = ExportFileSchema.safeParse(JSON.parse(JSON.stringify(file)));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        message: 'Item __proto__ has no live state',
      }),
    );
  });

  it.each(['legacy-rapier', 'constructor', 'toString'])(
    'keeps valid owned %s records and their raw metadata unchanged',
    (instanceId) => {
      const { file, item } = renameFirstInstance(instanceId);
      item.notes = '  Original notes\nincluding whitespace  ';
      file.live.items = {
        ...file.live.items,
        [instanceId]: {
          qty: 0,
          equipped: true,
          attuned: true,
          charges: 3,
        },
      };
      const raw: unknown = JSON.parse(JSON.stringify(file));
      const parsed = ExportFileSchema.parse(raw);
      expect(Object.hasOwn(parsed.live.items, instanceId)).toBe(true);
      expect(parsed).toEqual(raw);
      expect(file.live.items[instanceId]).toEqual({
        qty: 0,
        equipped: true,
        attuned: true,
        charges: 3,
      });
    },
  );

  it.each(['constructor', 'toString'])(
    'still rejects an extra own live row named %s without a matching owned instance',
    (instanceId) => {
      const file = structuredClone(fool);
      file.live.items = {
        ...file.live.items,
        [instanceId]: { qty: 1, equipped: false, attuned: false },
      };
      const result = ExportFileSchema.safeParse(JSON.parse(JSON.stringify(file)));
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: `Live state has unknown item ${instanceId}`,
          path: ['live', 'items', instanceId],
        }),
      );
    },
  );

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
