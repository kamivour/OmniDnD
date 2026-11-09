import { describe, expect, it } from 'vitest';
import { seedFile } from '../data/seed';
import { serializeWorkspace, type Workspace } from '../db/database';
import { planSyncRecords, type SyncRecord } from '../db/sync-metadata';
import { applyDamage } from '../engine/commands/hp';
import { setInspiration } from '../engine/commands/inspiration';
import { deleteCharacter, duplicateCharacter } from '../engine/commands/management';
import { createCharacterStore } from '../state/character-store';
import { syncWorkspace, type ConflictChoice } from './engine';
import { MemoryCloud, MemoryProvider } from './memory-provider';

const FOOL = seedFile.build.id;
let clock = 0;
const tick = () => new Date(Date.UTC(2026, 10, 6, 10, 0, (clock += 1))).toISOString();

function snapshot(state: Workspace): Workspace {
  const {
    campaigns,
    characters,
    automation,
    reducedMotion,
    managementEvents,
    bookmarks,
    activityOrder,
  } = state;
  return {
    campaigns,
    characters,
    automation,
    reducedMotion,
    managementEvents,
    bookmarks,
    ...(activityOrder === undefined ? {} : { activityOrder }),
  };
}

/** One device: a store, its sync rows as the persistence layer keeps them, and a provider. */
async function device(cloud: MemoryCloud) {
  const store = createCharacterStore();
  const records = new Map<string, SyncRecord>();
  const save = () => {
    const changes = planSyncRecords(
      [...records].map(([id, data]) => ({ id, schemaVersion: 1 as const, data })),
      serializeWorkspace(store.getState()),
      tick(),
    );
    for (const { id, data } of changes) records.set(id, data);
    return changes;
  };
  save();
  const provider = new MemoryProvider(cloud);
  if ((await provider.signIn('friend@example.test', 'pw')).result !== 'ok')
    await provider.signUp('friend@example.test', 'pw');
  const sync = async (choices = new Map<string, ConflictChoice>()) => {
    save(); // the app flushes pending saves before syncing
    const outcome = await syncWorkspace(
      snapshot(store.getState()),
      [...records.values()],
      provider,
      choices,
    );
    for (const record of outcome.records) records.set(`${record.kind}:${record.entityId}`, record);
    store.setState(outcome.workspace);
    // Applying downloaded data must not look like a new local change.
    expect(save()).toEqual([]);
    return outcome;
  };
  const act = (id: string) => ({ eventId: id, realTime: tick() });
  return { store, records, provider, sync, act };
}

describe('two-way sync', () => {
  it('uploads a new device, then brings a second device up to date without conflicts', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    const first = await laptop.sync();
    expect(first.uploaded).toBe(2);
    expect(first.conflicts).toEqual([]);

    laptop.store.getState().dispatch(FOOL, applyDamage, { amount: 3 }, laptop.act('hit'));
    expect((await laptop.sync()).uploaded).toBe(1);

    const phone = await device(cloud);
    const pulled = await phone.sync();
    expect(pulled.conflicts).toEqual([]);
    expect(pulled.downloaded).toBe(1);
    expect(phone.store.getState().characters[FOOL]?.live).toEqual(
      laptop.store.getState().characters[FOOL]?.live,
    );
    expect(phone.store.getState().characters[FOOL]?.events.map(({ id }) => id)).toEqual(['hit']);

    const quiet = await phone.sync();
    expect([quiet.uploaded, quiet.downloaded, quiet.conflicts.length]).toEqual([0, 0, 0]);
  });

  it('carries new characters and deletions between devices', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    await laptop.sync();
    const phone = await device(cloud);
    await phone.sync();

    laptop.store
      .getState()
      .dispatchManagement(
        duplicateCharacter,
        { sourceId: FOOL, id: 'copy', name: 'Second Fool' },
        laptop.act('dup'),
      );
    laptop.store
      .getState()
      .dispatchManagement(deleteCharacter, { characterId: FOOL }, laptop.act('del'));
    expect((await laptop.sync()).uploaded).toBe(2);

    const pulled = await phone.sync();
    expect(pulled.downloaded).toBe(2);
    expect(Object.keys(phone.store.getState().characters)).toEqual(['copy']);
    expect(phone.records.get(`character:${FOOL}`)?.deleted).toBe(true);
  });

  it('asks instead of overwriting when both devices changed the same character', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    await laptop.sync();
    const phone = await device(cloud);
    await phone.sync();

    laptop.store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, laptop.act('laptop-hit'));
    await laptop.sync();
    phone.store.getState().dispatch(FOOL, applyDamage, { amount: 5 }, phone.act('phone-hit'));

    const clash = await phone.sync();
    expect(clash.conflicts.map(({ id, name }) => [id, name])).toEqual([
      [`character:${FOOL}`, seedFile.build.name],
    ]);
    expect(clash.uploaded + clash.downloaded).toBe(0);
    expect(phone.store.getState().characters[FOOL]?.events.at(-1)?.id).toBe('phone-hit');

    const kept = await phone.sync(new Map([[`character:${FOOL}`, 'this-device']]));
    expect(kept.uploaded).toBe(1);
    const back = await laptop.sync();
    expect(back.downloaded).toBe(1);
    expect(laptop.store.getState().characters[FOOL]?.events.at(-1)?.id).toBe('phone-hit');
  });

  it('merges edits to different fields on both devices without asking', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    await laptop.sync();
    const phone = await device(cloud);
    await phone.sync();

    laptop.store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, laptop.act('laptop-hit'));
    await laptop.sync();
    phone.store
      .getState()
      .dispatch(FOOL, setInspiration, { inspired: true }, phone.act('phone-inspired'));

    const merged = await phone.sync();
    expect(merged.conflicts).toEqual([]);
    expect([merged.uploaded, merged.downloaded]).toEqual([1, 1]);
    const character = phone.store.getState().characters[FOOL];
    expect(character?.live.inspiration).toBe(true);
    expect(character?.events.map(({ id }) => id)).toEqual(['phone-inspired', 'laptop-hit']);
    expect(character?.live.hp).toBe(laptop.store.getState().characters[FOOL]?.live.hp);

    await laptop.sync();
    expect(laptop.store.getState().characters[FOOL]?.live.inspiration).toBe(true);
    expect((await phone.sync()).conflicts).toEqual([]);
  });

  it('can settle a conflict by taking the cloud version', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    await laptop.sync();
    const phone = await device(cloud);
    await phone.sync();

    laptop.store.getState().dispatch(FOOL, applyDamage, { amount: 2 }, laptop.act('laptop-hit'));
    await laptop.sync();
    phone.store.getState().dispatch(FOOL, applyDamage, { amount: 5 }, phone.act('phone-hit'));

    const taken = await phone.sync(new Map([[`character:${FOOL}`, 'cloud']]));
    expect(taken.downloaded).toBe(1);
    expect(phone.store.getState().characters[FOOL]?.events.at(-1)?.id).toBe('laptop-hit');
    expect((await phone.sync()).conflicts).toEqual([]);
  });

  it('keeps each account separate', async () => {
    const cloud = new MemoryCloud();
    const mine = await device(cloud);
    await mine.sync();
    const other = new MemoryProvider(cloud);
    await other.signUp('someone-else@example.test', 'pw');
    expect(await other.pull()).toEqual([]);
  });

  it('leaves rows from a different app version alone', async () => {
    const cloud = new MemoryCloud();
    const laptop = await device(cloud);
    await laptop.sync();
    for (const row of cloud.rows.values()) row.schemaVersion = 99;
    laptop.store.getState().dispatch(FOOL, applyDamage, { amount: 1 }, laptop.act('hit'));
    const outcome = await laptop.sync();
    expect(outcome.skipped).toBe(2);
    expect(outcome.uploaded).toBe(0);
  });
});
