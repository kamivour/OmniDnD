import { describe, expect, it } from 'vitest';
import { ExportFileSchema } from '../schema';
import { ItemChargesSchema } from '../schema/refs';
import { addInventoryItem, removeInventoryItem } from './inventory';
import {
  adjustItemQuantity,
  rechargeItem,
  setItemCharges,
  skipItemRecharge,
  spendItemCharges,
} from './items';
import { completeShortRest } from './rest';
import { advanceTime } from './time';
import { freshState, Session } from './test-utils';

const HOUR = 3600;

function withItem(itemId: string, instanceId = 'charged', quantity = 1) {
  const session = new Session(structuredClone(freshState));
  session.run(addInventoryItem, { instanceId, itemId, quantity });
  return session;
}

describe('item charge schema', () => {
  it('requires a regain unless the item never recharges', () => {
    expect(ItemChargesSchema.safeParse({ max: 3, recharge: 'none' }).success).toBe(true);
    expect(ItemChargesSchema.safeParse({ max: 3, recharge: 'dawn' }).success).toBe(false);
    expect(ItemChargesSchema.safeParse({ max: 3, recharge: 'none', regain: 'all' }).success).toBe(
      false,
    );
    expect(
      ItemChargesSchema.safeParse({ max: 7, recharge: 'dawn', regain: { dice: '1d3' } }).success,
    ).toBe(true);
  });
});

describe('item charges', () => {
  it('starts a new DMG item at full charges without a source warning', () => {
    const session = new Session(structuredClone(freshState));
    const preview = session.preview(addInventoryItem, {
      instanceId: 'wand',
      itemId: 'item.wand-of-magic-missiles',
      quantity: 1,
    });
    expect(preview.result).toBe('ok');
    session.run(addInventoryItem, {
      instanceId: 'wand',
      itemId: 'item.wand-of-magic-missiles',
      quantity: 1,
    });
    expect(session.live.items.wand).toMatchObject({ charges: 7 });
  });

  it('spends charges, blocks overspending and stale reviews, and undoes', () => {
    const session = withItem('item.wand-of-magic-missiles');
    expect(session.run(spendItemCharges, { instanceId: 'charged', count: 3, expected: 7 })).toBe(
      'Wand of Magic Missiles: spent 3 charges, 7 → 4',
    );
    expect(session.preview(spendItemCharges, { instanceId: 'charged', count: 5 })).toMatchObject({
      result: 'blocked',
    });
    expect(
      session.preview(spendItemCharges, { instanceId: 'charged', count: 1, expected: 7 }).result,
    ).toBe('blocked');
    const last = session.preview(spendItemCharges, { instanceId: 'charged', count: 4 });
    expect(last.reasons.join()).toMatch(/Last charge spent/);
    session.undo();
    expect(session.live.items.charged!.charges).toBe(7);
  });

  it('warns when an attunement item is not attuned', () => {
    const session = withItem('item.staff-of-healing');
    const result = session.preview(spendItemCharges, { instanceId: 'charged', count: 1 });
    expect(result.result).toBe('warn');
    expect(result.reasons.join()).toMatch(/requires attunement/);
  });

  it('notes one shared counter for a stacked entry and blocks quantity zero', () => {
    const session = withItem('item.wand-of-magic-missiles', 'charged', 2);
    expect(
      session.preview(spendItemCharges, { instanceId: 'charged', count: 1 }).reasons.join(),
    ).toMatch(/one charge count/);
    const empty = withItem('item.wand-of-magic-missiles', 'charged', 0);
    expect(empty.preview(spendItemCharges, { instanceId: 'charged', count: 1 }).result).toBe(
      'blocked',
    );
  });

  it('blocks items without charges', () => {
    const session = withItem('item.backpack');
    expect(session.preview(spendItemCharges, { instanceId: 'charged', count: 1 }).result).toBe(
      'blocked',
    );
  });

  it('flags a dice regain at dawn and applies the entered roll plus bonus, capped at maximum', () => {
    const session = withItem('item.wand-of-magic-missiles');
    session.run(spendItemCharges, { instanceId: 'charged', count: 6 });
    // Day 1 08:00 + 23 h passes 06:00 on Day 2.
    expect(session.run(advanceTime, { seconds: 23 * HOUR })).toMatch(
      /roll to recharge Wand of Magic Missiles/,
    );
    expect(session.live.items.charged!.rechargePending).toBe(true);
    expect(session.preview(rechargeItem, { instanceId: 'charged' }).result).toBe('blocked');
    expect(session.preview(rechargeItem, { instanceId: 'charged', roll: 7 }).result).toBe(
      'blocked',
    );
    expect(session.run(rechargeItem, { instanceId: 'charged', roll: 3 })).toBe(
      'Wand of Magic Missiles: regained charges (1d6: 3 + 1), 1 → 5',
    );
    expect(session.live.items.charged).not.toHaveProperty('rechargePending');
    session.run(spendItemCharges, { instanceId: 'charged', count: 1 });
    session.run(advanceTime, { seconds: 24 * HOUR });
    session.run(rechargeItem, { instanceId: 'charged', roll: 6 });
    expect(session.live.items.charged!.charges).toBe(7);
    session.undo();
    expect(session.live.items.charged).toMatchObject({ charges: 4, rechargePending: true });
  });

  it('refills "regain all" items at dawn and leaves full or never-recharging items alone', () => {
    const session = withItem('item.eyes-of-charming', 'eyes');
    session.run(addInventoryItem, {
      instanceId: 'gem',
      itemId: 'item.gem-of-brightness',
      quantity: 1,
    });
    session.run(addInventoryItem, {
      instanceId: 'full',
      itemId: 'item.wand-of-magic-missiles',
      quantity: 1,
    });
    session.run(spendItemCharges, { instanceId: 'eyes', count: 2 }, true);
    session.run(spendItemCharges, { instanceId: 'gem', count: 5 });
    expect(session.run(advanceTime, { seconds: 23 * HOUR })).toMatch(/recharged Eyes of Charming/);
    expect(session.live.items.eyes!.charges).toBe(3);
    expect(session.live.items.gem!.charges).toBe(45);
    expect(session.live.items.full).not.toHaveProperty('rechargePending');
  });

  it('does not recharge dawn items on a short rest and skips spent-out quantity', () => {
    const session = withItem('item.wand-of-magic-missiles');
    session.run(spendItemCharges, { instanceId: 'charged', count: 2 });
    session.run(completeShortRest, {});
    expect(session.live.items.charged).not.toHaveProperty('rechargePending');
    const empty = withItem('item.wand-of-magic-missiles', 'charged', 1);
    empty.run(spendItemCharges, { instanceId: 'charged', count: 2 });
    empty.run(adjustItemQuantity, { instanceId: 'charged', quantity: 0 });
    empty.run(advanceTime, { seconds: 23 * HOUR });
    expect(empty.live.items.charged).not.toHaveProperty('rechargePending');
  });

  it('skips a due regain, corrects counts, and drops the flag with the item', () => {
    const session = withItem('item.wand-of-magic-missiles');
    session.run(spendItemCharges, { instanceId: 'charged', count: 2 });
    session.run(advanceTime, { seconds: 23 * HOUR });
    expect(session.run(skipItemRecharge, { instanceId: 'charged' })).toBe(
      'Wand of Magic Missiles: recharge skipped',
    );
    expect(session.preview(skipItemRecharge, { instanceId: 'charged' }).result).toBe('blocked');
    expect(session.preview(setItemCharges, { instanceId: 'charged', charges: 8 }).result).toBe(
      'blocked',
    );
    session.run(advanceTime, { seconds: 24 * HOUR });
    session.run(setItemCharges, { instanceId: 'charged', charges: 7 });
    expect(session.live.items.charged).toEqual({
      qty: 1,
      equipped: false,
      attuned: false,
      charges: 7,
    });
    session.run(spendItemCharges, { instanceId: 'charged', count: 1 });
    session.run(advanceTime, { seconds: 24 * HOUR });
    session.run(removeInventoryItem, { instanceId: 'charged' });
    expect(session.live.items).not.toHaveProperty('charged');
  });

  it('keeps charge state through export validation', () => {
    const session = withItem('item.wand-of-magic-missiles');
    session.run(spendItemCharges, { instanceId: 'charged', count: 2 });
    session.run(advanceTime, { seconds: 23 * HOUR });
    const live = ExportFileSchema.shape.live.parse(session.live);
    expect(live.items.charged).toMatchObject({ charges: 5, rechargePending: true });
  });
});
