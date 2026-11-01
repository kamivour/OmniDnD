import { describe, expect, it } from 'vitest';
import { registry } from '../data/registry';
import { seedFile } from '../data/seed';
import { computeSheet } from '../engine/calc/sheet';
import { applyDamage, heal, setTempHp } from '../engine/commands/hp';
import { adjustSlot } from '../engine/commands/spells';
import type { ExportFile } from '../engine/schema';
import { characterState, createCharacterStore, type CharacterStore } from './character-store';

const FOOL = seedFile.build.id;
const TIME = '2026-11-02T00:00:00.000Z';
const event = (eventId: string) => ({ eventId, realTime: TIME });

function record(store: CharacterStore, id = FOOL) {
  const result = store.getState().characters[id];
  if (!result) throw new Error('Test character missing');
  return result;
}

function state(store: CharacterStore, id = FOOL) {
  const result = characterState(store.getState(), id);
  if (!result) throw new Error('Test state missing');
  return result;
}

describe('character command store', () => {
  it('starts from the real seed and derives sheet values without storing them', () => {
    const store = createCharacterStore();
    const current = state(store);
    expect(current.live.hp).toBe(11);
    expect(current.live.slotsUsed.slice(1, 3)).toEqual([4, 0]);
    expect(current.live.featureUsesSpent['feature.bard.bardic-inspiration']).toBe(2);
    expect(computeSheet(current, registry).maxHp.value).toBe(19);
    expect(current.campaign.leveling).toBe('milestone');
    expect(record(store)).not.toHaveProperty('sheet');
  });

  it('applies engine commands and keeps their log events with the same character', () => {
    const store = createCharacterStore();
    const before = record(store);
    const damage = store.getState().dispatch(FOOL, applyDamage, { amount: 3 }, event('damage'));
    expect(damage.result).toBe('ok');
    expect(record(store).live.hp).toBe(8);
    expect(before.live.hp).toBe(11);

    const slot = store.getState().dispatch(FOOL, adjustSlot, { level: 2, used: 1 }, event('slot'));
    expect(slot.result).toBe('ok');
    expect(record(store).live.slotsUsed[2]).toBe(1);
    expect(
      record(store).events.map(({ id, command, characterId, realTime }) => ({
        id,
        command,
        characterId,
        realTime,
      })),
    ).toEqual([
      { id: 'damage', command: 'applyDamage', characterId: FOOL, realTime: TIME },
      { id: 'slot', command: 'adjustSlot', characterId: FOOL, realTime: TIME },
    ]);
  });

  it('keeps warned changes out of the store until the player overrides', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, setTempHp, { amount: 10 }, event('temp'));
    const before = store.getState();
    const warning = store.getState().dispatch(FOOL, setTempHp, { amount: 5 }, event('cancelled'));
    expect(warning.result).toBe('warn');
    expect(store.getState()).toBe(before);
    expect(record(store).live.tempHp).toBe(10);

    const forced = store.getState().dispatch(
      FOOL,
      setTempHp,
      { amount: 5 },
      {
        ...event('override'),
        force: true,
      },
    );
    expect(forced.result).toBe('ok');
    expect(record(store).live.tempHp).toBe(5);
    expect(record(store).events.at(-1)).toMatchObject({ id: 'override', override: true });
  });

  it('never changes state or adds a log event for blocked commands', () => {
    const store = createCharacterStore();
    const before = store.getState();
    const result = store.getState().dispatch(
      FOOL,
      adjustSlot,
      { level: 1, used: -1 },
      {
        ...event('blocked'),
        force: true,
        automation: 'manual',
      },
    );
    expect(result.result).toBe('blocked');
    expect(store.getState()).toBe(before);
    expect(record(store).events).toEqual([]);
  });

  it('undo restores exact build and live state and marks the original event', () => {
    const store = createCharacterStore();
    const before = structuredClone(state(store));
    store.getState().dispatch(FOOL, applyDamage, { amount: 6 }, event('damage'));
    const result = store.getState().undo(FOOL, event('undo'));
    expect(result.result).toBe('ok');
    expect(state(store)).toEqual(before);
    expect(record(store).events).toMatchObject([
      { id: 'damage', undoneBy: 'undo' },
      { id: 'undo', command: 'undo' },
    ]);
    const after = store.getState();
    expect(store.getState().undo(FOOL, event('empty')).result).toBe('blocked');
    expect(store.getState()).toBe(after);
  });

  it('isolates character changes and store instances', () => {
    const second: ExportFile = structuredClone(seedFile);
    second.build.id = 'other-bard';
    second.live.characterId = second.build.id;
    const store = createCharacterStore([seedFile, second]);
    const other = record(store, second.build.id);
    store.getState().dispatch(FOOL, heal, { amount: 3 }, event('heal'));
    expect(record(store).live.hp).toBe(14);
    expect(record(store, second.build.id)).toBe(other);
    expect(other.live.hp).toBe(11);
    expect(other.events).toEqual([]);
    expect(record(createCharacterStore()).live.hp).toBe(11);
    expect(seedFile.live.hp).toBe(11);
  });

  it('joins current campaign rules instead of a stale character copy', () => {
    const store = createCharacterStore();
    const campaign = { ...seedFile.campaign, name: 'Updated campaign' };
    store.setState({ campaigns: { [campaign.id]: campaign } });
    expect(state(store).campaign).toBe(campaign);
    store.getState().dispatch(FOOL, heal, { amount: 1 }, event('heal'));
    expect(state(store).campaign).toBe(campaign);
  });

  it('uses the selected automation level unless this command overrides it', () => {
    const store = createCharacterStore();
    store.getState().dispatch(FOOL, setTempHp, { amount: 10 }, event('temp'));
    store.setState({ automation: 'manual' });
    expect(store.getState().dispatch(FOOL, setTempHp, { amount: 5 }, event('manual')).result).toBe(
      'ok',
    );
    expect(record(store).events.at(-1)?.override).toBeUndefined();
    const before = store.getState();
    expect(
      store.getState().dispatch(
        FOOL,
        setTempHp,
        { amount: 2 },
        {
          ...event('assisted'),
          automation: 'assisted',
        },
      ).result,
    ).toBe('warn');
    expect(store.getState()).toBe(before);
  });

  it('generates event metadata outside the pure engine', () => {
    const store = createCharacterStore();
    const started = Date.now();
    store.getState().dispatch(FOOL, heal, { amount: 1 });
    const saved = record(store).events.at(-1);
    expect(saved?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(saved?.realTime ?? '')).toBeGreaterThanOrEqual(started);
  });

  it('reports missing characters without changing the store', () => {
    const store = createCharacterStore();
    const before = store.getState();
    expect(characterState(before, 'missing')).toBeUndefined();
    expect(() => store.getState().dispatch('missing', heal, { amount: 1 })).toThrow(
      'Character "missing" not found',
    );
    expect(() => store.getState().undo('missing')).toThrow('Character "missing" not found');
    expect(store.getState()).toBe(before);
  });
});
