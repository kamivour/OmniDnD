import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { applyDamage, heal } from '../engine/commands/hp';
import type { ExportFile } from '../engine/schema';
import { createCharacterStore } from '../state/character-store';
import {
  deserializeWorkspace,
  parseStoredRecord,
  serializeWorkspace,
  type WorkspaceRows,
} from './database';
import { z } from 'zod';

const FOOL = seedFile.build.id;
const metadata = (eventId: string) => ({ eventId, realTime: '2026-11-02T00:00:00.000Z' });

function rows(): WorkspaceRows {
  const store = createCharacterStore();
  store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, metadata('damage'));
  store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('heal'));
  return serializeWorkspace(store.getState());
}

describe('persisted workspace validation', () => {
  it('round-trips source state and undo history without derived values', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, metadata('damage'));
    store.getState().undo(FOOL, metadata('undo'));
    const saved = serializeWorkspace(store.getState());
    expect(saved.builds[0]?.schemaVersion).toBe(1);
    expect(saved.live[0]?.data.hp).toBe(11);
    expect(saved.builds[0]?.data).not.toHaveProperty('maxHp');
    expect(saved).not.toHaveProperty('sheet');
    const loaded = deserializeWorkspace(saved);
    expect(loaded.characters).toEqual(store.getState().characters);
    expect(loaded.campaigns).toEqual(store.getState().campaigns);
    expect(loaded.automation).toBe('assisted');
    expect(loaded.characters[FOOL]?.events[0]?.undoneBy).toBe('undo');
  });

  it('restores command order independently from IndexedDB key order', () => {
    const saved = rows();
    saved.events.reverse();
    expect(deserializeWorkspace(saved).characters[FOOL]?.events.map(({ id }) => id)).toEqual([
      'damage',
      'heal',
    ]);
  });

  it('allows the same event id on different characters', () => {
    const other: ExportFile = structuredClone(seedFile);
    other.build.id = 'other-bard';
    other.live.characterId = other.build.id;
    const store = createCharacterStore([seedFile, other]);
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('shared-id'));
    store.getState().dispatch(other.build.id, heal, { amount: 2 }, metadata('shared-id'));
    const saved = serializeWorkspace(store.getState());
    expect(saved.events.map(({ characterId, id }) => [characterId, id])).toEqual([
      [FOOL, 'shared-id'],
      ['other-bard', 'shared-id'],
    ]);
    const loaded = deserializeWorkspace(saved);
    expect(loaded.characters[FOOL]?.live.hp).toBe(12);
    expect(loaded.characters['other-bard']?.live.hp).toBe(13);
  });

  it('preserves an intentionally empty workspace', () => {
    const empty = { characters: {}, campaigns: {}, automation: 'manual' as const };
    expect(deserializeWorkspace(serializeWorkspace(empty))).toEqual(empty);
  });

  it.each(['builds', 'live', 'events', 'campaigns'] as const)(
    'rejects unsupported %s versions without modifying input',
    (table) => {
      const saved = rows();
      const row = saved[table][0];
      if (!row) throw new Error('Saved test row missing');
      Object.assign(row, { schemaVersion: 999 });
      const before = structuredClone(saved);
      expect(() => deserializeWorkspace(saved)).toThrow(/Unsupported .* schema version 999/);
      expect(saved).toEqual(before);
    },
  );

  it('validates setting wrappers while preserving unknown setting data', () => {
    const custom = { id: 'custom-setting', schemaVersion: 1, data: { enabled: true } };
    expect(parseStoredRecord(custom, z.unknown(), 'setting')).toEqual(custom);
    expect(() =>
      parseStoredRecord({ ...custom, schemaVersion: 999 }, z.unknown(), 'setting'),
    ).toThrow('Unsupported setting schema version 999');
  });

  it('rejects orphaned or mismatched live state and event rows', () => {
    const orphaned = rows();
    const source = orphaned.live[0];
    if (!source) throw new Error('Saved live row missing');
    orphaned.live.push({
      ...source,
      id: 'missing',
      data: { ...source.data, characterId: 'missing' },
    });
    expect(() => deserializeWorkspace(orphaned)).toThrow('Saved live state has no character');

    const mismatched = rows();
    const event = mismatched.events[0];
    if (!event) throw new Error('Saved event missing');
    event.characterId = 'missing';
    expect(() => deserializeWorkspace(mismatched)).toThrow(
      'Saved event id does not match its record',
    );
  });

  it('rejects missing live state, event order gaps, and duplicate event ids', () => {
    const missing = rows();
    missing.live = [];
    expect(() => deserializeWorkspace(missing)).toThrow(
      `Character "${FOOL}" has no saved live state`,
    );

    const unordered = rows();
    const first = unordered.events[0];
    if (!first) throw new Error('Saved event missing');
    first.order = 5;
    expect(() => deserializeWorkspace(unordered)).toThrow('invalid event order');

    const store = createCharacterStore();
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('duplicate'));
    store.getState().dispatch(FOOL, heal, { amount: 1 }, metadata('duplicate'));
    expect(() => serializeWorkspace(store.getState())).toThrow('Duplicate saved event "duplicate"');
  });

  it('rejects structurally invalid game state before hydration', () => {
    const saved = rows();
    const live = saved.live[0];
    if (!live) throw new Error('Saved live row missing');
    live.data.hp = -1;
    expect(() => deserializeWorkspace(saved)).toThrow();
  });

  it.each(['invalid value', 'invalid path', 'invalid identity'] as const)(
    'rejects undo history with an %s without changing saved rows',
    (kind) => {
      const saved = rows();
      const event = saved.events.at(-1);
      if (!event) throw new Error('Saved event missing');
      event.data.inversePatches =
        kind === 'invalid value'
          ? [{ op: 'replace', path: ['live', 'hp'], value: -1 }]
          : kind === 'invalid path'
            ? [{ op: 'replace', path: ['live', 'missing', 'hp'], value: 11 }]
            : [{ op: 'replace', path: ['build', 'id'], value: 'other-character' }];
      const before = structuredClone(saved);
      expect(() => deserializeWorkspace(saved)).toThrow(
        `Saved undo history for "${FOOL}" is invalid`,
      );
      expect(saved).toEqual(before);
    },
  );

  it.each(['race', 'spell'] as const)('rejects unknown %s references before hydration', (kind) => {
    const saved = rows();
    const build = saved.builds[0]?.data;
    if (!build) throw new Error('Saved build missing');
    if (kind === 'race') build.raceId = 'race.missing';
    else build.spells.push({ classId: 'class.bard', known: ['spell.missing'] });
    expect(() => deserializeWorkspace(saved)).toThrow(`Unknown ${kind} ${kind}.missing`);
  });

  it.each(['campaign', 'whole state'] as const)(
    'rejects patches outside character data: %s',
    (kind) => {
      const saved = rows();
      const event = saved.events.at(-1);
      if (!event) throw new Error('Saved event missing');
      event.data.inversePatches =
        kind === 'campaign'
          ? [{ op: 'add', path: ['campaign'], value: seedFile.campaign }]
          : [{ op: 'replace', path: [], value: {} }];
      const before = structuredClone(saved);
      expect(() => deserializeWorkspace(saved)).toThrow('invalid patch root');
      expect(saved).toEqual(before);
    },
  );
});
