import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState } from '../commands/test-utils';
import { computeSheet, type CharacterState } from './sheet';
import { armorEquipmentNotes, armorReplacements, wornArmor } from './equipment';

function withArmor(
  ...entries: { id: string; itemId: string; qty?: number; equipped?: boolean }[]
): CharacterState {
  const state = structuredClone(freshState);
  for (const { id, itemId, qty = 1, equipped = true } of entries) {
    state.build.items.push({ instanceId: id, itemId });
    state.live.items[id] = { qty, equipped, attuned: false };
  }
  return state;
}

describe('recorded equipment', () => {
  it('resolves exact worn armor instances and recorded category proficiencies', () => {
    const state = withArmor(
      { id: 'chain', itemId: 'item.chain-mail' },
      { id: 'shield', itemId: 'item.shield' },
      { id: 'empty', itemId: 'item.plate-armor', qty: 0 },
      { id: 'stored', itemId: 'item.scale-mail', equipped: false },
    );
    state.build.proficiencies.armor = ['light', 'shield'];
    const before = structuredClone(state);
    expect(
      wornArmor(state, registry).map(({ instanceId, def, proficient }) => ({
        instanceId,
        category: def.armor.category,
        proficient,
      })),
    ).toEqual([
      { instanceId: 'leather-armor-1', category: 'light', proficient: true },
      { instanceId: 'chain', category: 'heavy', proficient: false },
      { instanceId: 'shield', category: 'shield', proficient: true },
    ]);
    expect(state).toEqual(before);
  });

  it('replaces only the same armor slot, including empty equipped flags', () => {
    const state = withArmor(
      { id: 'chain', itemId: 'item.chain-mail', equipped: false },
      { id: 'empty', itemId: 'item.scale-mail', qty: 0 },
      { id: 'shield', itemId: 'item.shield' },
      { id: 'other-shield', itemId: 'item.shield', equipped: false },
    );
    expect(armorReplacements(state, registry, 'chain').map(({ instanceId }) => instanceId)).toEqual(
      ['leather-armor-1', 'empty'],
    );
    expect(
      armorReplacements(state, registry, 'other-shield').map(({ instanceId }) => instanceId),
    ).toEqual(['shield']);
    expect(armorReplacements(state, registry, 'rapier-1')).toEqual([]);
    expect(armorReplacements(state, registry, 'missing')).toEqual([]);
  });

  it('reports persistent nonproficiency, stealth and the computed STR requirement without changing rolls', () => {
    const state = withArmor({ id: 'chain', itemId: 'item.chain-mail' });
    state.live.items['leather-armor-1']!.equipped = false;
    const before = structuredClone(state);
    const notes = armorEquipmentNotes(state, registry);
    expect(notes).toEqual([
      'No proficiency with Chain Mail: STR/DEX checks, saves and attacks have disadvantage; you cannot cast spells.',
      'Chain Mail: disadvantage on Stealth checks.',
      'Chain Mail: STR 13 requirement; current STR 11. Review the armor speed restriction.',
    ]);
    expect(state).toEqual(before);
    state.build.overrides.push({ path: '/abilities/STR/score', value: 13, note: 'DM strength' });
    const sheet = computeSheet(state, registry);
    expect(
      armorEquipmentNotes(state, registry, sheet).some((note) =>
        note.includes('STR 13 requirement'),
      ),
    ).toBe(false);
  });

  it('warns about competing imported armor and shields without normalizing them', () => {
    const state = withArmor(
      { id: 'chain', itemId: 'item.chain-mail' },
      { id: 'shield', itemId: 'item.shield' },
      { id: 'other-shield', itemId: 'item.shield' },
    );
    const before = structuredClone(state);
    expect(armorEquipmentNotes(state, registry)).toEqual(
      expect.arrayContaining([
        'Multiple suits of armor are recorded as equipped. AC uses the first; choose one outfit.',
        'Multiple shields are recorded as equipped. Only the first shield contributes to AC.',
      ]),
    );
    expect(state).toEqual(before);
  });

  it('does not apply penalties from empty or stored armor and leaves a proficient outfit clear', () => {
    const state = withArmor(
      { id: 'empty', itemId: 'item.chain-mail', qty: 0 },
      { id: 'stored', itemId: 'item.scale-mail', equipped: false },
    );
    expect(armorEquipmentNotes(state, registry)).toEqual([]);
    state.live.items.empty!.qty = 1;
    state.live.items['leather-armor-1']!.equipped = false;
    state.build.proficiencies.armor = ['heavy'];
    state.build.overrides = [{ path: '/abilities/STR/score', value: 15, note: 'DM strength' }];
    expect(armorEquipmentNotes(state, registry)).toEqual([
      'Chain Mail: disadvantage on Stealth checks.',
    ]);
  });
});
