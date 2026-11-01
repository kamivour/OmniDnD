import { describe, expect, it } from 'vitest';
import { endTurn, startCombat, startTurn } from './combat';
import { adjustFeatureUses, useFeature } from './features';
import { freshState, seedState, Session, withLive } from './test-utils';

const BARDIC_INSPIRATION = 'feature.bard.bardic-inspiration';
const CUTTING_WORDS = 'feature.bard.cutting-words';

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
