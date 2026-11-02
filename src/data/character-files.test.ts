import { describe, expect, it, vi } from 'vitest';
import { deserializeWorkspace, serializeWorkspace } from '../db/database';
import { applyDamage, heal } from '../engine/commands/hp';
import { ExportFileSchema, SCHEMA_VERSION, type ExportFile } from '../engine/schema';
import { createCharacterStore } from '../state/character-store';
import { characterExport, prepareCharacterImport } from './character-files';
import { seedFile } from './seed';

const FOOL = seedFile.build.id;
const TIME = '2026-11-02T00:00:00.000Z';
const metadata = (eventId: string) => ({ eventId, realTime: TIME });

function fileWithHistory(id = FOOL) {
  const source = structuredClone(seedFile);
  source.build.id = id;
  source.live.characterId = id;
  const store = createCharacterStore([source]);
  store.getState().dispatch(id, applyDamage, { amount: 2 }, metadata('damage'));
  store.getState().dispatch(id, heal, { amount: 1 }, metadata('heal'));
  return characterExport(store.getState(), id, TIME);
}

function sourceData(state: ReturnType<typeof createCharacterStore>['getState']) {
  const { campaigns, characters } = state();
  return structuredClone({ campaigns, characters });
}

function roundTrip(file: ExportFile) {
  return deserializeWorkspace(
    serializeWorkspace({
      campaigns: { [file.campaign.id]: file.campaign },
      characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
      automation: 'assisted',
      managementEvents: [],
      bookmarks: [],
    }),
  );
}

describe('character JSON files', () => {
  it('exports the joined current campaign, build, live state, and complete log as a detached file', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, heal, { amount: 3 }, metadata('heal'));
    const campaign = { ...seedFile.campaign, name: 'Current campaign title' };
    store.setState({ campaigns: { [campaign.id]: campaign } });
    const before = sourceData(store.getState);

    const exported = characterExport(store.getState(), FOOL, TIME);
    expect(exported).toEqual({
      app: 'omnidnd',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: TIME,
      campaign: before.campaigns[campaign.id],
      ...before.characters[FOOL],
    });
    expect(ExportFileSchema.safeParse(exported).success).toBe(true);
    expect(exported.live.hp).toBe(14);
    expect(exported.events).toHaveLength(1);
    expect(roundTrip(exported).characters[FOOL]?.events).toEqual(exported.events);

    exported.build.name = 'Edited downloaded file';
    exported.campaign.name = 'Edited campaign';
    exported.live.hp = 1;
    exported.events.splice(0);
    expect(sourceData(store.getState)).toEqual(before);
  });

  it('reports an absent character without changing current data', () => {
    const store = createCharacterStore();
    const before = sourceData(store.getState);
    expect(() => characterExport(store.getState(), 'missing', TIME)).toThrow('Character not found');
    expect(sourceData(store.getState)).toEqual(before);
  });

  it('preserves an unambiguous file and its usable history without requesting new IDs', () => {
    const raw = fileWithHistory('visiting-bard');
    const store = createCharacterStore();
    const before = structuredClone(raw);
    const current = sourceData(store.getState);
    const makeId = vi.fn(() => 'unused');

    const prepared = prepareCharacterImport(raw, store.getState(), makeId);
    expect(prepared).toEqual({ file: before, notes: [] });
    expect(makeId).not.toHaveBeenCalled();
    const restored = roundTrip(prepared.file);
    expect(restored.characters[raw.build.id]?.events).toEqual(raw.events);
    const imported = createCharacterStore([prepared.file]);
    expect(imported.getState().undo(raw.build.id, metadata('undo-heal')).result).toBe('ok');
    expect(imported.getState().characters[raw.build.id]?.live.hp).toBe(9);
    expect(raw).toEqual(before);
    expect(sourceData(store.getState)).toEqual(current);
  });

  it('assigns a colliding character a new ID while keeping current values and starting fresh history', () => {
    const raw = fileWithHistory();
    const store = createCharacterStore();
    const before = structuredClone(raw);
    const current = sourceData(store.getState);
    const makeId = vi.fn(() => 'imported-bard');

    const { file, notes } = prepareCharacterImport(raw, store.getState(), makeId);
    expect(makeId).toHaveBeenCalledTimes(1);
    expect(file.build).toEqual({
      ...before.build,
      id: 'imported-bard',
      name: `${before.build.name} (imported copy)`,
    });
    expect(file.live).toEqual({ ...before.live, characterId: 'imported-bard' });
    expect(file.campaign).toEqual(before.campaign);
    expect(file.events).toEqual([]);
    expect(notes).toEqual([
      expect.stringMatching(/ID already exists/),
      expect.stringMatching(/current values.*history starts fresh/),
    ]);
    expect(roundTrip(file).characters['imported-bard']?.live.hp).toBe(10);
    expect(raw).toEqual(before);
    expect(sourceData(store.getState)).toEqual(current);
  });

  it('treats reordered optional-rule keys as the same campaign and preserves import history', () => {
    const existing = structuredClone(seedFile);
    existing.campaign.optionalRules = { 'custom-a': false, 'custom-b': false };
    const store = createCharacterStore([existing]);
    const raw = fileWithHistory('visiting-bard');
    raw.campaign.optionalRules = { 'custom-b': false, 'custom-a': false };
    const before = structuredClone(raw);
    const current = sourceData(store.getState);
    const makeId = vi.fn(() => 'unused');

    const prepared = prepareCharacterImport(raw, store.getState(), makeId);
    expect(prepared).toEqual({ file: before, notes: [] });
    expect(makeId).not.toHaveBeenCalled();
    expect(roundTrip(prepared.file).characters[raw.build.id]?.events).toEqual(raw.events);
    expect(raw).toEqual(before);
    expect(sourceData(store.getState)).toEqual(current);
  });

  it('keeps conflicting campaign rules in a separate campaign without overwriting existing rules', () => {
    const raw = fileWithHistory('visiting-bard');
    raw.campaign.hpMethod = 'average';
    const before = structuredClone(raw);
    const store = createCharacterStore();
    const current = sourceData(store.getState);
    const makeId = vi.fn(() => 'imported-campaign');

    const { file, notes } = prepareCharacterImport(raw, store.getState(), makeId);
    expect(makeId).toHaveBeenCalledTimes(1);
    expect(file.campaign).toEqual({
      ...before.campaign,
      id: 'imported-campaign',
      name: `${before.campaign.name} (imported)`,
    });
    expect(file.build).toEqual({ ...before.build, campaignId: 'imported-campaign' });
    expect(file.live).toEqual(before.live);
    expect(file.events).toEqual([]);
    expect(notes).toEqual([
      expect.stringMatching(/Campaign rules differ/),
      expect.stringMatching(/history starts fresh/),
    ]);
    expect(roundTrip(file).campaigns['imported-campaign']?.hpMethod).toBe('average');
    expect(raw).toEqual(before);
    expect(sourceData(store.getState)).toEqual(current);
  });

  it.each(['missing live', 'unsupported schema', '2024 rules'] as const)(
    'rejects %s without changing the input or current workspace',
    (kind) => {
      const raw: Record<string, unknown> = structuredClone(fileWithHistory());
      if (kind === 'missing live') delete raw.live;
      else if (kind === 'unsupported schema') raw.schemaVersion = 999;
      else raw.campaign = { ...seedFile.campaign, ruleset: '5e-2024' };
      const before = structuredClone(raw);
      const store = createCharacterStore();
      const current = sourceData(store.getState);
      const makeId = vi.fn(() => 'should-not-be-used');

      expect(() => prepareCharacterImport(raw, store.getState(), makeId)).toThrow();
      expect(makeId).not.toHaveBeenCalled();
      expect(raw).toEqual(before);
      expect(sourceData(store.getState)).toEqual(current);
    },
  );

  it.each(['invalid value', 'invalid path', 'changed identity'] as const)(
    'validates all original history before remapping a collision: %s',
    (kind) => {
      const raw = fileWithHistory();
      const oldest = raw.events[0];
      if (!oldest) throw new Error('Test history missing');
      oldest.inversePatches =
        kind === 'invalid value'
          ? [{ op: 'replace', path: ['live', 'hp'], value: -1 }]
          : kind === 'invalid path'
            ? [{ op: 'replace', path: ['live', 'absent', 'hp'], value: 11 }]
            : [{ op: 'replace', path: ['build', 'id'], value: 'other-character' }];
      const before = structuredClone(raw);
      const store = createCharacterStore();
      const current = sourceData(store.getState);
      const makeId = vi.fn(() => 'should-not-be-used');

      expect(() => roundTrip(raw)).toThrow(/undo history/);
      expect(() => prepareCharacterImport(raw, store.getState(), makeId)).toThrow(/undo history/);
      expect(makeId).not.toHaveBeenCalled();
      expect(raw).toEqual(before);
      expect(sourceData(store.getState)).toEqual(current);
    },
  );
});
