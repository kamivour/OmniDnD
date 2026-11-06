import { describe, expect, it } from 'vitest';
import { QUICK_TABLES } from './quick-rules';

describe('quick tables', () => {
  it('have unique ids and no empty rows', () => {
    expect(new Set(QUICK_TABLES.map((table) => table.id)).size).toBe(QUICK_TABLES.length);
    for (const table of QUICK_TABLES) {
      expect(table.rows.length).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(row.label.trim()).not.toBe('');
        expect(row.text.trim()).not.toBe('');
      }
    }
  });

  it('lists all six exhaustion levels', () => {
    expect(QUICK_TABLES.find((table) => table.id === 'exhaustion')?.rows).toHaveLength(6);
  });
});
