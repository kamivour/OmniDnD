import { describe, expect, it } from 'vitest';
import { endCombat, endTurn, startCombat, startTurn, useEconomy } from './combat';
import { useFeature } from './features';
import { applyDamage, concentrationSaveDc, resolveConcentrationSave } from './hp';
import { completeLongRest, completeShortRest } from './rest';
import { adjustSlot, castSpell } from './spells';
import { advanceTime } from './time';
import { freshState, seedState, Session } from './test-utils';

/** TEST_CHARACTER §6, engine side. Steps run in order on one session. */

const FAERIE_FIRE = 'spell.faerie-fire';
const INVISIBILITY = 'spell.invisibility';
const HEALING_WORD = 'spell.healing-word';
const DISSONANT_WHISPERS = 'spell.dissonant-whispers';
const VICIOUS_MOCKERY = 'spell.vicious-mockery';
const BARDIC_INSPIRATION = 'feature.bard.bardic-inspiration';
const CUTTING_WORDS = 'feature.bard.cutting-words';
const HOUR = 3600;

describe('acceptance scenario (TEST_CHARACTER §6)', () => {
  const session = new Session(freshState);
  const start = freshState.live.clock.seconds;
  const slotsLeft = (level: number) =>
    (session.sheet.slots.max[level] ?? 0) - (session.live.slotsUsed[level] ?? 0);
  const inspirationLeft = () => 5 - (session.live.featureUsesSpent[BARDIC_INSPIRATION] ?? 0);
  const hitDiceLeft = () => 3 - (session.live.hitDiceSpent.d8 ?? 0);
  const economy = () => session.live.combat?.economy;
  let beforeLastRest = session.state;

  it('starts fresh: HP 19/19, all slots, Day 1 08:00, no long rest yet', () => {
    expect(session.live.hp).toBe(19);
    expect(session.sheet.maxHp.value).toBe(19);
    expect([slotsLeft(1), slotsLeft(2), inspirationLeft(), hitDiceLeft()]).toEqual([4, 2, 5, 3]);
    expect(start).toBe(8 * HOUR);
    expect(session.live.lastLongRestEnd).toBeUndefined();
  });

  it('1. start combat, start your turn', () => {
    session.run(startCombat, null);
    expect(session.run(startTurn, null)).toBe('Round 1: your turn');
  });

  it('2. Faerie Fire: L1 4 → 3, action used, concentration only (D41)', () => {
    expect(session.run(castSpell, { spellId: FAERIE_FIRE, slotLevel: 1 })).toBe(
      'Cast Faerie Fire (L1 slot)',
    );
    expect(slotsLeft(1)).toBe(3);
    expect(economy()?.actionUsed).toBe(true);
    expect(session.live.concentration).toMatchObject({ spellId: FAERIE_FIRE, endsAt: start + 60 });
    expect(session.live.effects).toEqual([]);
  });

  it('3. next turn, Invisibility on an ally: L2 2 → 1, concentration swaps', () => {
    session.run(endTurn, null);
    expect(session.run(startTurn, null)).toBe('Round 2: your turn');
    expect(session.run(castSpell, { spellId: INVISIBILITY, slotLevel: 2 })).toBe(
      'Cast Invisibility (L2 slot); concentration on Faerie Fire ended',
    );
    expect(slotsLeft(2)).toBe(1);
    expect(session.live.concentration?.spellId).toBe(INVISIBILITY);
    expect(session.events.map((event) => event.text)).toEqual(
      expect.arrayContaining([
        'Cast Faerie Fire (L1 slot)',
        'Cast Invisibility (L2 slot); concentration on Faerie Fire ended',
      ]),
    );
  });

  it("4. on an enemy's turn, Cutting Words: Bardic Inspiration 5 → 4, reaction used", () => {
    session.run(endTurn, null);
    session.run(useFeature, { featureId: CUTTING_WORDS });
    expect(inspirationLeft()).toBe(4);
    expect(economy()?.reactionUsed).toBe(true);
  });

  it('5. a second reaction warns; cancel changes nothing; "Do anyway" logs an override', () => {
    const before = session.state;
    const attack = { kind: 'reaction' as const, label: 'Opportunity Attack' };
    expect(session.try(useEconomy, attack)).toEqual({
      result: 'warn',
      reasons: ['Reaction already used'],
    });
    expect(session.state).toBe(before);
    expect(session.run(useEconomy, attack, true)).toBe('Reaction: Opportunity Attack');
    expect(session.events.at(-1)?.override).toBe(true);
  });

  it('6. start your turn: reaction available again', () => {
    session.run(startTurn, null);
    expect(economy()?.reactionUsed).toBe(false);
  });

  it('7. 12 damage while concentrating: HP 19 → 7, save DC 10, pass keeps Invisibility', () => {
    expect(session.preview(applyDamage, { amount: 12 })).toEqual({
      result: 'ok',
      reasons: ['Concentration save DC 10 (Invisibility)'],
    });
    expect(session.run(applyDamage, { amount: 12 })).toBe('Took 12 damage (HP 19 → 7)');
    session.run(resolveConcentrationSave, {
      saveId: session.live.concentration!.pendingSaves![0]!.id,
      outcome: 'pass',
    });
    expect(session.live.concentration?.spellId).toBe(INVISIBILITY);
    expect(session.live.concentration?.pendingSaves).toBeUndefined();
  });

  it('8. bonus-action spell rule: Healing Word, then Dissonant Whispers warns, Vicious Mockery is fine', () => {
    expect(session.run(castSpell, { spellId: HEALING_WORD, slotLevel: 1, healRoll: 1 })).toBe(
      'Cast Healing Word (L1 slot); healed 6 (HP 7 → 13)',
    );
    expect(slotsLeft(1)).toBe(2);
    expect(session.preview(castSpell, { spellId: DISSONANT_WHISPERS, slotLevel: 1 })).toEqual({
      result: 'warn',
      reasons: [
        'Bonus-action spell rule: only a 1-action cantrip can share a turn with a bonus-action spell',
      ],
    });
    expect(session.try(castSpell, { spellId: VICIOUS_MOCKERY }).result).toBe('ok');
  });

  it('9. end combat, 1 h later Invisibility ends; short rest heals 13 → 18', () => {
    expect(session.run(endCombat, null)).toBe('Combat ended after 3 rounds (18 s)');
    expect(session.run(advanceTime, { seconds: HOUR })).toContain('Invisibility ended');
    expect(session.live.concentration).toBeUndefined();
    expect(
      session.run(completeShortRest, { hitDice: [{ die: 'd8', roll: 2 }], songOfRest: 2 }),
    ).toBe('Short rest (1 h); 1 Hit Die + Song of Rest: HP 13 → 18');
    expect(hitDiceLeft()).toBe(2);
    expect([inspirationLeft(), slotsLeft(1), slotsLeft(2)]).toEqual([4, 2, 1]);
  });

  it('10. long rest: HP 18 → 19, slots, Bardic Inspiration and Hit Dice back, clock +8 h', () => {
    const clock = session.live.clock.seconds;
    expect(session.preview(completeLongRest, null)).toEqual({ result: 'ok', reasons: [] });
    expect(session.run(completeLongRest, null)).toBe(
      'Long rest (8 h); HP 18 → 19; restored spell slots, Bardic Inspiration; 1 Hit Die back',
    );
    expect(session.live.hp).toBe(19);
    expect([slotsLeft(1), slotsLeft(2), inspirationLeft(), hitDiceLeft()]).toEqual([4, 2, 5, 3]);
    expect(session.live.clock.seconds).toBe(clock + 8 * HOUR);
  });

  it('11. a second long rest right away warns', () => {
    expect(session.preview(completeLongRest, null)).toEqual({
      result: 'warn',
      reasons: ['Less than 24 h since last long rest'],
    });
  });

  it('12. Hit Dice cap: spend all 3, rest 24 h later, only 1 comes back', () => {
    const lastRest = session.live.lastLongRestEnd ?? 0;
    session.run(applyDamage, { amount: 15 });
    session.run(completeShortRest, {
      hitDice: [
        { die: 'd8', roll: 1 },
        { die: 'd8', roll: 1 },
        { die: 'd8', roll: 1 },
      ],
    });
    expect(hitDiceLeft()).toBe(0);
    session.run(advanceTime, { seconds: lastRest + 24 * HOUR - session.live.clock.seconds });
    beforeLastRest = session.state;
    expect(session.run(completeLongRest, null)).toContain('1 Hit Die back');
    expect(hitDiceLeft()).toBe(1);
  });

  it('13. undo the last long rest: exact previous state', () => {
    expect(session.undo()).toContain('Undo');
    expect(session.state).toEqual(beforeLastRest);
    expect([session.live.hp, hitDiceLeft(), slotsLeft(1)]).toEqual([10, 0, 4]);
  });

  it('14. manual slot correction is logged, undoable, and changes nothing else', () => {
    const before = session.state;
    expect(session.run(adjustSlot, { level: 1, used: 2 })).toBe('L1 slots: 2/4 left');
    expect(session.state.live).toEqual({
      ...before.live,
      slotsUsed: before.live.slotsUsed.map((used, level) => (level === 1 ? 2 : used)),
    });
    expect(session.state.build).toBe(before.build);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('15. concentration DC: 22 damage is DC 11, 8 damage is DC 10', () => {
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(8)).toBe(10);
  });

  it('16. seed state: HP 11/19, L1 0/4, L2 2/2, Bardic Inspiration 3/5; Healing Word only at L2', () => {
    const seed = new Session(seedState);
    const { sheet, live } = seed;
    const left = (level: number) => (sheet.slots.max[level] ?? 0) - (live.slotsUsed[level] ?? 0);
    expect([live.hp, sheet.maxHp.value, left(1), left(2)]).toEqual([11, 19, 0, 2]);
    expect(5 - (live.featureUsesSpent[BARDIC_INSPIRATION] ?? 0)).toBe(3);
    expect(seed.preview(castSpell, { spellId: HEALING_WORD, slotLevel: 1 })).toEqual({
      result: 'blocked',
      reasons: ['No level 1 slots left'],
    });
    // Upcast at L2: 2d4 + 5, so the dice total is 2–8.
    expect(
      seed.preview(castSpell, { spellId: HEALING_WORD, slotLevel: 2, healRoll: 9 }).reasons,
    ).toEqual(['Healing roll must be a whole number from 2 to 8']);
  });
});
