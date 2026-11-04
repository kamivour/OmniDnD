import { describe, expect, it } from 'vitest';
import { characterExport } from '../data/character-files';
import { seedFile } from '../data/seed';
import { deserializeWorkspace, serializeWorkspace } from '../db/database';
import { addBookmark } from '../engine/commands/bookmarks';
import { applyDamage, heal, setTempHp } from '../engine/commands/hp';
import { addCharacter, deleteCharacter } from '../engine/commands/management';
import { updatePreferences } from '../engine/commands/preferences';
import { EVENT_LIMIT } from '../engine/commands/runner';
import type { ExportFile } from '../engine/schema';
import { ActivityOrderSchema, characterActivity, characterUndoTarget } from './activity-order';
import { createCharacterStore, type CharacterStore } from './character-store';

const FOOL = seedFile.build.id;
const metadata = (eventId: string, realTime = '2026-11-04T10:00:00.000Z') => ({
  eventId,
  realTime,
});
const preferences = { automation: 'manual' as const, reducedMotion: false };
const identities = (store: CharacterStore, characterId = FOOL) =>
  characterActivity(store.getState(), characterId).map(
    ({ scope, event }) => `${scope}:${event.id}`,
  );
const target = (store: CharacterStore, characterId = FOOL) => {
  const value = characterUndoTarget(store.getState(), characterId);
  return value ? `${value.scope}:${value.event.id}` : undefined;
};

function reload(store: CharacterStore): CharacterStore {
  const restored = createCharacterStore([]);
  restored.setState(deserializeWorkspace(serializeWorkspace(store.getState())));
  return restored;
}

function undoLatest(store: CharacterStore, eventId: string) {
  const value = characterUndoTarget(store.getState(), FOOL);
  expect(value).toBeDefined();
  const result =
    value?.scope === 'workspace'
      ? store.getState().undoManagement(metadata(eventId))
      : store.getState().undo(FOOL, metadata(eventId));
  expect(result.result).toBe('ok');
}

describe('workspace-local activity order', () => {
  it('orders interleaved character, preferences and bookmarks by local application through reload and Undo', () => {
    let store = createCharacterStore();
    const initial = structuredClone(store.getState().characters[FOOL]);
    store
      .getState()
      .dispatch(FOOL, applyDamage, { amount: 2 }, metadata('damage', '2099-01-01T00:00:00.000Z'));
    store
      .getState()
      .dispatchManagement(
        updatePreferences,
        preferences,
        metadata('preferences', '2000-01-01T00:00:00.000Z'),
      );
    store
      .getState()
      .dispatch(FOOL, heal, { amount: 1 }, metadata('heal', '1900-01-01T00:00:00.000Z'));
    store
      .getState()
      .dispatchManagement(
        addBookmark,
        { bookmark: { id: 'bookmark', title: 'Rules', url: 'https://example.com/rules' } },
        metadata('bookmark', '1800-01-01T00:00:00.000Z'),
      );
    expect(identities(store)).toEqual([
      'workspace:bookmark',
      'character:heal',
      'workspace:preferences',
      'character:damage',
    ]);
    expect(target(store)).toBe('workspace:bookmark');
    store = reload(store);
    undoLatest(store, 'undo-bookmark');
    expect(target(store)).toBe('character:heal');
    expect(identities(store)[0]).toBe('workspace:undo-bookmark');
    store = reload(store);
    undoLatest(store, 'undo-heal');
    expect(target(store)).toBe('workspace:preferences');
    undoLatest(store, 'undo-preferences');
    expect(target(store)).toBe('character:damage');
    undoLatest(store, 'undo-damage');
    expect(target(store)).toBeUndefined();
    expect(store.getState().characters[FOOL]?.build).toEqual(initial?.build);
    expect(store.getState().characters[FOOL]?.live).toEqual(initial?.live);
    expect(store.getState().automation).toBe('assisted');
    expect(store.getState().bookmarks).toEqual([]);
  });

  it('uses character-first legacy fallback while preserving each log order and input records', () => {
    const store = createCharacterStore();
    store
      .getState()
      .dispatch(FOOL, heal, { amount: 1 }, metadata('old-game', '1900-01-01T00:00:00.000Z'));
    store
      .getState()
      .dispatchManagement(
        updatePreferences,
        preferences,
        metadata('old-workspace', '2099-01-01T00:00:00.000Z'),
      );
    const saved = serializeWorkspace(store.getState());
    delete saved.activityOrder;
    const before = structuredClone(saved);
    const loaded = deserializeWorkspace(saved);
    expect(loaded).not.toHaveProperty('activityOrder');
    expect(characterActivity(loaded, FOOL).map(({ event }) => event.id)).toEqual([
      'old-game',
      'old-workspace',
    ]);
    expect(characterUndoTarget(loaded, FOOL)?.event.id).toBe('old-game');
    expect(serializeWorkspace(loaded)).toEqual(before);
    expect(saved).toEqual(before);
  });

  it('does not let future-dated imported history outrank later local actions or alter exports', () => {
    const source = createCharacterStore();
    source
      .getState()
      .dispatch(FOOL, heal, { amount: 1 }, metadata('imported-future', '2999-01-01T00:00:00.000Z'));
    const file = characterExport(source.getState(), FOOL, '2026-11-04T10:00:00.000Z');
    const before = structuredClone(file);
    const store = createCharacterStore([]);
    store.getState().dispatchManagement(addCharacter, { file }, metadata('import'));
    store
      .getState()
      .dispatchManagement(updatePreferences, preferences, metadata('local-preferences'));
    expect(identities(store)).toEqual([
      'workspace:local-preferences',
      'workspace:import',
      'character:imported-future',
    ]);
    expect(characterExport(store.getState(), FOOL, file.exportedAt)).toEqual(before);
    expect(file).toEqual(before);
    expect(file).not.toHaveProperty('activityOrder');
    expect(file.events[0]).not.toHaveProperty('fingerprint');
    expect(reload(store).getState().characters[FOOL]?.events).toEqual(before.events);
  });

  it('keeps trusted order while a deletion snapshot can restore history across reload', () => {
    let store = createCharacterStore();
    store
      .getState()
      .dispatchManagement(updatePreferences, preferences, metadata('older-preferences'));
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('newer-game'));
    const before = structuredClone(store.getState().characters[FOOL]);
    store.getState().dispatchManagement(deleteCharacter, { characterId: FOOL }, metadata('delete'));
    expect(store.getState().activityOrder?.some((ref) => ref.eventId === 'newer-game')).toBe(true);
    store = reload(store);
    expect(store.getState().undoManagement(metadata('restore')).result).toBe('ok');
    expect(store.getState().characters[FOOL]).toEqual(before);
    expect(target(store)).toBe('character:newer-game');
    expect(identities(store)).toEqual([
      'workspace:restore',
      'workspace:delete',
      'character:newer-game',
      'workspace:older-preferences',
    ]);
  });

  it('does not lend trusted ordering to reused IDs with a different imported event payload', () => {
    let store = createCharacterStore();
    store
      .getState()
      .dispatchManagement(updatePreferences, preferences, metadata('older-preferences'));
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('reused-id'));
    const original = structuredClone(store.getState().characters[FOOL]);
    store.getState().dispatchManagement(deleteCharacter, { characterId: FOOL }, metadata('delete'));
    const source = createCharacterStore();
    source.getState().dispatch(FOOL, applyDamage, { amount: 1 }, metadata('reused-id'));
    const imported = characterExport(source.getState(), FOOL, '2026-11-04T10:00:00.000Z');
    store.getState().dispatchManagement(addCharacter, { file: imported }, metadata('import'));
    // Leave only the earlier trusted reference: the same IDs must not match different content.
    const earlierOrder = store
      .getState()
      .activityOrder?.filter((ref) => ['reused-id', 'older-preferences'].includes(ref.eventId));
    const snapshot = {
      ...store.getState(),
      activityOrder: earlierOrder,
      managementEvents: store
        .getState()
        .managementEvents.filter(({ id }) => id === 'older-preferences'),
    };
    expect(
      characterActivity(snapshot, FOOL).map(({ scope, event }) => `${scope}:${event.id}`),
    ).toEqual(['workspace:older-preferences', 'character:reused-id']);
    expect(characterUndoTarget(snapshot, FOOL)?.scope).toBe('workspace');
    store = reload(store);
    expect(store.getState().undoManagement(metadata('undo-import')).result).toBe('ok');
    expect(store.getState().undoManagement(metadata('undo-delete')).result).toBe('ok');
    expect(store.getState().characters[FOOL]).toEqual(original);
    expect(target(store)).toBe('character:reused-id');
  });

  it('isolates character identities even when different characters use the same event ID', () => {
    const other: ExportFile = structuredClone(seedFile);
    other.build.id = 'other';
    other.live.characterId = 'other';
    const store = createCharacterStore([seedFile, other]);
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('same-id'));
    store.getState().dispatchManagement(updatePreferences, preferences, metadata('preferences'));
    store.getState().dispatch('other', heal, { amount: 1 }, metadata('same-id'));
    expect(identities(store)).toEqual(['workspace:preferences', 'character:same-id']);
    expect(identities(store, 'other')).toEqual(['character:same-id', 'workspace:preferences']);
  });

  it('adds no ordering for blocked/warned attempts and trims only unrecoverable old references', () => {
    const store = createCharacterStore();
    expect(store.getState()).not.toHaveProperty('activityOrder');
    store.getState().dispatch(FOOL, applyDamage, { amount: -1 }, metadata('blocked'));
    expect(store.getState()).not.toHaveProperty('activityOrder');
    store.getState().dispatch(FOOL, setTempHp, { amount: 5 }, metadata('temp'));
    const order = store.getState().activityOrder;
    expect(
      store.getState().dispatch(FOOL, setTempHp, { amount: 1 }, metadata('warned')).result,
    ).toBe('warn');
    expect(store.getState().activityOrder).toBe(order);
    for (let index = 0; index < EVENT_LIMIT; index += 1)
      store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata(`heal-${index}`));
    expect(store.getState().characters[FOOL]?.events).toHaveLength(EVENT_LIMIT);
    expect(store.getState().activityOrder).toHaveLength(EVENT_LIMIT);
    expect(store.getState().activityOrder?.some((ref) => ref.eventId === 'temp')).toBe(false);
  });

  it('rejects malformed or duplicate local references without accepting them as imported event fields', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('heal'));
    const ref = store.getState().activityOrder?.[0];
    expect(ref).toBeDefined();
    expect(ActivityOrderSchema.safeParse([ref, ref]).success).toBe(false);
    expect(
      ActivityOrderSchema.safeParse([{ scope: 'character', eventId: 'heal', fingerprint: 'x' }])
        .success,
    ).toBe(false);
    expect(ref?.fingerprint.length).toBeLessThan(40);
  });

  it('retains trimmed game references only while management snapshots can recover them', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('snapshot-game'));
    store.getState().dispatchManagement(deleteCharacter, { characterId: FOOL }, metadata('delete'));
    expect(store.getState().undoManagement(metadata('restore')).result).toBe('ok');
    for (let index = 0; index < EVENT_LIMIT; index += 1) {
      store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata(`fill-game-${index}`));
    }
    expect(store.getState().characters[FOOL]?.events.some(({ id }) => id === 'snapshot-game')).toBe(
      false,
    );
    expect(store.getState().activityOrder?.some((ref) => ref.eventId === 'snapshot-game')).toBe(
      true,
    );
    store
      .getState()
      .dispatchManagement(updatePreferences, preferences, metadata('workspace-template'));
    const [deletion, restoration, template] = store.getState().managementEvents;
    expect(template).toBeDefined();
    // Seed valid preference events near the retention boundary; only the two boundary
    // commands below need to run 500-event character validation to prove snapshot pruning.
    store.setState({
      managementEvents: [
        deletion!,
        restoration!,
        ...Array.from({ length: EVENT_LIMIT - 2 }, (_, index) => ({
          ...template!,
          id: `fill-workspace-${index}`,
        })),
      ],
    });
    store.getState().dispatchManagement(updatePreferences, preferences, metadata('trim-deletion'));
    expect(store.getState().activityOrder?.some((ref) => ref.eventId === 'snapshot-game')).toBe(
      true,
    );
    store
      .getState()
      .dispatchManagement(updatePreferences, preferences, metadata('trim-restoration'));
    expect(store.getState().managementEvents).toHaveLength(EVENT_LIMIT);
    expect(store.getState().activityOrder?.some((ref) => ref.eventId === 'snapshot-game')).toBe(
      false,
    );
    expect(store.getState().activityOrder).toHaveLength(EVENT_LIMIT + 2);
  });
});
