import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet } from '../calc/sheet';
import { buildRegistry } from '../registry';
import { endTurn, startCombat, startTurn } from './combat';
import { adjustFeatureUses, featureUseDetails, useFeature } from './features';
import { runCommand } from './runner';
import { freshState, seedState, Session, withLive } from './test-utils';

const BARDIC_INSPIRATION = 'feature.bard.bardic-inspiration';
const CUTTING_WORDS = 'feature.bard.cutting-words';

describe('featureUseDetails', () => {
  it('resolves the same shared pool, die and remaining uses that the command spends', () => {
    const session = new Session(seedState);
    const context = { live: session.live, sheet: session.sheet };
    const before = structuredClone(context);
    expect(featureUseDetails(context, CUTTING_WORDS)).toMatchObject({
      feature: { def: { id: CUTTING_WORDS } },
      pool: { def: { id: BARDIC_INSPIRATION } },
      poolId: BARDIC_INSPIRATION,
      uses: { max: 5, spent: 2, remaining: 3, recharge: 'long' },
      die: 'd6',
    });
    expect(featureUseDetails(context, CUTTING_WORDS).unavailableReason).toBeUndefined();
    expect(context).toEqual(before);
    expect(session.run(useFeature, { featureId: CUTTING_WORDS })).toBe(
      'Used Cutting Words (d6, Bardic Inspiration 2/5 left)',
    );
    expect(
      featureUseDetails({ live: session.live, sheet: session.sheet }, CUTTING_WORDS).uses,
    ).toEqual({ max: 5, spent: 3, remaining: 2, recharge: 'long' });
    session.undo();
    expect(session.state).toEqual(seedState);
  });

  it('also resolves direct resources and unlimited feature dice without inventing uses', () => {
    const session = new Session();
    const context = { live: session.live, sheet: session.sheet };
    expect(featureUseDetails(context, BARDIC_INSPIRATION)).toMatchObject({
      poolId: BARDIC_INSPIRATION,
      uses: { max: 5, spent: 0, remaining: 5, recharge: 'long' },
      die: 'd6',
    });
    const song = featureUseDetails(context, 'feature.bard.song-of-rest');
    expect(song.die).toBe('d6');
    expect(song.uses).toBeUndefined();
    expect(song.unavailableReason).toBeUndefined();
  });

  it('reports passive, missing and exhausted features without negative remaining counts', () => {
    const session = new Session(
      withLive(freshState, {
        featureUsesSpent: { [BARDIC_INSPIRATION]: 7 },
      }),
    );
    const context = { live: session.live, sheet: session.sheet };
    expect(featureUseDetails(context, CUTTING_WORDS)).toMatchObject({
      uses: { max: 5, spent: 7, remaining: 0, recharge: 'long' },
      unavailableReason: 'No Bardic Inspiration uses left',
    });
    expect(featureUseDetails(context, 'feature.bard.jack-of-all-trades').unavailableReason).toBe(
      'Jack of All Trades is passive',
    );
    expect(featureUseDetails(context, 'feature.bard.font-of-inspiration')).toEqual({
      poolId: 'feature.bard.font-of-inspiration',
      unavailableReason: 'You do not have this feature',
    });
  });

  it.each(['missing', 'without-uses'] as const)(
    'blocks a required shared resource pool that is %s even under force and Manual mode',
    (kind) => {
      const bard = registry.get('class', 'class.bard');
      const inspiration = { ...registry.get('feature', BARDIC_INSPIRATION) };
      delete inspiration.uses;
      const reference = buildRegistry(
        [
          [
            ...[...registry.entries.values()].map((entry) => {
              if (kind === 'missing' && entry.id === bard.id)
                return {
                  ...bard,
                  features: bard.features.filter((row) => row.featureId !== BARDIC_INSPIRATION),
                };
              if (kind === 'without-uses' && entry.id === BARDIC_INSPIRATION) return inspiration;
              return entry;
            }),
          ],
        ],
        [],
        [],
      );
      const before = structuredClone(freshState);
      const details = featureUseDetails(
        {
          live: freshState.live,
          sheet: computeSheet(freshState, reference),
        },
        CUTTING_WORDS,
      );
      expect(details.feature?.def.id).toBe(CUTTING_WORDS);
      expect(details.poolId).toBe(BARDIC_INSPIRATION);
      expect(details.uses).toBeUndefined();
      expect(details.unavailableReason).toBe(
        "Cutting Words's required resource pool is unavailable",
      );
      expect(
        runCommand(useFeature, freshState, { featureId: CUTTING_WORDS }, reference, {
          eventId: `invalid-pool-${kind}`,
          realTime: '2026-11-03T03:00:00.000Z',
          automation: 'manual',
          force: true,
        }),
      ).toEqual({
        result: 'blocked',
        reasons: ["Cutting Words's required resource pool is unavailable"],
      });
      expect(freshState).toEqual(before);
    },
  );

  it.each([BARDIC_INSPIRATION, CUTTING_WORDS])(
    'blocks dead-character Use for %s but permits an undoable manual resource correction',
    (featureId) => {
      const state = withLive(freshState, {
        hp: 0,
        deathSaves: { success: 0, fail: 3 },
        conditions: [],
        featureUsesSpent: { [BARDIC_INSPIRATION]: 2 },
      });
      const before = structuredClone(state);
      const details = featureUseDetails(
        { live: state.live, sheet: computeSheet(state, registry) },
        featureId,
      );
      expect(details.unavailableReason).toBe('You are dead');
      expect(details.uses).toMatchObject({ max: 5, spent: 2, remaining: 3 });
      for (const automation of ['assisted', 'manual'] as const) {
        expect(
          runCommand(useFeature, state, { featureId }, registry, {
            eventId: 'dead-feature',
            realTime: '2026-11-03T03:00:00.000Z',
            force: true,
            automation,
          }),
        ).toEqual({ result: 'blocked', reasons: ['You are dead'] });
      }
      expect(state).toEqual(before);
      const session = new Session(state);
      session.run(adjustFeatureUses, { featureId, spent: 0 });
      expect(session.state.live.featureUsesSpent).toEqual({});
      expect(session.state.live.hp).toBe(0);
      expect(session.state.live.deathSaves).toEqual(before.live.deathSaves);
      expect(
        featureUseDetails({ live: session.live, sheet: session.sheet }, featureId)
          .unavailableReason,
      ).toBe('You are dead');
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('keeps exhaustion blocked under Manual and still permits a logged correction to restore uses', () => {
    const state = withLive(freshState, { featureUsesSpent: { [BARDIC_INSPIRATION]: 5 } });
    expect(
      runCommand(useFeature, state, { featureId: CUTTING_WORDS }, registry, {
        eventId: 'empty-pool',
        realTime: '2026-11-03T03:00:00.000Z',
        automation: 'manual',
        force: true,
      }),
    ).toEqual({ result: 'blocked', reasons: ['No Bardic Inspiration uses left'] });
    const session = new Session(state);
    session.run(adjustFeatureUses, { featureId: CUTTING_WORDS, spent: 0 });
    expect(
      featureUseDetails({ live: session.live, sheet: session.sheet }, CUTTING_WORDS).uses
        ?.remaining,
    ).toBe(5);
    session.undo();
    expect(session.state).toEqual(state);
  });
});

describe('useFeature', () => {
  it('spends a use and shows the die', () => {
    const session = new Session();
    expect(session.run(useFeature, { featureId: BARDIC_INSPIRATION })).toBe(
      'Used Bardic Inspiration (d6, 4/5 left)',
    );
    expect(session.live.featureUsesSpent).toEqual({ [BARDIC_INSPIRATION]: 1 });
  });

  it('Cutting Words spends Bardic Inspiration and your reaction', () => {
    const session = new Session();
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(endTurn, null);
    expect(session.run(useFeature, { featureId: CUTTING_WORDS })).toBe(
      'Used Cutting Words (d6, Bardic Inspiration 4/5 left)',
    );
    expect(session.live.combat?.economy.reactionUsed).toBe(true);
    const second = session.try(useFeature, { featureId: CUTTING_WORDS });
    expect(second).toEqual({ result: 'warn', reasons: ['Reaction already used'] });
    expect(session.live.featureUsesSpent).toEqual({ [BARDIC_INSPIRATION]: 1 });
    session.run(useFeature, { featureId: CUTTING_WORDS }, true);
    expect(session.events.at(-1)?.override).toBe(true);
    expect(session.live.featureUsesSpent).toEqual({ [BARDIC_INSPIRATION]: 2 });
  });

  it('blocks when no uses are left, for passive features and features you lack', () => {
    const session = new Session(
      withLive(freshState, { featureUsesSpent: { [BARDIC_INSPIRATION]: 5 } }),
    );
    expect(session.preview(useFeature, { featureId: CUTTING_WORDS }).reasons).toEqual([
      'No Bardic Inspiration uses left',
    ]);
    expect(
      session.preview(useFeature, { featureId: 'feature.bard.jack-of-all-trades' }).reasons,
    ).toEqual(['Jack of All Trades is passive']);
    expect(
      session.preview(useFeature, { featureId: 'feature.bard.font-of-inspiration' }).reasons,
    ).toEqual(["You don't have Font of Inspiration"]);
  });
});

describe('adjustFeatureUses', () => {
  it('sets spent uses of the pool', () => {
    const session = new Session(seedState);
    expect(session.run(adjustFeatureUses, { featureId: BARDIC_INSPIRATION, spent: 0 })).toBe(
      'Bardic Inspiration: 5/5 left',
    );
    expect(session.live.featureUsesSpent).toEqual({});
    expect(session.run(adjustFeatureUses, { featureId: CUTTING_WORDS, spent: 4 })).toBe(
      'Bardic Inspiration: 1/5 left',
    );
  });

  it('blocks features without uses and out-of-range counts', () => {
    const session = new Session();
    expect(
      session.preview(adjustFeatureUses, { featureId: 'feature.bard.jack-of-all-trades', spent: 1 })
        .reasons,
    ).toEqual(['Jack of All Trades has no limited uses']);
    expect(
      session.preview(adjustFeatureUses, { featureId: BARDIC_INSPIRATION, spent: 6 }).reasons,
    ).toEqual(['Spent uses must be a whole number from 0 to 5']);
  });
});
