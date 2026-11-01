import { describe, expect, it } from 'vitest';
import { startCombat, startTurn, endTurn } from './combat';
import { applyDamage } from './hp';
import { adjustSlot, castSpell, endConcentration } from './spells';
import { freshState, seedState, Session, withLive } from './test-utils';

const FAERIE_FIRE = 'spell.faerie-fire';
const INVISIBILITY = 'spell.invisibility';
const HEALING_WORD = 'spell.healing-word';
const DISGUISE_SELF = 'spell.disguise-self';
const VICIOUS_MOCKERY = 'spell.vicious-mockery';
const DISSONANT_WHISPERS = 'spell.dissonant-whispers';

function inTurn(state = freshState) {
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  return session;
}

describe('castSpell', () => {
  it('spends the slot and starts concentration without an effect on you (D41)', () => {
    const session = new Session();
    expect(session.run(castSpell, { spellId: FAERIE_FIRE, slotLevel: 1 })).toBe(
      'Cast Faerie Fire (L1 slot)',
    );
    expect(session.live.slotsUsed[1]).toBe(1);
    expect(session.live.concentration).toEqual({
      spellId: FAERIE_FIRE,
      slotLevel: 1,
      endsAt: freshState.live.clock.seconds + 60,
    });
    expect(session.live.effects).toEqual([]);
  });

  it('casting a second concentration spell ends the first', () => {
    const session = new Session();
    session.run(castSpell, { spellId: FAERIE_FIRE, slotLevel: 1 });
    expect(session.preview(castSpell, { spellId: INVISIBILITY, slotLevel: 2 })).toEqual({
      result: 'ok',
      reasons: ['Ends concentration on Faerie Fire'],
    });
    expect(session.run(castSpell, { spellId: INVISIBILITY, slotLevel: 2 })).toBe(
      'Cast Invisibility (L2 slot); concentration on Faerie Fire ended',
    );
    expect(session.live.concentration?.spellId).toBe(INVISIBILITY);
  });

  it('puts a self-target effect on you and links it to concentration', () => {
    const session = new Session();
    session.run(castSpell, { spellId: INVISIBILITY, slotLevel: 2, onSelf: true });
    expect(session.live.effects).toMatchObject([
      { id: INVISIBILITY, name: 'Invisibility', concentration: true, conditions: ['invisible'] },
    ]);
    expect(session.live.concentration?.effectId).toBe(INVISIBILITY);
    session.run(endConcentration, null);
    expect(session.live.effects).toEqual([]);
    expect(session.live.concentration).toBeUndefined();
  });

  it('Disguise Self always lands on you, without concentration', () => {
    const session = new Session();
    expect(session.run(castSpell, { spellId: DISGUISE_SELF, slotLevel: 1 })).toBe(
      'Cast Disguise Self (L1 slot); Disguise Self on you',
    );
    expect(session.live.effects).toMatchObject([{ id: DISGUISE_SELF, concentration: false }]);
    expect(session.live.concentration).toBeUndefined();
  });

  it('blocks a spent slot level and an effect target for a spell without one', () => {
    const session = new Session(seedState);
    expect(session.preview(castSpell, { spellId: FAERIE_FIRE, slotLevel: 1 })).toEqual({
      result: 'blocked',
      reasons: ['No level 1 slots left'],
    });
    expect(session.preview(castSpell, { spellId: VICIOUS_MOCKERY, onSelf: true })).toMatchObject({
      result: 'blocked',
      reasons: ['Vicious Mockery puts no effect on a target'],
    });
    expect(session.preview(castSpell, { spellId: FAERIE_FIRE })).toMatchObject({
      result: 'blocked',
      reasons: ['Choose a slot level'],
    });
  });

  it('a cantrip uses no slot', () => {
    const session = new Session();
    expect(session.run(castSpell, { spellId: VICIOUS_MOCKERY })).toBe('Cast Vicious Mockery');
    expect(session.live.slotsUsed).toEqual(freshState.live.slotsUsed);
  });

  it('heals yourself with roll + spellcasting modifier, upcast range checked', () => {
    // Seed: HP 11/19, only L2 slots left. Healing Word at L2 rolls 2d4 + CHA 5.
    const session = new Session(seedState);
    expect(
      session.preview(castSpell, { spellId: HEALING_WORD, slotLevel: 2, healRoll: 9 }),
    ).toMatchObject({
      result: 'blocked',
      reasons: ['Healing roll must be a whole number from 2 to 8'],
    });
    expect(session.run(castSpell, { spellId: HEALING_WORD, slotLevel: 2, healRoll: 2 })).toBe(
      'Cast Healing Word (L2 slot); healed 7 (HP 11 → 18)',
    );
    expect(session.live.slotsUsed[2]).toBe(1);
  });

  it('warns for a spell you do not know', () => {
    const session = new Session();
    expect(session.preview(castSpell, { spellId: 'spell.cure-wounds', slotLevel: 1 })).toEqual({
      result: 'warn',
      reasons: ["You don't know Cure Wounds"],
    });
  });

  it('a ritual takes 10 minutes longer and uses no slot; only rituals can be', () => {
    const session = new Session();
    expect(session.preview(castSpell, { spellId: FAERIE_FIRE, ritual: true })).toMatchObject({
      result: 'blocked',
      reasons: ['Faerie Fire is not a ritual'],
    });
    // Comprehend Languages is not on The Fool's list: "Do anyway".
    const ritual = { spellId: 'spell.comprehend-languages', ritual: true };
    expect(session.run(castSpell, ritual, true)).toBe('Cast Comprehend Languages (ritual)');
    expect(session.live.clock.seconds).toBe(freshState.live.clock.seconds + 600);
    expect(session.live.slotsUsed).toEqual(freshState.live.slotsUsed);
    expect(session.events.at(-1)?.override).toBe(true);
  });

  it('in combat, a spell longer than one action warns', () => {
    const session = inTurn();
    expect(
      session.preview(castSpell, { spellId: 'spell.comprehend-languages', ritual: true }),
    ).toMatchObject({
      result: 'warn',
      reasons: [
        "You don't know Comprehend Languages",
        'Comprehend Languages takes longer than a turn to cast',
      ],
    });
  });

  it('enforces the action economy and the bonus-action spell rule in your turn', () => {
    const session = inTurn();
    session.run(castSpell, { spellId: HEALING_WORD, slotLevel: 1, healRoll: 1 });
    expect(session.live.combat?.economy.bonusUsed).toBe(true);
    expect(session.preview(castSpell, { spellId: DISSONANT_WHISPERS, slotLevel: 1 })).toEqual({
      result: 'warn',
      reasons: [
        'Bonus-action spell rule: only a 1-action cantrip can share a turn with a bonus-action spell',
      ],
    });
    session.run(castSpell, { spellId: VICIOUS_MOCKERY });
    expect(session.live.combat?.economy.actionUsed).toBe(true);
    expect(session.preview(castSpell, { spellId: VICIOUS_MOCKERY })).toEqual({
      result: 'warn',
      reasons: ['Action already used'],
    });
  });

  it('a leveled spell first, then a bonus-action spell, also breaks the rule', () => {
    const session = inTurn();
    session.run(castSpell, { spellId: DISSONANT_WHISPERS, slotLevel: 1 });
    expect(session.preview(castSpell, { spellId: HEALING_WORD, slotLevel: 1 })).toMatchObject({
      result: 'warn',
    });
    session.run(endTurn, null);
    session.run(startTurn, null);
    expect(session.preview(castSpell, { spellId: HEALING_WORD, slotLevel: 1 })).toEqual({
      result: 'ok',
      reasons: [],
    });
  });

  it('casting is blocked once dead', () => {
    const dead = withLive(freshState, { hp: 0, deathSaves: { success: 0, fail: 3 } });
    expect(new Session(dead).preview(castSpell, { spellId: VICIOUS_MOCKERY })).toEqual({
      result: 'blocked',
      reasons: ['You are dead'],
    });
  });
});

describe('concentration', () => {
  it('shows the save DC on damage and ends when you drop to 0 HP', () => {
    const session = new Session();
    session.run(castSpell, { spellId: INVISIBILITY, slotLevel: 2 });
    expect(session.preview(applyDamage, { amount: 12 })).toEqual({
      result: 'ok',
      reasons: ['Concentration save DC 10 (Invisibility)'],
    });
    session.run(applyDamage, { amount: 12 });
    expect(session.live.concentration?.spellId).toBe(INVISIBILITY);
    expect(session.run(applyDamage, { amount: 7 })).toBe(
      'Took 7 damage (HP 7 → 0); down at 0 HP, unconscious; concentration on Invisibility ended (unconscious)',
    );
    expect(session.live.concentration).toBeUndefined();
  });

  it('endConcentration needs a concentration', () => {
    expect(new Session().preview(endConcentration, null)).toEqual({
      result: 'blocked',
      reasons: ['Not concentrating'],
    });
  });
});

describe('adjustSlot', () => {
  it('sets used slots, logged and undoable', () => {
    const session = new Session();
    expect(session.run(adjustSlot, { level: 1, used: 2 })).toBe('L1 slots: 2/4 left');
    expect(session.live.slotsUsed[1]).toBe(2);
    session.undo();
    expect(session.state).toEqual(freshState);
  });

  it('blocks levels you have no slots of and out-of-range counts', () => {
    const session = new Session();
    expect(session.preview(adjustSlot, { level: 3, used: 0 }).reasons).toEqual([
      'You have no level 3 slots',
    ]);
    expect(session.preview(adjustSlot, { level: 'pact', used: 0 }).reasons).toEqual([
      'You have no pact slots',
    ]);
    expect(session.preview(adjustSlot, { level: 1, used: 5 }).reasons).toEqual([
      'Used slots must be a whole number from 0 to 4',
    ]);
  });
});
