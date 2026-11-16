import { describe, expect, it } from 'vitest';
import type { CharacterState } from '../calc/sheet';
import { featureUseDetails, useFeature } from './features';
import { freshState, Session } from './test-utils';

const HEALER = 'feature.feat.healer';
const LEADER = 'feature.feat.inspiring-leader';

function character(feat: string, kit = false): CharacterState {
  const state = structuredClone(freshState);
  state.build.featureIds = [...state.build.featureIds, feat];
  if (kit) {
    state.build.items.push({ instanceId: 'kit-1', itemId: 'item.healers-kit' });
    state.live.items['kit-1'] = { qty: 1, equipped: false, attuned: false };
  }
  return state;
}

describe('feat Use buttons', () => {
  it('Healer: d6 + 4 with a reminder, warns without a healer kit', () => {
    const session = new Session(character(HEALER, true));
    expect(featureUseDetails(session, HEALER)).toMatchObject({ die: 'd6', dieBonus: 4 });
    expect(session.preview(useFeature, { featureId: HEALER }).reasons).toEqual([]);
    expect(session.run(useFeature, { featureId: HEALER })).toContain(
      "d6 + 4, plus the target's total Hit Dice",
    );
    expect(
      new Session(character(HEALER)).preview(useFeature, { featureId: HEALER }).reasons,
    ).toEqual(["No Healer's Kit carried"]);
  });

  it('Inspiring Leader: level + CHA temp HP for you, keeping a higher amount', () => {
    const session = new Session(character(LEADER));
    const amount = session.sheet.level + session.sheet.abilities.CHA.mod;
    expect(featureUseDetails(session, LEADER).tempHp).toBe(amount);
    expect(session.run(useFeature, { featureId: LEADER })).toContain(`you gain ${amount} temp HP`);
    expect(session.live.tempHp).toBe(amount);
    session.undo();
    expect(session.live.tempHp).toBe(0);

    const shielded = character(LEADER);
    shielded.live.tempHp = 20;
    const high = new Session(shielded);
    expect(high.preview(useFeature, { featureId: LEADER }).reasons).toEqual([
      `Temp HP don't stack: you have 20, more than ${amount}; you keep yours`,
    ]);
    high.run(useFeature, { featureId: LEADER }, true);
    expect(high.live.tempHp).toBe(20);
  });
});
