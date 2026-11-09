import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import { OVERVIEW_COLUMNS, overviewCells, sortRows, type OverviewValue } from './overview';

const fool = (): CharacterState => structuredClone(seedFile);

describe('DM overview columns', () => {
  it('computes every column from a character without throwing', () => {
    const state = fool();
    const cells = overviewCells(state, computeSheet(state, registry));
    expect(Object.keys(cells)).toEqual(OVERVIEW_COLUMNS.map((column) => column.id));
    for (const cell of Object.values(cells)) expect(cell.text.length).toBeGreaterThan(0);
  });

  it('shows hit points, death saves and inspiration from live state', () => {
    const state = fool();
    state.live.hp = 3;
    state.live.deathSaves = { success: 1, fail: 2 };
    state.live.inspiration = true;
    const cells = overviewCells(state, computeSheet(state, registry));
    expect(cells.hp!.text.startsWith('3/')).toBe(true);
    expect(cells.death!.text).toBe('1 ok / 2 fail');
    expect(cells.inspiration!.text).toBe('Yes');
  });

  it('prefixes save bonuses with a sign', () => {
    const state = fool();
    const cells = overviewCells(state, computeSheet(state, registry));
    expect(cells['save-STR']!.text).toMatch(/^[+-]\d+$/);
  });
});

describe('sortRows', () => {
  const row = (name: string, sort: number | string) => ({
    name,
    cells: { x: { text: String(sort), sort } as OverviewValue },
  });
  const rows = [row('Bo', 5), row('Al', 12), row('Cy', 5)];

  it('sorts by name without a column', () => {
    expect(sortRows(rows, null, false).map((r) => r.name)).toEqual(['Al', 'Bo', 'Cy']);
  });
  it('sorts numbers, not text, and breaks ties by name', () => {
    expect(sortRows(rows, 'x', false).map((r) => r.name)).toEqual(['Bo', 'Cy', 'Al']);
    expect(sortRows(rows, 'x', true).map((r) => r.name)).toEqual(['Al', 'Bo', 'Cy']);
  });
});
