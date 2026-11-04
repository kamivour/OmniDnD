import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { buildRegistry } from '../../engine/registry';
import { levelUp } from '../../engine/commands/level';
import { seedState, Session, withLive } from '../../engine/commands/test-utils';
import type { CharacterState } from '../../engine/calc/sheet';
import { levelUpChanges, previewLevelUp } from './level-up-model';

const row = (rows: ReturnType<typeof levelUpChanges>, label: string) =>
  rows.find((entry) => entry.label === label);
const payloadFor = (state: CharacterState, roll = 5) => ({
  classId: 'class.bard',
  roll,
  expected: structuredClone(state),
});

function withClasses(classes: CharacterState['build']['classes']): CharacterState {
  const state = structuredClone(seedState);
  state.build.classes = classes;
  state.build.hpEntries = classes
    .flatMap((entry) => Array.from({ length: entry.level }, () => entry.classId))
    .map((classId, index) => ({
      level: index + 1,
      classId,
      value: index === 0 ? Number(registry.get('class', classId).hitDie.slice(1)) : 4,
      method: index === 0 ? 'max' : 'rolled',
    }));
  return state;
}

describe('level-up preview', () => {
  it('projects the exact command without writing state or history and explains changed capacities', () => {
    const session = new Session(structuredClone(seedState));
    const before = structuredClone({ state: session.state, events: session.events });
    const payload = payloadFor(session.state);
    const preview = previewLevelUp(session.state, registry, payload);
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect({ state: session.state, events: session.events }).toEqual(before);
    const changes = levelUpChanges(session.state, preview.next, registry, 'class.bard');
    for (const [label, oldValue, newValue] of [
      ['Recorded character level', '3', '4'],
      ['Bard class level', '3', '4'],
      ['Current HP', '11', '17'],
      ['Maximum HP', '19', '25'],
      ['d8 Hit Dice', '3 / 3', '4 / 4'],
      ['Level 2 spell slots', '2 / 2', '3 / 3'],
      ['Bard cantrip limit', '2', '3'],
      ['Bard known spells limit', '6', '7'],
    ])
      expect(row(changes, label!)).toMatchObject({ before: oldValue, after: newValue });
    session.run(levelUp, payload);
    expect(session.state).toEqual(preview.next);
    expect(session.events).toHaveLength(1);
    expect(session.events[0]?.id).not.toBe(preview.event.id);
    session.undo();
    expect(session.state).toEqual(before.state);
  });

  it('keeps Assisted warnings while deriving an average projection and respects Manual mode', () => {
    const state = structuredClone(seedState);
    const before = structuredClone(state);
    const payload = { classId: 'class.bard', expected: state };
    const assisted = previewLevelUp(state, registry, payload);
    const manual = previewLevelUp(state, registry, payload, 'manual');
    expect(assisted.result).toBe('ok');
    expect(assisted.warnings).toEqual(['Campaign uses rolled HP: taking the average']);
    expect(manual.result).toBe('ok');
    expect(manual.warnings).toEqual([]);
    if (assisted.result === 'ok' && manual.result === 'ok')
      expect(manual.next).toEqual(assisted.next);
    expect(state).toEqual(before);
  });

  it('returns blockers for an incomplete roll and a changed reviewed character without applying', () => {
    const state = structuredClone(seedState);
    const before = structuredClone(state);
    expect(previewLevelUp(state, registry, payloadFor(state, NaN)).result).toBe('blocked');
    const expected = structuredClone(state);
    state.live.hp = 7;
    expect(
      previewLevelUp(state, registry, { classId: 'class.bard', roll: 5, expected }).result,
    ).toBe('blocked');
    expect(state).toEqual({ ...before, live: { ...before.live, hp: 7 } });
  });

  it('unions multiclass pools and uses new maxima without restoring spending', () => {
    const state = withClasses([
      { classId: 'class.bard', level: 2, subclassId: 'subclass.bard.lore' },
      { classId: 'class.wizard', level: 2 },
      { classId: 'class.fighter', level: 1 },
    ]);
    state.live.hitDiceSpent = { d8: 1, d6: 1, d10: 1 };
    state.live.slotsUsed[2] = 1;
    const preview = previewLevelUp(state, registry, payloadFor(state, 2));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    const changes = levelUpChanges(state, preview.next, registry, 'class.bard');
    expect(row(changes, 'd8 Hit Dice')).toMatchObject({ before: '1 / 2', after: '2 / 3' });
    expect(row(changes, 'd6 Hit Dice')).toMatchObject({ before: '1 / 2', after: '1 / 2' });
    expect(row(changes, 'd10 Hit Dice')).toMatchObject({ before: '0 / 1', after: '0 / 1' });
    expect(row(changes, 'Level 3 spell slots')).toMatchObject({ before: '0 / 0', after: '2 / 2' });
    expect(preview.next.live.hitDiceSpent).toEqual(state.live.hitDiceSpent);
    expect(preview.next.live.slotsUsed).toEqual(state.live.slotsUsed);
    expect(preview.next.live.clock).toEqual(state.live.clock);
  });

  it('shows a newly granted limited pool using the after capacity and retained spending', () => {
    const bard = registry.get('class', 'class.bard');
    // Delay an existing test grant to exercise a new pool; production rules stay intact.
    const testRegistry = buildRegistry(
      [
        [...registry.entries.values()].map((entry) =>
          entry.id === bard.id
            ? {
                ...bard,
                features: [
                  ...bard.features.filter(
                    (feature) => feature.featureId !== 'feature.bard.bardic-inspiration',
                  ),
                  { level: 4, featureId: 'feature.bard.bardic-inspiration' },
                ],
              }
            : entry,
        ),
      ],
      [],
      [],
    );
    const state = structuredClone(seedState);
    const preview = previewLevelUp(state, testRegistry, payloadFor(state));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(
      row(
        levelUpChanges(state, preview.next, testRegistry, 'class.bard'),
        'Bardic Inspiration uses',
      ),
    ).toMatchObject({ before: '0 / 0', after: '3 / 5' });
    expect(preview.next.live.featureUsesSpent).toEqual(state.live.featureUsesSpent);
  });

  it('reports a Pact Magic level change even when its count stays the same', () => {
    const state = withClasses([{ classId: 'class.warlock', level: 2 }]);
    state.live.pactSlotsUsed = 1;
    const preview = previewLevelUp(state, registry, {
      classId: 'class.warlock',
      roll: 4,
      expected: state,
    });
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    expect(
      row(levelUpChanges(state, preview.next, registry, 'class.warlock'), 'Pact Magic slots'),
    ).toMatchObject({ before: '1 / 2 at level 1', after: '1 / 2 at level 2' });
  });

  it('shows the derived Inspiration die and recharge changes at Bard level five', () => {
    const state = withClasses([
      { classId: 'class.bard', level: 4, subclassId: 'subclass.bard.lore' },
    ]);
    const preview = previewLevelUp(state, registry, payloadFor(state));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    const changes = levelUpChanges(state, preview.next, registry, 'class.bard');
    expect(row(changes, 'Bardic Inspiration die')).toMatchObject({ before: 'd6', after: 'd8' });
    expect(row(changes, 'Bardic Inspiration recharge')).toMatchObject({
      before: 'Long rest',
      after: 'Short rest',
    });
    expect(preview.next.live.featureUsesSpent).toEqual(state.live.featureUsesSpent);
  });

  it('explains raw HP and the per-level floor before exhaustion changes the effective gain', () => {
    const state = structuredClone(seedState);
    state.campaign.hpLevelFloor = 'one';
    state.build.abilityScores.base.CON = 5;
    state.live.exhaustion = 4;
    state.live.hp = 1;
    const preview = previewLevelUp(state, registry, payloadFor(state, 1));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    const changes = levelUpChanges(state, preview.next, registry, 'class.bard');
    expect(row(changes, 'New HP entry')?.after).toContain(
      'roll 1 + CON (-2) = -1; minimum 1 gives 1 HP',
    );
    expect(row(changes, 'New HP entry')?.after).toContain('before maximum HP adjustments');
    expect(row(changes, 'Maximum HP')).toMatchObject({ before: '5', after: '5' });
  });

  it('preserves zero HP and annotates fixed maxima without suggesting recovery', () => {
    const state = withLive(structuredClone(seedState), {
      hp: 0,
      deathSaves: { success: 1, fail: 3 },
      hitDiceSpent: { d8: 1 },
    });
    state.build.overrides = [
      { path: '/maxHp', value: 30, note: 'Fixed ward' },
      { path: '/hitDice/d8/max', value: 5, note: 'Fixed dice' },
    ];
    const preview = previewLevelUp(state, registry, payloadFor(state));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    const changes = levelUpChanges(state, preview.next, registry, 'class.bard');
    expect(row(changes, 'Current HP')).toMatchObject({ before: '0', after: '0' });
    expect(row(changes, 'Maximum HP')).toMatchObject({
      before: '30',
      after: '30',
      afterNote: 'Fixed ward',
    });
    expect(row(changes, 'd8 Hit Dice')).toMatchObject({
      before: '4 / 5',
      after: '4 / 5',
      afterNote: 'Maximum: Fixed dice',
    });
    expect(preview.next.live.deathSaves).toEqual(state.live.deathSaves);
    expect(preview.next.live.hitDiceSpent).toEqual(state.live.hitDiceSpent);
  });

  it('marks a remaining correction only while its counter and capacity match', () => {
    const state = withLive(structuredClone(seedState), { hitDiceSpent: { d8: 1 } });
    state.build.overrides = [
      {
        path: '/hitDice/d8/remaining',
        value: { kind: 'remaining-correction', remaining: 2, spentBefore: 2, spent: 1, max: 3 },
        note: 'Corrected dice',
      },
    ];
    const before = structuredClone(state);
    const preview = previewLevelUp(state, registry, payloadFor(state));
    expect(preview.result).toBe('ok');
    if (preview.result !== 'ok') return;
    const change = row(levelUpChanges(state, preview.next, registry, 'class.bard'), 'd8 Hit Dice');
    expect(change).toMatchObject({
      before: '2 / 3',
      after: '3 / 4',
      beforeNote: 'Remaining: Corrected dice',
    });
    expect(change?.afterNote).toBeUndefined();
    expect(preview.next.build.overrides).toEqual(state.build.overrides);
    expect(preview.next.live.hitDiceSpent).toEqual(state.live.hitDiceSpent);
    expect(state).toEqual(before);
  });
});
