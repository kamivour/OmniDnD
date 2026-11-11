import { describe, expect, it } from 'vitest';
import { ALIGNMENTS, alignmentLabel } from './new-character';

describe('alignments', () => {
  it('lists True Neutral and reads old "Neutral" as True Neutral', () => {
    expect(ALIGNMENTS).toContain('True Neutral');
    expect(ALIGNMENTS).not.toContain('Neutral');
    expect(alignmentLabel('Neutral')).toBe('True Neutral');
    expect(alignmentLabel('Chaotic Neutral')).toBe('Chaotic Neutral');
  });
});
