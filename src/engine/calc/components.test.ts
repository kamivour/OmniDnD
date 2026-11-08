import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { classifyMaterial } from './components';

const spell = (id: string) => registry.get('spell', id);

describe('material components', () => {
  it('treats Shatter as a plain material a focus can cover', () => {
    expect(classifyMaterial(spell('spell.shatter'))).toMatchObject({
      kind: 'plain',
      costGp: 0,
      consumed: false,
    });
  });

  it('treats Revivify as costly and consumed', () => {
    expect(classifyMaterial(spell('spell.revivify'))).toMatchObject({
      kind: 'costly',
      costGp: 300,
      consumed: true,
    });
  });

  it('treats Identify as costly and kept', () => {
    expect(classifyMaterial(spell('spell.identify'))).toMatchObject({
      kind: 'costly',
      costGp: 100,
      consumed: false,
    });
  });

  it('reports none for spells without a material and sums several prices', () => {
    expect(classifyMaterial(spell('spell.fire-bolt')).kind).toBe('none');
    expect(classifyMaterial(spell('spell.astral-projection')).costGp).toBe(1100);
  });
});
