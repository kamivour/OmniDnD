import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import type { CharacterState } from '../calc/sheet';
import { startCombat, startTurn, useEconomy } from './combat';
import { featureUseDetails, useFeature } from './features';
import { freshState, Session } from './test-utils';

const FAVORED_FOE = 'feature.tce.ranger-favored-foe';
const STEADY_AIM = 'feature.tce.rogue-steady-aim';
const HARNESS = 'feature.tce.cleric-harness-divine-power';
const PALADIN_HARNESS = 'feature.tce.paladin-harness-divine-power';
const QUICKENED = 'feature.tce.monk-quickened-healing';

function character(classId: string, level: number): CharacterState {
  const state = structuredClone(freshState);
  state.campaign = {
    ...state.campaign,
    sources: ['PHB', 'TCE'],
    optionalRules: { optionalClassFeatures: true },
  };
  state.build.classes = [{ classId, level }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    value: index === 0 ? 10 : 6,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [];
  state.build.featureIds = [];
  return state;
}

describe('Tasha class options', () => {
  it('Favored Foe: proficiency-bonus uses, growing die, ends spell concentration', () => {
    const state = character('class.ranger', 6);
    state.live.concentration = { spellId: 'spell.hunters-mark', slotLevel: 1 };
    const session = new Session(state);
    const details = featureUseDetails(session, FAVORED_FOE);
    expect(details.uses?.max).toBe(3);
    expect(details.die).toBe('d6');
    expect(session.preview(useFeature, { featureId: FAVORED_FOE }).reasons).toEqual([
      "Favored Foe needs concentration; this ends concentration on Hunter's Mark",
    ]);
    session.run(useFeature, { featureId: FAVORED_FOE }, true);
    expect(session.live.concentration).toBeUndefined();
    expect(featureUseDetails(session, FAVORED_FOE).uses?.remaining).toBe(2);
    session.undo();
    expect(session.live.concentration?.spellId).toBe('spell.hunters-mark');
  });

  it('Steady Aim: warns after moving and drops speed to 0 for the turn', () => {
    const session = new Session(character('class.rogue', 3));
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(useFeature, { featureId: STEADY_AIM });
    const economy = session.live.combat!.economy;
    expect(economy.bonusUsed).toBe(true);
    expect(economy.movementUsed).toBe(session.sheet.speed.value);

    const moved = new Session(character('class.rogue', 3));
    moved.run(startCombat, null);
    moved.run(startTurn, null);
    moved.run(useEconomy, { kind: 'movement', feet: 5 });
    expect(moved.preview(useFeature, { featureId: STEADY_AIM }).reasons).toEqual([
      'Steady Aim works only if you have not moved this turn',
    ]);
  });

  it('Harness Divine Power: spends Channel Divinity and regains the highest allowed slot', () => {
    const state = character('class.cleric', 5);
    state.live.slotsUsed = [0, 2, 2, 1, 0, 0, 0, 0, 0, 0];
    const session = new Session(state);
    expect(featureUseDetails(session, HARNESS).uses?.max).toBe(1);
    // Proficiency +3: slots up to level 2.
    expect(session.run(useFeature, { featureId: HARNESS })).toBe(
      'Used Harness Divine Power (regained a level 2 slot, Channel Divinity 0/1 left, Harness Divine Power 0/1 left)',
    );
    expect(session.live.slotsUsed.slice(1, 4)).toEqual([2, 1, 1]);
    expect(session.live.featureUsesSpent['feature.cleric.channel-divinity']).toBe(1);
    expect(featureUseDetails(session, HARNESS).unavailableReason).toBe(
      'No Harness Divine Power uses left',
    );
    session.undo();
    session.run(useFeature, { featureId: HARNESS, slotLevel: 1 });
    expect(session.live.slotsUsed.slice(1, 4)).toEqual([1, 2, 1]);
    session.undo();
    expect(session.preview(useFeature, { featureId: HARNESS, slotLevel: 3 }).reasons).toEqual([
      'Choose an expended slot of level 2 or lower',
    ]);
  });

  it('Harness Divine Power: needs Channel Divinity left and an expended slot', () => {
    const fresh = new Session(character('class.paladin', 3));
    expect(featureUseDetails(fresh, PALADIN_HARNESS).unavailableReason).toBe(
      'No expended spell slot of level 1 or lower',
    );
    const state = character('class.paladin', 3);
    state.live.slotsUsed = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0];
    state.live.featureUsesSpent['feature.paladin.channel-divinity'] = 1;
    expect(featureUseDetails(new Session(state), PALADIN_HARNESS).unavailableReason).toBe(
      'No Channel Divinity uses left',
    );
  });

  it('Quickened Healing: spends 2 ki and shows the martial arts die plus proficiency', () => {
    const session = new Session(character('class.monk', 5));
    const details = featureUseDetails(session, QUICKENED);
    expect(details).toMatchObject({ cost: 2, die: 'd6', dieBonus: 3 });
    expect(session.run(useFeature, { featureId: QUICKENED })).toContain('d6 + 3');
    expect(session.live.featureUsesSpent['feature.monk.ki']).toBe(2);
    const tired = character('class.monk', 5);
    tired.live.featureUsesSpent['feature.monk.ki'] = 4;
    expect(featureUseDetails(new Session(tired), QUICKENED).unavailableReason).toBe(
      'Needs 2 Ki; 1 left',
    );
  });

  it('none of them appear without the optional rule', () => {
    const state = character('class.cleric', 5);
    state.campaign.optionalRules = {};
    expect(featureUseDetails(new Session(state), HARNESS).unavailableReason).toBe(
      'You do not have this feature',
    );
    expect(registry.get('feature', HARNESS).restoreSlot).toBe(true);
  });
});
