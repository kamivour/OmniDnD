import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROGRESS,
  markDone,
  moveStep,
  parseProgress,
  resetTips,
  shouldAutostart,
  type Chapter,
} from './model';

const welcome: Chapter = { id: 'welcome', title: 'Welcome', tip: false, steps: [] };
const combat: Chapter = { id: 'combat', title: 'Combat', tip: true, steps: [] };

describe('tutorial progress', () => {
  it('treats missing or broken saves as a fresh device', () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('not json')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"done":["nope"],"tipsOn":true}')).toEqual(EMPTY_PROGRESS);
  });

  it('starts a chapter once, and never again after it is done or skipped', () => {
    expect(shouldAutostart(EMPTY_PROGRESS, welcome)).toBe(true);
    const done = markDone(EMPTY_PROGRESS, 'welcome');
    expect(shouldAutostart(done, welcome)).toBe(false);
    expect(markDone(done, 'welcome')).toBe(done);
  });

  it('screen tips follow the switch, the first chapters do not', () => {
    const off = { ...EMPTY_PROGRESS, tipsOn: false };
    expect(shouldAutostart(off, combat)).toBe(false);
    expect(shouldAutostart(off, welcome)).toBe(true);
    expect(shouldAutostart(EMPTY_PROGRESS, combat)).toBe(true);
  });

  it('reset tips shows every chapter again and keeps the switch', () => {
    const progress = resetTips({ done: ['welcome', 'combat'], tipsOn: false });
    expect(progress).toEqual({ done: [], tipsOn: false });
  });

  it('moves between steps without leaving the list', () => {
    expect(moveStep(0, 1, 3)).toBe(1);
    expect(moveStep(2, 1, 3)).toBe('end');
    expect(moveStep(0, -1, 3)).toBe(0);
    expect(moveStep(2, -1, 3)).toBe(1);
  });
});
