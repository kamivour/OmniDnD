import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { PreferencesSchema, type Preferences } from '../schema';
import { setTempHp } from './hp';
import {
  createCampaign,
  ManagementEventSchema,
  runManagement,
  undoManagement,
  validateManagementData,
  type ManagementData,
} from './management';
import { updatePreferences } from './preferences';
import { runCommand } from './runner';

const metadata = (eventId = 'm1') => ({ eventId, realTime: '2026-11-02T10:00:00.000Z' });
const defaults: Preferences = { automation: 'assisted', reducedMotion: false };

function workspace(): ManagementData {
  const file = structuredClone(seedFile);
  return {
    campaigns: { [file.campaign.id]: file.campaign },
    characters: { [file.build.id]: { build: file.build, live: file.live, events: file.events } },
    bookmarks: [{ id: 'rules', title: 'Rules', url: 'https://example.com/2014' }],
    ...defaults,
  };
}

function update(state: ManagementData, preferences: Preferences, eventId = 'm1') {
  const result = runManagement(updatePreferences, state, preferences, registry, metadata(eventId));
  if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
  return result;
}

describe('updatePreferences', () => {
  it('changes workspace preferences, logs them, and undoes the pair without changing character data', () => {
    const initial = workspace();
    const before = structuredClone(initial);
    const payload: Preferences = { automation: 'manual', reducedMotion: true };
    const { next, event, reasons } = update(initial, payload);
    expect(next.automation).toBe('manual');
    expect(next.reducedMotion).toBe(true);
    expect(next.characters).toBe(initial.characters);
    expect(next.campaigns).toBe(initial.campaigns);
    expect(next.bookmarks).toBe(initial.bookmarks);
    expect(initial).toEqual(before);
    expect(payload).toEqual({ automation: 'manual', reducedMotion: true });
    expect(reasons).toEqual([]);
    expect(event).toMatchObject({
      command: 'updatePreferences',
      text: 'Settings: Manual · reduced motion on',
    });
    expect(ManagementEventSchema.parse(event)).toEqual(event);
    expect(event.patches.map(({ path }) => path)).toEqual([['automation'], ['reducedMotion']]);
    expect(event.override).toBeUndefined();
    const undone = undoManagement(next, [event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(before);
    expect(undone.events[0]!.undoneBy).toBe('u1');
  });

  it('restores the previous choice through multiple preference changes and Undo', () => {
    const initial = workspace();
    const manual = update(initial, { automation: 'manual', reducedMotion: false }, 'manual');
    const reduced = update(manual.next, { automation: 'assisted', reducedMotion: true }, 'reduce');
    const undone = undoManagement(
      reduced.next,
      [manual.event, reduced.event],
      registry,
      metadata('u1'),
    );
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(manual.next);
    const again = undoManagement(undone.next, undone.events, registry, metadata('u2'));
    if (again.result !== 'ok') throw new Error(again.reasons.join());
    expect(again.next).toEqual(initial);
  });

  it('preserves later character changes when undoing preferences', () => {
    const changed = update(workspace(), { automation: 'manual', reducedMotion: true });
    const later = structuredClone(changed.next);
    later.characters[seedFile.build.id]!.live.hp = 5;
    const undone = undoManagement(later, [changed.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next.characters).toBe(later.characters);
    expect(undone.next.characters[seedFile.build.id]!.live.hp).toBe(5);
    expect(undone.next.automation).toBe('assisted');
    expect(undone.next.reducedMotion).toBe(false);
    expect(undone.event.override).toBeUndefined();
  });

  it.each([{}, { automation: 'manual' as const }, { reducedMotion: true }])(
    'preserves the exact legacy shape through unrelated commands and preference Undo (%j)',
    (legacy) => {
      const initial: ManagementData = { campaigns: {}, characters: {}, ...legacy };
      const before = structuredClone(initial);
      const created = runManagement(
        createCampaign,
        initial,
        { campaign: seedFile.campaign },
        registry,
        metadata(),
      );
      if (created.result !== 'ok') throw new Error(created.reasons.join());
      expect(Object.hasOwn(created.next, 'automation')).toBe(Object.hasOwn(initial, 'automation'));
      expect(Object.hasOwn(created.next, 'reducedMotion')).toBe(
        Object.hasOwn(initial, 'reducedMotion'),
      );
      const uncreate = undoManagement(created.next, [created.event], registry, metadata('u1'));
      if (uncreate.result !== 'ok') throw new Error(uncreate.reasons.join());
      expect(uncreate.next).toEqual(before);

      const changed = update(initial, { automation: 'manual', reducedMotion: true });
      const undone = undoManagement(changed.next, [changed.event], registry, metadata('u2'));
      if (undone.result !== 'ok') throw new Error(undone.reasons.join());
      expect(undone.next).toEqual(before);
      expect(initial).toEqual(before);
    },
  );

  it('preserves saved preferences through unrelated management commands and Undo', () => {
    const initial = workspace();
    const created = runManagement(
      createCampaign,
      initial,
      { campaign: { ...seedFile.campaign, id: 'another-campaign' } },
      registry,
      metadata(),
    );
    if (created.result !== 'ok') throw new Error(created.reasons.join());
    expect(created.next.automation).toBe(initial.automation);
    expect(created.next.reducedMotion).toBe(initial.reducedMotion);
    const undone = undoManagement(created.next, [created.event], registry, metadata('u1'));
    if (undone.result !== 'ok') throw new Error(undone.reasons.join());
    expect(undone.next).toEqual(initial);
  });

  it.each([
    null,
    [],
    {},
    { automation: 'manual' },
    { reducedMotion: false },
    { automation: 'automatic', reducedMotion: true },
    { automation: false, reducedMotion: true },
    { automation: 'assisted', reducedMotion: 'true' },
    { automation: 'assisted', reducedMotion: 1 },
    { automation: 'manual', reducedMotion: null },
    { ...defaults, extra: true },
    { ...defaults, theme: 'parchment' },
    { ...defaults, characters: {} },
  ])('blocks malformed payloads without mutation even when forced (%j)', (payload) => {
    const initial = workspace();
    const before = structuredClone(initial);
    expect(PreferencesSchema.safeParse(payload).success).toBe(false);
    const result = runManagement(updatePreferences, initial, payload as Preferences, registry, {
      ...metadata(),
      force: true,
    });
    expect(result.result).toBe('blocked');
    expect(initial).toEqual(before);
  });

  it('validates any present preference without inventing defaults for legacy callers', () => {
    const empty: ManagementData = { campaigns: {}, characters: {} };
    expect(() => validateManagementData(empty, registry)).not.toThrow();
    expect(() => validateManagementData({ ...empty, ...defaults }, registry)).not.toThrow();
    for (const preference of [
      { automation: undefined },
      { automation: 'automatic' },
      { reducedMotion: undefined },
      { reducedMotion: 'false' },
    ]) {
      expect(() =>
        validateManagementData({ ...empty, ...preference } as ManagementData, registry),
      ).toThrow();
    }
    expect(empty).toEqual({ campaigns: {}, characters: {} });
  });

  it('blocks a tampered Undo that would restore an invalid preference', () => {
    const changed = update(workspace(), { automation: 'manual', reducedMotion: true });
    const invalid = {
      ...changed.event,
      inversePatches: [{ op: 'replace' as const, path: ['reducedMotion'], value: 'false' }],
    };
    const before = structuredClone(changed.next);
    expect(undoManagement(changed.next, [invalid], registry, metadata('u1'), true).result).toBe(
      'blocked',
    );
    expect(changed.next).toEqual(before);
  });

  it('uses Manual to bypass rule warnings while keeping impossible values blocked', () => {
    const initial = workspace();
    initial.characters[seedFile.build.id]!.live.tempHp = 10;
    const manual = update(initial, { automation: 'manual', reducedMotion: false });
    const record = manual.next.characters[seedFile.build.id]!;
    const state = { campaign: manual.next.campaigns[seedFile.campaign.id]!, ...record };
    expect(
      runCommand(setTempHp, state, { amount: 5 }, registry, {
        ...metadata('c1'),
        automation: initial.automation,
      }).result,
    ).toBe('warn');
    const result = runCommand(setTempHp, state, { amount: 5 }, registry, {
      ...metadata('c1'),
      automation: manual.next.automation,
    });
    expect(result.result).toBe('ok');
    if (result.result !== 'ok') throw new Error(result.reasons.join());
    expect(result.next.live.tempHp).toBe(5);
    expect(result.event.override).toBeUndefined();
    expect(
      runCommand(setTempHp, state, { amount: -1 }, registry, {
        ...metadata('c2'),
        automation: manual.next.automation,
        force: true,
      }).result,
    ).toBe('blocked');
    expect(state.live.tempHp).toBe(10);
  });
});
