import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { materialCover } from './focus';

const spell = (id: string) => registry.get('spell', id);

describe('material cover by focus', () => {
  it('lets a Bard flute cover Shatter', () => {
    const cover = materialCover(spell('spell.shatter'), 'class.bard', ['item.flute'], registry);
    expect(cover).toMatchObject({ status: 'covered', by: 'Flute' });
    expect(cover.note).toBe('Material covered by your Flute');
  });

  it('warns a Bard without an instrument', () => {
    const cover = materialCover(spell('spell.shatter'), 'class.bard', [], registry);
    expect(cover.status).toBe('uncovered');
    expect(cover.note).toContain('mica');
  });

  it('does not accept the wrong focus for a class', () => {
    const cover = materialCover(spell('spell.shatter'), 'class.wizard', ['item.amulet'], registry);
    expect(cover.status).toBe('uncovered');
    expect(
      materialCover(spell('spell.shatter'), 'class.wizard', ['item.wand'], registry).status,
    ).toBe('covered');
    expect(
      materialCover(spell('spell.shatter'), 'class.cleric', ['item.amulet'], registry).status,
    ).toBe('covered');
    expect(
      materialCover(spell('spell.shatter'), 'class.druid', ['item.totem'], registry).status,
    ).toBe('covered');
  });

  it('accepts a component pouch for any class, but a Ranger has no other focus', () => {
    expect(
      materialCover(spell('spell.shatter'), 'class.ranger', ['item.component-pouch'], registry)
        .status,
    ).toBe('covered');
    expect(
      materialCover(spell('spell.shatter'), 'class.ranger', ['item.wand'], registry).status,
    ).toBe('uncovered');
  });

  it('never covers a costly material and says so', () => {
    const identify = materialCover(
      spell('spell.identify'),
      'class.wizard',
      ['item.wand', 'item.component-pouch'],
      registry,
    );
    expect(identify.status).toBe('costly');
    expect(identify.note).toContain('100 gp');
    expect(identify.note).toContain('not used up');
    const revivify = materialCover(spell('spell.revivify'), 'class.cleric', [], registry);
    expect(revivify.note).toContain('300 gp');
    expect(revivify.note).toContain('consumed');
  });

  it('is silent for spells without a material', () => {
    expect(materialCover(spell('spell.fire-bolt'), 'class.wizard', [], registry).note).toBe('');
  });
});
