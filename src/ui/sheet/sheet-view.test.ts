import { describe, expect, it } from 'vitest';
import { parseSheetView, SHEET_VIEWS } from './sheet-view';

describe('parseSheetView', () => {
  it('keeps every known view', () => {
    for (const { id } of SHEET_VIEWS) expect(parseSheetView(id)).toBe(id);
  });

  it('falls back to the whole sheet for missing or unknown values', () => {
    expect(parseSheetView(null)).toBe('all');
    expect(parseSheetView('inventory')).toBe('all');
    expect(parseSheetView(3)).toBe('all');
  });
});
