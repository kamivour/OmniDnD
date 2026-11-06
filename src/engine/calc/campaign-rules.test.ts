import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { runManagement, undoManagement, type ManagementData } from '../commands/management';
import { updateCampaign, type CampaignChanges } from '../commands/campaigns';
import { CampaignSchema } from '../schema';
import { OPTIONAL_RULE_DEFAULTS, optionalRules, sourceConflicts } from './campaign-rules';

const meta = (eventId: string) => ({ eventId, realTime: '2026-11-06T10:00:00.000Z' });

function workspace(): ManagementData {
  const file = structuredClone(seedFile);
  file.campaign.sources = ['PHB', 'DMG', 'XGE', 'TCE'];
  file.build.items.push({ instanceId: 'armor-1', itemId: 'item.adamantine-armor' });
  file.live.items['armor-1'] = { qty: 1, equipped: false, attuned: false };
  return {
    campaigns: { [file.campaign.id]: file.campaign },
    characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
  };
}

function changes(state: ManagementData, extra: Partial<CampaignChanges>): CampaignChanges {
  const { name, leveling, hpMethod, hpLevelFloor, abilityMethod } =
    state.campaigns[seedFile.campaign.id]!;
  return { name, leveling, hpMethod, hpLevelFloor, abilityMethod, ...extra };
}

describe('optional rules', () => {
  it('start off, with the standard encumbrance and rest rules', () => {
    expect(optionalRules({ optionalRules: {} })).toEqual(OPTIONAL_RULE_DEFAULTS);
    expect(OPTIONAL_RULE_DEFAULTS.feats).toBe(false);
  });

  it('read stored values and ignore unknown ones', () => {
    const rules = optionalRules({
      optionalRules: { feats: true, encumbrance: 'variant', rests: 'heroic', multiclassing: 'yes' },
    });
    expect(rules).toMatchObject({ feats: true, encumbrance: 'variant', rests: 'standard' });
    expect(rules.multiclassing).toBe(false);
  });

  it('older saves with only flags still parse', () => {
    const campaign = { ...seedFile.campaign, optionalRules: { feats: true } };
    expect(CampaignSchema.parse(campaign).optionalRules).toEqual({ feats: true });
  });
});

describe('source changes', () => {
  it('lists choices from books the campaign no longer enables', () => {
    const state = workspace();
    const build = state.characters[seedFile.build.id]!.build;
    expect(sourceConflicts({ sources: ['PHB', 'DMG'] }, build, registry)).toEqual([]);
    expect(sourceConflicts({ sources: ['PHB'] }, build, registry)).toEqual([
      'Adamantine Armor (DMG)',
    ]);
  });

  it('warns about kept choices, keeps them, and undoes exactly', () => {
    const state = workspace();
    const before = structuredClone(state);
    const payload = {
      campaignId: seedFile.campaign.id,
      changes: changes(state, {
        sources: ['PHB', 'XGE'],
        optionalRules: { feats: true, rests: 'gritty' },
      }),
    };
    const warned = runManagement(updateCampaign, state, payload, registry, meta('e1'));
    expect(warned).toEqual({
      result: 'warn',
      reasons: [`${seedFile.build.name} keeps Adamantine Armor (DMG)`],
    });
    const done = runManagement(updateCampaign, state, payload, registry, {
      ...meta('e1'),
      force: true,
    });
    if (done.result !== 'ok') throw new Error(done.reasons.join());
    const campaign = done.next.campaigns[seedFile.campaign.id]!;
    expect(campaign.sources).toEqual(['PHB', 'XGE']);
    expect(optionalRules(campaign)).toMatchObject({ feats: true, rests: 'gritty' });
    expect(done.next.characters[seedFile.build.id]!.build.items).toContainEqual({
      instanceId: 'armor-1',
      itemId: 'item.adamantine-armor',
    });
    const undone = undoManagement(done.next, [done.event], registry, meta('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
  });

  it("never drops the Player's Handbook", () => {
    const state = workspace();
    const result = runManagement(
      updateCampaign,
      state,
      { campaignId: seedFile.campaign.id, changes: changes(state, { sources: ['XGE'] }) },
      registry,
      meta('e2'),
    );
    expect(result.result).toBe('blocked');
  });

  it('keeps sources and rules when a caller sends only Phase 1 settings', () => {
    const state = workspace();
    const result = runManagement(
      updateCampaign,
      state,
      { campaignId: seedFile.campaign.id, changes: changes(state, { name: 'Renamed' }) },
      registry,
      meta('e3'),
    );
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.next.campaigns[seedFile.campaign.id]!.sources).toEqual([
      'PHB',
      'DMG',
      'XGE',
      'TCE',
    ]);
  });
});
