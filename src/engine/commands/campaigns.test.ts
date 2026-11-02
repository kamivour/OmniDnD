import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet } from '../calc/sheet';
import type { Campaign, CharacterBuild, ExportFile } from '../schema';
import { campaignMethodConflicts, updateCampaign, type CampaignChanges } from './campaigns';
import { applyDamage } from './hp';
import { levelUp } from './level';
import {
  ManagementEventSchema,
  runManagement,
  undoManagement,
  type ManagementData,
} from './management';
import { runCommand, undo } from './runner';

const metadata = (eventId = 'm1') => ({ eventId, realTime: '2026-11-02T10:00:00.000Z' });
const campaignId = seedFile.campaign.id;
const characterId = seedFile.build.id;

function workspace(file: ExportFile = structuredClone(seedFile)): ManagementData {
  return {
    campaigns: { [file.campaign.id]: file.campaign },
    characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
  };
}

function settings(campaign: Campaign, changes: Partial<CampaignChanges> = {}): CampaignChanges {
  const { name, leveling, hpMethod, hpLevelFloor, abilityMethod } = campaign;
  return { name, leveling, hpMethod, hpLevelFloor, abilityMethod, ...changes };
}

function update(state: ManagementData, changes: Partial<CampaignChanges> = {}) {
  const result = runManagement(
    updateCampaign,
    state,
    { campaignId, changes: settings(state.campaigns[campaignId]!, changes) },
    registry,
    metadata(),
  );
  if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
  return result;
}

function sheet(state: ManagementData) {
  return computeSheet(
    { campaign: state.campaigns[campaignId]!, ...state.characters[characterId]! },
    registry,
  );
}

function weakWorkspace(floor: Campaign['hpLevelFloor']): ManagementData {
  const file = structuredClone(seedFile);
  file.campaign.hpLevelFloor = floor;
  file.build.abilityScores.base.CON = 5; // Half-elf CON bonus gives CON 6, modifier -2.
  file.build.hpEntries[1]!.value = 1;
  file.build.hpEntries[2]!.value = 1;
  file.live.hp = 3;
  return workspace(file);
}

describe('updateCampaign', () => {
  it('logs a trimmed settings change and undoes it exactly', () => {
    const initial = workspace();
    const before = structuredClone(initial);
    const { next, event, reasons } = update(initial, { name: '  Next adventure  ' });
    expect(next.campaigns[campaignId]!.name).toBe('Next adventure');
    expect(next.characters).toBe(initial.characters);
    expect(event).toMatchObject({
      command: 'updateCampaign',
      text: 'Update campaign: Next adventure',
    });
    expect(ManagementEventSchema.parse(event)).toEqual(event);
    expect(reasons).toEqual([]);
    expect(initial).toEqual(before);
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
    expect(undone.events[0]!.undoneBy).toBe('u1');
  });

  it('keeps raw scores, HP choices, XP, play state, and character history when methods change', () => {
    const file = structuredClone(seedFile);
    file.build.xp = 1765;
    const played = runCommand(applyDamage, file, { amount: 3 }, registry, metadata('c1'));
    if (played.result !== 'ok') throw new Error(played.reasons.join());
    const initial = workspace({ ...file, ...played.next, events: [played.event] });
    initial.campaigns[campaignId]!.optionalRules = { feats: true, multiclassing: false };
    const { next } = update(initial, {
      leveling: 'xp',
      hpMethod: 'average',
      abilityMethod: 'standard-array',
    });
    expect(next.characters).toBe(initial.characters);
    expect(next.characters[characterId]!.build.xp).toBe(1765);
    expect(next.campaigns[campaignId]).toEqual({
      ...initial.campaigns[campaignId],
      leveling: 'xp',
      hpMethod: 'average',
      abilityMethod: 'standard-array',
    });
    expect(next.campaigns[campaignId]!.sources).toBe(initial.campaigns[campaignId]!.sources);
    expect(next.campaigns[campaignId]!.optionalRules).toBe(
      initial.campaigns[campaignId]!.optionalRules,
    );
    expect(update(next, { leveling: 'milestone' }).next.characters).toBe(next.characters);
  });

  it('does not invent XP when switching an existing character to XP leveling', () => {
    const initial = workspace();
    const { next } = update(initial, { leveling: 'xp' });
    expect(next.characters).toBe(initial.characters);
    expect(next.characters[characterId]!.build).not.toHaveProperty('xp');
  });

  it.each(['none', 'one'] as const)(
    'locks legacy HP entries before changing the %s floor, preserving negative-CON max HP',
    (oldFloor) => {
      const initial = weakWorkspace(oldFloor);
      const before = structuredClone(initial);
      const oldMax = sheet(initial).maxHp;
      const { next, event } = update(initial, {
        hpLevelFloor: oldFloor === 'none' ? 'one' : 'none',
      });
      const expected = structuredClone(before.characters[characterId]!);
      for (const entry of expected.build.hpEntries) entry.floor = oldFloor;
      expect(next.characters[characterId]).toEqual(expected);
      expect(sheet(next).maxHp).toEqual(oldMax);
      expect(initial).toEqual(before);
      const undone = undoManagement(next, [event], registry, metadata('u1'));
      if (undone.result !== 'ok') throw new Error(undone.reasons.join());
      expect(undone.next).toEqual(before);
    },
  );

  it('retains explicit entry floors and leaves another campaign and its characters untouched', () => {
    const initial = weakWorkspace('none');
    initial.characters[characterId]!.build.hpEntries[1]!.floor = 'one';
    const other = structuredClone(seedFile);
    other.campaign.id = 'elsewhere';
    other.build.campaignId = other.campaign.id;
    other.build.id = 'other-fool';
    other.live.characterId = other.build.id;
    initial.campaigns[other.campaign.id] = other.campaign;
    initial.characters[other.build.id] = { build: other.build, live: other.live, events: [] };
    const same = structuredClone(initial.characters[characterId]!);
    same.build.id = 'same-campaign';
    same.live.characterId = same.build.id;
    initial.characters[same.build.id] = same;
    const { next } = update(initial, { hpLevelFloor: 'one' });
    expect(next.characters[characterId]!.build.hpEntries.map((entry) => entry.floor)).toEqual([
      'none',
      'one',
      'none',
    ]);
    expect(next.characters[same.build.id]!.build.hpEntries.map((entry) => entry.floor)).toEqual([
      'none',
      'one',
      'none',
    ]);
    expect(next.campaigns[other.campaign.id]).toBe(initial.campaigns[other.campaign.id]);
    expect(next.characters[other.build.id]).toBe(initial.characters[other.build.id]);
    expect(sheet(next).maxHp).toEqual(sheet(initial).maxHp);
  });

  it('keeps HP entry metadata untouched when the floor does not change', () => {
    const initial = weakWorkspace('none');
    initial.characters[characterId]!.build.hpEntries[1]!.floor = 'one';
    const { next } = update(initial);
    expect(next.characters).toBe(initial.characters);
    expect(next.characters[characterId]!.build.hpEntries[0]).not.toHaveProperty('floor');
    const changedMethods = update(initial, { hpMethod: 'average', abilityMethod: 'point-buy' });
    expect(changedMethods.next.characters).toBe(initial.characters);
  });

  it('uses the new floor for later levels and preserves their floor and roll when undoing settings', () => {
    const initial = weakWorkspace('none');
    initial.characters[characterId]!.build.hpEntries[1]!.floor = 'one';
    const changed = update(initial, { hpLevelFloor: 'one' });
    const current = changed.next.characters[characterId]!;
    const leveled = runCommand(
      levelUp,
      { campaign: changed.next.campaigns[campaignId]!, ...current },
      { classId: 'class.bard', roll: 1 },
      registry,
      metadata('c1'),
    );
    if (leveled.result !== 'ok') throw new Error(leveled.reasons.join());
    expect(leveled.next.build.hpEntries[3]).toEqual({
      level: 4,
      classId: 'class.bard',
      method: 'rolled',
      value: 1,
      floor: 'one',
    });
    const later: ManagementData = {
      ...changed.next,
      characters: {
        ...changed.next.characters,
        [characterId]: {
          build: leveled.next.build,
          live: leveled.next.live,
          events: [...current.events, leveled.event],
        },
      },
    };
    expect(sheet(later).maxHp.value).toBe(sheet(changed.next).maxHp.value + 1);
    const undone = undoManagement(later, [changed.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next.campaigns[campaignId]).toEqual(initial.campaigns[campaignId]);
    expect(undone.next.characters[characterId]!.build.hpEntries[1]!.floor).toBe('one');
    expect(undone.next.characters[characterId]!.build.hpEntries[3]).toEqual(
      leveled.next.build.hpEntries[3],
    );
    expect(undone.next.characters[characterId]!.live).toEqual(leveled.next.live);
    expect(undone.next.characters[characterId]!.events).toEqual(
      later.characters[characterId]!.events,
    );
    expect(sheet(undone.next).maxHp).toEqual(sheet(later).maxHp);
    expect(undone.event.override).toBeUndefined();
  });

  it('can undo settings after character Undo removes a legacy level that received floor metadata', () => {
    const file = structuredClone(seedFile);
    const leveled = runCommand(
      levelUp,
      file,
      { classId: 'class.bard', roll: 1 },
      registry,
      metadata('c1'),
    );
    if (leveled.result !== 'ok') throw new Error(leveled.reasons.join());
    const legacy = structuredClone(leveled);
    delete legacy.next.build.hpEntries[3]!.floor;
    for (const patch of legacy.event.patches) {
      if (patch.path[0] === 'build' && patch.path[1] === 'hpEntries' && patch.op === 'add')
        delete (patch.value as { floor?: string }).floor;
    }
    const initial = workspace({ ...file, ...legacy.next, events: [legacy.event] });
    const changed = update(initial, { hpLevelFloor: 'one' });
    const record = changed.next.characters[characterId]!;
    const reverted = undo(
      { campaign: changed.next.campaigns[campaignId]!, ...record },
      record.events,
      metadata('cu1'),
    );
    if (reverted.result !== 'ok') throw new Error(reverted.reasons.join());
    const later: ManagementData = {
      ...changed.next,
      characters: {
        ...changed.next.characters,
        [characterId]: {
          build: reverted.next.build,
          live: reverted.next.live,
          events: reverted.events,
        },
      },
    };
    expect(undoManagement(later, [changed.event], registry, metadata('u1')).result).toBe('warn');
    const undone = undoManagement(later, [changed.event], registry, metadata('u1'), true);
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next.campaigns[campaignId]).toEqual(file.campaign);
    expect(undone.next.characters[characterId]!.build).toEqual(file.build);
    expect(undone.next.characters[characterId]!.live).toEqual(file.live);
    expect(undone.next.characters[characterId]!.events).toEqual(reverted.events);
    expect(undone.event.override).toBe(true);
  });

  it.each([
    null,
    {},
    { campaignId: 'missing', changes: settings(seedFile.campaign) },
    { campaignId: 'toString', changes: settings(seedFile.campaign) },
    { campaignId, changes: settings(seedFile.campaign, { name: '  ' }) },
    { campaignId, changes: { ...settings(seedFile.campaign), hpMethod: 'maximum' } },
    { campaignId, changes: { ...settings(seedFile.campaign), hpLevelFloor: 'zero' } },
    { campaignId, changes: { ...settings(seedFile.campaign), abilityMethod: '2024' } },
    { campaignId, changes: { ...settings(seedFile.campaign), leveling: 'automatic' } },
    { campaignId, changes: { ...settings(seedFile.campaign), ruleset: '5e-2024' } },
    { campaignId, changes: { ...settings(seedFile.campaign), sources: ['SRD'] } },
    { campaignId, changes: { ...settings(seedFile.campaign), optionalRules: { feats: true } } },
    { campaignId, changes: { ...settings(seedFile.campaign), id: 'elsewhere' } },
    { campaignId, changes: { ...settings(seedFile.campaign), schemaVersion: 2 } },
    { campaignId, changes: { name: 'Incomplete' } },
    { campaignId, changes: settings(seedFile.campaign), extra: true },
  ])('blocks malformed or missing settings without mutation, even forced (%j)', (payload) => {
    const initial = workspace();
    const before = structuredClone(initial);
    const result = runManagement(
      updateCampaign,
      initial,
      payload as { campaignId: string; changes: CampaignChanges },
      registry,
      { ...metadata(), force: true },
    );
    expect(result.result).toBe('blocked');
    expect(initial).toEqual(before);
  });
});

describe('campaignMethodConflicts', () => {
  function notes(changes: Partial<CampaignChanges>, build: CharacterBuild = seedFile.build) {
    return campaignMethodConflicts({ ...seedFile.campaign, ...changes }, build);
  }

  it('identifies the retained HP values for each different method and ignores level 1', () => {
    expect(notes({ hpMethod: 'average' })).toEqual([
      'Level 2 HP retains its rolled value (4); campaign uses average HP.',
      'Level 3 HP retains its rolled value (4); campaign uses average HP.',
    ]);
    const build = structuredClone(seedFile.build);
    build.hpEntries[1]!.method = 'average';
    build.hpEntries[1]!.value = 5;
    expect(notes({}, build)).toEqual([
      'Level 2 HP retains its average value (5); campaign uses rolled HP.',
    ]);
  });

  it('checks base scores against the standard array, leaving racial bonuses out', () => {
    expect(notes({ abilityMethod: 'standard-array' })).toEqual([
      'Base ability scores do not match the standard array (15, 14, 13, 12, 10, 8); existing scores are retained.',
    ]);
    const build = structuredClone(seedFile.build);
    build.abilityScores.base = { STR: 8, DEX: 15, CON: 14, INT: 10, WIS: 12, CHA: 13 };
    expect(notes({ abilityMethod: 'standard-array' }, build)).toEqual([]);
    expect(notes({ abilityMethod: 'point-buy' }, build)).toEqual([]);
  });

  it('reports point-buy bounds and cost accurately without changing the build', () => {
    const build = structuredClone(seedFile.build);
    build.abilityScores.base.STR = 7;
    const before = structuredClone(build);
    expect(notes({ abilityMethod: 'point-buy' }, build)).toEqual([
      'Base scores outside point-buy bounds (8–15): STR 7, CHA 18. Existing scores are retained.',
    ]);
    expect(build).toEqual(before);
    build.abilityScores.base = { STR: 15, DEX: 15, CON: 15, INT: 15, WIS: 15, CHA: 15 };
    expect(notes({ abilityMethod: 'point-buy' }, build)).toEqual([
      'Base ability scores cost 54 point-buy points (budget 27); existing scores are retained.',
    ]);
    build.abilityScores.base = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
    expect(notes({ abilityMethod: 'point-buy' }, build)).toEqual([]);
  });

  it('identifies untracked XP only when the campaign uses XP', () => {
    expect(notes({ leveling: 'xp' })).toEqual(['XP is not tracked yet']);
    expect(notes({})).toEqual([]);
    expect(notes({ leveling: 'xp' }, { ...seedFile.build, xp: 0 })).toEqual([]);
  });
});
