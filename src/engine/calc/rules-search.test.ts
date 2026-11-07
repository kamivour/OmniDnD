import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { searchRules } from './rules-search';

describe('searchRules', () => {
  it('returns nothing for an empty query', () => {
    expect(searchRules(registry, '   ')).toEqual([]);
  });

  it('finds a condition with its rules text, ahead of looser matches', () => {
    const hits = searchRules(registry, 'blind');
    expect(hits[0]).toMatchObject({ id: 'condition.blinded', kind: 'condition' });
    expect(hits[0]!.text).toContain("can't see");
  });

  it('is case-insensitive and ranks prefix matches first', () => {
    const hits = searchRules(registry, 'FIRE');
    const firstContains = hits.findIndex((hit) => !hit.name.toLowerCase().startsWith('fire'));
    const lastPrefix = hits.findLastIndex((hit) => hit.name.toLowerCase().startsWith('fire'));
    expect(hits.length).toBeGreaterThan(1);
    if (firstContains >= 0) expect(lastPrefix).toBeLessThan(firstContains);
  });

  it('respects the limit', () => {
    expect(searchRules(registry, 'a', 5)).toHaveLength(5);
  });

  it('hides books a campaign does not use, but keeps PHB', () => {
    const all = searchRules(registry, 'toll the dead', 40);
    expect(all.some((hit) => hit.source === 'XGE')).toBe(true);
    const phbOnly = searchRules(registry, 'toll the dead', 40, ['PHB']);
    expect(phbOnly.some((hit) => hit.source === 'XGE')).toBe(false);
    const withTce = searchRules(registry, 'toll the dead', 40, ['PHB', 'XGE']);
    expect(withTce.some((hit) => hit.source === 'XGE')).toBe(true);
    expect(searchRules(registry, 'blind', 40, ['PHB'])[0]?.id).toBe('condition.blinded');
  });
});
