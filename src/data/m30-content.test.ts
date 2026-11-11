import { describe, expect, it } from 'vitest';
import { registry } from './registry';

describe('M30 PHB spells', () => {
  it('Hex carries its 1d6 necrotic rider and warlock list', () => {
    const hex = registry.get('spell', 'spell.hex');
    expect(hex.source).toBe('PHB');
    expect(hex.srd).toBe(false);
    expect(hex.damage).toMatchObject({ dice: '1d6', type: 'necrotic' });
    expect(hex.classes).toEqual(['class.warlock']);
  });

  it('Hunter’s Mark has an own-words summary naming the extra 1d6', () => {
    const mark = registry.get('spell', 'spell.hunters-mark');
    expect(mark.summary?.effect).toContain('1d6');
  });

  it('Tsunami takes a minute to cast and Power Word Heal is 9th level', () => {
    expect(registry.get('spell', 'spell.tsunami').casting).toEqual({ cost: 'minutes', amount: 1 });
    expect(registry.get('spell', 'spell.power-word-heal').level).toBe(9);
  });

  it('adds spells at every level it should, with no book text', () => {
    const added = [...registry.entries.values()].filter(
      (e) => e.kind === 'spell' && e.source === 'PHB' && !e.srd,
    );
    expect(added.length).toBeGreaterThanOrEqual(39);
    for (const e of added) expect(e.fullText).toBeUndefined();
  });
});
