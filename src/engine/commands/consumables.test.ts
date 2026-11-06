import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { ItemUseSchema } from '../schema';
import { startCombat, startTurn } from './combat';
import { applyDamage } from './hp';
import { addInventoryItem } from './inventory';
import { consumeItem } from './items';
import { freshState, Session } from './test-utils';

function withItem(itemId: string, quantity = 2) {
  const session = new Session(structuredClone(freshState));
  session.run(addInventoryItem, { instanceId: 'used', itemId, quantity });
  return session;
}

describe('item use data', () => {
  it('rejects unknown activations and gives every catalogue consumable a use', () => {
    expect(ItemUseSchema.safeParse({ activation: 'bonus' }).success).toBe(false);
    const consumables = [...registry.entries.values()].filter(
      (entry) => entry.kind === 'item' && entry.category === 'consumable',
    );
    expect(consumables.length).toBeGreaterThan(40);
    expect(consumables.filter((entry) => entry.kind === 'item' && !entry.use)).toEqual([]);
    expect(registry.get('item', 'item.potion-of-healing-supreme').use).toEqual({
      activation: 'action',
      healing: { dice: '10d4', bonus: 20 },
    });
  });
});

describe('consumeItem', () => {
  it('heals by the entered roll plus bonus, spends one and undoes exactly', () => {
    const session = withItem('item.potion-of-healing-common');
    session.run(applyDamage, { amount: 10 });
    expect(session.preview(consumeItem, { instanceId: 'used', target: 'self' }).result).toBe(
      'blocked',
    );
    expect(
      session.preview(consumeItem, { instanceId: 'used', target: 'self', roll: 9 }).result,
    ).toBe('blocked');
    expect(session.run(consumeItem, { instanceId: 'used', target: 'self', roll: 5 })).toBe(
      'Used Potion of Healing, 1 left; healed 7 (2d4: 5 + 2), HP 9 → 16',
    );
    expect(session.live.items.used!.qty).toBe(1);
    session.undo();
    expect(session.live.hp).toBe(9);
    expect(session.live.items.used!.qty).toBe(2);
  });

  it('spends your action in combat, but not when an ally gives it to you', () => {
    const session = withItem('item.potion-of-healing-common');
    session.run(startCombat, null);
    session.run(startTurn, null);
    session.run(consumeItem, { instanceId: 'used', target: 'other', expected: 2 });
    expect(session.live.combat!.economy.actionUsed).toBe(true);
    const again = session.preview(consumeItem, { instanceId: 'used', target: 'self', roll: 4 });
    expect(again.reasons.join()).toMatch(/Action already used/);
    expect(
      session.preview(consumeItem, { instanceId: 'used', target: 'self', roll: 4, byAlly: true })
        .reasons,
    ).not.toContain('Action already used');
    expect(
      session.preview(consumeItem, { instanceId: 'used', target: 'other', byAlly: true }).result,
    ).toBe('blocked');
  });

  it('revives from 0 HP when an ally gives you a healing potion', () => {
    const session = withItem('item.potion-of-healing-common');
    session.run(applyDamage, { amount: 19 });
    const self = session.preview(consumeItem, { instanceId: 'used', target: 'self', roll: 2 });
    expect(self.reasons.join()).toMatch(/Incapacitated/);
    expect(
      session.run(consumeItem, { instanceId: 'used', target: 'self', roll: 2, byAlly: true }),
    ).toBe(
      'Potion of Healing given to you, 1 left; healed 4 (2d4: 2 + 2), HP 0 → 4; conscious again',
    );
    expect(session.live.deathSaves).toEqual({ success: 0, fail: 0 });
  });

  it('records thrown and timed items without deciding outcomes', () => {
    const acid = withItem('item.acid-vial', 1);
    const preview = acid.preview(consumeItem, { instanceId: 'used', target: 'other' });
    expect(preview.reasons.join()).toMatch(/attack roll and damage at the table/);
    expect(acid.run(consumeItem, { instanceId: 'used', target: 'other' })).toBe(
      'Acid (vial) used on another creature, 0 left',
    );
    expect(acid.preview(consumeItem, { instanceId: 'used', target: 'other' }).result).toBe(
      'blocked',
    );
    const scroll = withItem('item.spell-scroll-1st', 1);
    expect(
      scroll.preview(consumeItem, { instanceId: 'used', target: 'self' }).reasons.join(),
    ).toMatch(/time its own rule states/);
    expect(
      scroll.preview(consumeItem, { instanceId: 'used', target: 'self', roll: 3 }).result,
    ).toBe('blocked');
  });

  it('blocks stale reviews and items without a use', () => {
    const session = withItem('item.potion-of-healing-common');
    expect(
      session.preview(consumeItem, { instanceId: 'used', target: 'other', expected: 3 }).result,
    ).toBe('blocked');
    const pack = withItem('item.backpack', 1);
    expect(pack.preview(consumeItem, { instanceId: 'used', target: 'self' }).result).toBe(
      'blocked',
    );
  });
});
