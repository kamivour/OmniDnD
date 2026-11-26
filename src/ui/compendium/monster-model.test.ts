import { describe, expect, it } from 'vitest';
import type { CreatureDef } from '../../engine/schema';
import { clearFilters, hasFilters, readTab, switchKind } from './compendium-model';
import { monsterActiveFilters, monsterGroup, monsterMeta, readMonsterQuery } from './monster-model';

const params = (text: string) => new URLSearchParams(text);

describe('monsters tab URL state', () => {
  it('opens the Monsters tab and keeps search and books when switching', () => {
    expect(readTab(params('kind=monsters'))).toBe('monsters');
    expect(readTab(params('kind=dragons'))).toBe('spells');
    expect(
      switchKind(params('kind=monsters&q=wolf&type=beast&book=VGM'), 'spells').toString(),
    ).toBe('q=wolf&book=VGM&kind=spells');
  });

  it('reads filters and sort, ignoring unknown values', () => {
    expect(
      readMonsterQuery(
        params(
          'kind=monsters&q=imp&crmin=0.25&crmax=5&type=fiend,robot&size=tiny,vast&book=MM&legendary=1&npc=1&sort=cr',
        ),
      ),
    ).toEqual({
      filter: {
        text: 'imp',
        crMin: 0.25,
        crMax: 5,
        types: ['fiend'],
        sizes: ['tiny'],
        books: ['MM'],
        legendary: true,
        npc: true,
      },
      sort: 'cr',
    });
    expect(readMonsterQuery(params('crmin=0.3&crmax=&sort=size'))).toEqual({
      filter: {},
      sort: 'name',
    });
  });

  it('labels active filters and clears them but keeps the sort', () => {
    const { filter } = readMonsterQuery(params('crmin=0.5&type=other&legendary=1'));
    expect(monsterActiveFilters(filter).map((chip) => chip.label)).toEqual([
      'CR 1/2 or more',
      'Other',
      'Legendary',
    ]);
    const on = params('kind=monsters&sort=cr&npc=1');
    expect(hasFilters(on)).toBe(true);
    expect(clearFilters(on).toString()).toBe('kind=monsters&sort=cr');
  });

  it('describes a row and groups by challenge when sorted by it', () => {
    const creature = {
      name: 'Test Sage',
      cr: 0.125,
      size: 'medium',
      sizes: ['medium', 'small'],
      creatureType: 'humanoid (any race)',
      npc: true,
    } as CreatureDef;
    expect(monsterMeta(creature)).toBe('CR 1/8 · Medium or Small humanoid · NPC');
    expect(monsterGroup('cr')(creature)).toBe('Challenge 1/8');
    expect(monsterGroup('name')(creature)).toBe('');
  });
});
