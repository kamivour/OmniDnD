import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { runManagement, undoManagement, type ManagementData } from '../commands/management';
import { updateCampaign, type CampaignChanges } from '../commands/campaigns';
import { CampaignSchema } from '../schema';
import {
  bookOn,
  booksWithPart,
  entryBooks,
  entryPart,
  normalizeSourceParts,
  OPTIONAL_RULE_DEFAULTS,
  optionalRules,
  sourceAllows,
  sourceConflicts,
  sourcesRemoved,
} from './campaign-rules';

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
    state.campaigns[seedFile.campaign.id]!.optionalRules = { customOrigin: true };
    const bonus = { source: 'Custom origin', ability: 'STR', value: 1 } as const;
    state.characters[seedFile.build.id]!.build.abilityScores.bonuses.push(bonus);
    const before = structuredClone(state);
    const payload = {
      campaignId: seedFile.campaign.id,
      changes: changes(state, { optionalRules: { feats: true, rests: 'gritty' } }),
    };
    const warned = runManagement(updateCampaign, state, payload, registry, meta('e1'));
    expect(warned).toEqual({
      result: 'warn',
      reasons: [`${seedFile.build.name} keeps Custom origin ability bonuses`],
    });
    const done = runManagement(updateCampaign, state, payload, registry, {
      ...meta('e1'),
      force: true,
    });
    if (done.result !== 'ok') throw new Error(done.reasons.join());
    const campaign = done.next.campaigns[seedFile.campaign.id]!;
    expect(optionalRules(campaign)).toMatchObject({
      feats: true,
      customOrigin: false,
      rests: 'gritty',
    });
    expect(done.next.characters[seedFile.build.id]!.build.abilityScores.bonuses).toContainEqual(
      bonus,
    );
    const undone = undoManagement(done.next, [done.event], registry, meta('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
  });

  it('blocks turning off a book or a part, and allows adding them', () => {
    const state = workspace();
    const saved = state.campaigns[seedFile.campaign.id]!;
    saved.sources = ['PHB', 'XGE'];
    saved.sourceParts = { XGE: ['options'] };
    const run = (extra: Partial<CampaignChanges>, id: string) =>
      runManagement(
        updateCampaign,
        state,
        { campaignId: seedFile.campaign.id, changes: changes(state, extra) },
        registry,
        meta(id),
      );
    const prefix = 'Books and parts can only be added, not turned off: ';
    expect(run({ sources: ['PHB'] }, 'b1')).toEqual({
      result: 'blocked',
      reasons: [`${prefix}Xanathar's Guide to Everything`],
    });
    expect(run({ sources: ['PHB', 'XGE'], sourceParts: { XGE: ['spells'] } }, 'b2')).toEqual({
      result: 'blocked',
      reasons: [`${prefix}Xanathar's Guide to Everything: classes, subclasses and origins`],
    });
    const added = run(
      { sources: ['PHB', 'XGE', 'TCE'], sourceParts: { XGE: ['options', 'spells'] } },
      'b3',
    );
    if (added.result !== 'ok') throw new Error(added.reasons.join());
    expect(added.next.campaigns[seedFile.campaign.id]).toMatchObject({
      sources: ['PHB', 'XGE', 'TCE'],
      sourceParts: { XGE: ['options', 'spells'] },
    });
    // Books sent without parts use every part.
    const full = run({ sources: ['PHB', 'XGE'] }, 'b4');
    if (full.result !== 'ok') throw new Error(full.reasons.join());
    expect(full.next.campaigns[seedFile.campaign.id]!.sourceParts).toBeUndefined();
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

describe('book parts', () => {
  const xgeFeats = {
    sources: ['PHB', 'DMG', 'XGE'],
    sourceParts: { XGE: ['feats'] },
  } satisfies Parameters<typeof sourceAllows>[0];

  it('sorts entries into the part of the book they come from', () => {
    expect(entryPart({ kind: 'spell' })).toBe('spells');
    expect(entryPart({ kind: 'item' })).toBe('items');
    expect(entryPart({ kind: 'subclass' })).toBe('options');
    expect(entryPart({ kind: 'feature', origin: 'feat' })).toBe('feats');
    expect(entryPart({ kind: 'feature', origin: 'subclass' })).toBe('options');
    expect(entryPart({ kind: 'condition' })).toBeUndefined();
  });

  it('allows only the parts a limited book uses', () => {
    expect(sourceAllows(xgeFeats, { kind: 'feature', origin: 'feat', source: 'XGE' })).toBe(true);
    expect(sourceAllows(xgeFeats, { kind: 'spell', source: 'XGE' })).toBe(false);
    expect(sourceAllows(xgeFeats, { kind: 'subclass', source: 'XGE' })).toBe(false);
    expect(sourceAllows(xgeFeats, { kind: 'spell', source: 'PHB' })).toBe(true);
    expect(sourceAllows(xgeFeats, { kind: 'spell', source: 'TCE' })).toBe(false);
    expect(booksWithPart(xgeFeats, 'spells')).toEqual(['PHB', 'DMG']);
  });

  it('flags a kept choice from a part the campaign does not use', () => {
    const build = workspace().characters[seedFile.build.id]!.build;
    const spell = [...registry.entries.values()].find(
      (entry) => entry.kind === 'spell' && entry.source === 'XGE',
    )!;
    build.spells[0]!.known.push(spell.id);
    expect(sourceConflicts(xgeFeats, build, registry)).toEqual([`${spell.name} (XGE)`]);
  });

  it('names removed books and parts', () => {
    expect(sourcesRemoved({ sources: ['PHB', 'DMG', 'XGE'] }, xgeFeats)).toEqual([
      "Xanathar's Guide to Everything: classes, subclasses and origins",
      "Xanathar's Guide to Everything: spells",
      "Xanathar's Guide to Everything: magic items",
    ]);
    expect(sourcesRemoved(xgeFeats, { sources: ['PHB', 'DMG', 'XGE'] })).toEqual([]);
  });

  it('stores full books without a part list', () => {
    expect(
      normalizeSourceParts({
        sources: ['PHB', 'XGE'],
        sourceParts: { XGE: ['spells', 'feats'], TCE: ['feats'] },
      }),
    ).toEqual({ XGE: ['feats', 'spells'] });
    expect(
      normalizeSourceParts({
        sources: ['PHB', 'XGE'],
        sourceParts: { XGE: ['options', 'feats', 'spells', 'items'] },
      }),
    ).toBeUndefined();
  });
});

describe('monster books', () => {
  const phbOnly = { sources: ['PHB'] } satisfies Parameters<typeof sourceAllows>[0];
  const withVolo = { sources: ['PHB', 'VGM'] } satisfies Parameters<typeof sourceAllows>[0];

  it('keeps the Monster Manual on in every campaign', () => {
    expect(bookOn(phbOnly, 'MM')).toBe(true);
    expect(bookOn(phbOnly, 'VGM')).toBe(false);
    expect(sourceAllows(phbOnly, { kind: 'creature', source: 'MM' })).toBe(true);
  });

  it('shows a creature when any book it is printed in is on', () => {
    const reprint = {
      kind: 'creature' as const,
      source: 'MPMM' as const,
      books: [
        { source: 'VGM' as const, page: 10 },
        { source: 'MPMM' as const, page: 20 },
      ],
    };
    expect(entryBooks(reprint)).toEqual(['VGM', 'MPMM']);
    expect(sourceAllows(phbOnly, reprint)).toBe(false);
    expect(sourceAllows(withVolo, reprint)).toBe(true);
    expect(entryBooks({ source: 'PHB' })).toEqual(['PHB']);
  });
});
