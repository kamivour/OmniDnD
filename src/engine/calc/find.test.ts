import { describe, expect, it } from 'vitest';
import { searchFind, type FindEntry } from './find';

const entries: FindEntry[] = [
  {
    id: 'go.body',
    group: 'go',
    title: 'Movement and body',
    detail: 'Explore',
    synonyms: ['jump', 'lift'],
    target: { kind: 'go', path: 'explore' },
  },
  { id: 'go.print', group: 'go', title: 'Print view', synonyms: ['pdf'], target: { kind: 'go', path: 'print' } },
  { id: 'do.rest', group: 'do', title: 'Long rest', target: { kind: 'action', action: 'long-rest' } },
  {
    id: 'spell.shatter',
    group: 'character',
    title: 'Shatter',
    detail: 'Spell',
    target: { kind: 'go', path: 'spells' },
  },
  {
    id: 'rule.jumping',
    group: 'rules',
    title: 'Jumping',
    target: { kind: 'go', path: 'reference', query: 'jumping' },
  },
];

const ids = (query: string, perGroup?: number) =>
  searchFind(entries, query, perGroup).map((result) => result.entry.id);

describe('searchFind', () => {
  it('returns nothing for an empty query', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
  });

  it('finds a place through a synonym', () => {
    expect(ids('jump')).toContain('go.body');
    expect(ids('pdf')).toEqual(['go.print']);
  });

  it('orders groups first, then best match', () => {
    expect(ids('jump')).toEqual(['go.body', 'rule.jumping']);
  });

  it('ranks title prefix before synonym', () => {
    const list: FindEntry[] = [
      { id: 'b', group: 'go', title: 'Other', synonyms: ['rest'], target: { kind: 'go', path: 'b' } },
      { id: 'a', group: 'go', title: 'Restore', target: { kind: 'go', path: 'a' } },
    ];
    expect(searchFind(list, 'rest').map((result) => result.entry.id)).toEqual(['a', 'b']);
  });

  it('needs every word to match', () => {
    expect(ids('long rest')).toEqual(['do.rest']);
    expect(ids('long shatter')).toEqual([]);
  });

  it('ignores case', () => {
    expect(ids('SHATTER')).toEqual(['spell.shatter']);
  });

  it('caps results per group', () => {
    const many: FindEntry[] = Array.from({ length: 10 }, (_, index) => ({
      id: `go.${index}`,
      group: 'go',
      title: `Page ${index}`,
      target: { kind: 'go', path: String(index) },
    }));
    expect(searchFind(many, 'page', 3)).toHaveLength(3);
  });
});
