import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { catalogEntries, type CatalogKind } from '../../engine/catalog';
import { entryFacts, featPrerequisite } from './compendium-facts';

const find = (kind: CatalogKind, name: string) => {
  const entry = catalogEntries(registry, kind).find((e) => e.name === name);
  if (!entry) throw new Error(`missing ${name}`);
  return entry;
};
const facts = (kind: CatalogKind, name: string) =>
  Object.fromEntries(entryFacts(find(kind, name), registry).facts);

describe('compendium facts', () => {
  it('spells show casting time, range, components, duration and class lists', () => {
    const f = facts('spells', 'Fireball');
    expect(f['Casting time']).toBe('1 action');
    expect(f.Range).toMatch(/150/);
    expect(f.Components).toMatch(/^V, S, M/);
    expect(f.Save).toBe('DEX');
    expect(f.Classes).toContain('Wizard');
    expect(facts('spells', 'Bless').Duration).toMatch(/^Concentration, /);
  });

  it('classes show hit die, saves, features by level and subclasses', () => {
    const fighter = find('classes', 'Fighter');
    const { facts: f, lists } = entryFacts(fighter, registry);
    expect(Object.fromEntries(f)).toMatchObject({ 'Hit die': 'd10', Saves: 'STR, CON' });
    const features = lists.find((l) => l.title === 'Features by level')!;
    expect(features.items[0]!.level).toBe(1);
    const levels = features.items.map((i) => i.level!);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    const subs = lists.find((l) => l.title === 'Subclasses')!;
    expect(subs.items.some((i) => i.label === 'Champion' && i.id)).toBe(true);
  });

  it('subclasses list granted spells that open as entries', () => {
    const life = find('subclasses', 'Life');
    const spells = entryFacts(life, registry).lists.find(
      (l) => l.title === 'Always prepared spells',
    );
    expect(spells?.items.some((i) => i.label === 'Bless' && i.level === 1)).toBe(true);
  });

  it('races, backgrounds and items show their numbers', () => {
    expect(facts('races', 'Hill Dwarf')).toMatchObject({ Speed: '25 ft', Darkvision: '60 ft' });
    expect(facts('backgrounds', 'Acolyte').Skills).toBe('Insight, Religion');
    expect(facts('equipment', 'Longsword')).toMatchObject({
      Damage: '1d8 slashing (1d10 two-handed)',
      Weapon: 'Martial melee',
    });
    expect(facts('equipment', 'Chain Mail')).toMatchObject({ AC: '16', Stealth: 'Disadvantage' });
    expect(facts('equipment', 'Bag of Holding')).toMatchObject({
      Type: 'Wondrous item',
      Rarity: 'Uncommon',
    });
  });

  it('feats show prerequisites from SRD text or our summary', () => {
    expect(featPrerequisite(find('feats', 'Grappler'))).toMatch(/Strength 13|STR 13/);
    expect(featPrerequisite(find('feats', 'Heavily Armored'))).toBe('Medium armor training');
    expect(featPrerequisite(find('feats', 'Actor'))).toBeUndefined();
    expect(featPrerequisite(find('feats', 'Alert'))).toBeUndefined();
    expect(facts('feats', 'Resilient').Ability).toMatch(/saving throws/);
  });
});
