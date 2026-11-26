import { describe, expect, it } from 'vitest';
import { ALIGNMENTS, alignmentLabel } from './new-character';

describe('alignments', () => {
  it('lists True Neutral and reads old "Neutral" as True Neutral', () => {
    expect(ALIGNMENTS).toContain('True Neutral');
    expect(ALIGNMENTS).not.toContain('Neutral');
    expect(alignmentLabel('Neutral')).toBe('True Neutral');
    expect(alignmentLabel('Chaotic Neutral')).toBe('Chaotic Neutral');
  });

  it('reads as a 3×3 grid: law to chaos across, good to evil down', () => {
    const rows = [0, 1, 2].map((row) => ALIGNMENTS.slice(row * 3, row * 3 + 3));
    for (const [row, moral] of ['Good', 'Neutral', 'Evil'].entries()) {
      expect(rows[row]!.map((name) => name.split(' ')[0])).toEqual(
        ['Lawful', 'Neutral', 'Chaotic'].map((ethic, col) =>
          row === 1 && col === 1 ? 'True' : ethic,
        ),
      );
      expect(rows[row]!.every((name) => name.endsWith(moral))).toBe(true);
    }
  });
});
