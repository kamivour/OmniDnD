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
      Damage: '1d8 (1d10 two-handed)',
      'Damage Type': 'Slashing',
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
    expect(facts('feats', 'Elemental Adept').Prerequisite).toBe(
      'Ability to cast at least one spell',
    );
    expect(facts('feats', 'Wood Elf Magic').Prerequisite).toBe('Wood elf');
  });

  it('shows 2014 Trident data and keeps magic-specific facts', () => {
    expect(facts('equipment', 'Trident of Fish Command')).toMatchObject({
      Type: 'Weapon',
      Rarity: 'Uncommon',
      'Base item': 'Trident',
      Damage: '1d6 (1d8 two-handed)',
      'Damage Type': 'Piercing',
      Properties: 'Range, Thrown, Versatile',
      Range: '20/60 ft',
      Charges: '3',
      Recharge: '1d3 at dawn',
    });
    const trident = registry.get('item', 'item.trident-of-fish-command');
    expect(trident.category).toBe('magic');
    expect(trident.weapon).toBeUndefined();
  });

  it('shows 2014 expansion weapon and shield bases with published attunement', () => {
    expect(facts('equipment', 'Moon Sickle, +2')).toMatchObject({
      'Base item': 'Sickle',
      Properties: 'Light',
      Damage: '1d4',
      'Damage Type': 'Slashing',
      'Magic bonus': '+2 to attack and damage rolls',
      Attunement: 'Required · Druid or Ranger',
      Rarity: 'Rare',
    });
    expect(facts('equipment', "Devotee's Censer")).toMatchObject({
      'Base item': 'Flail',
      'Damage Type': 'Bludgeoning',
      Attunement: 'Required · Cleric or Paladin',
    });
    expect(facts('equipment', 'Shield of Expression').AC).toBe('+2');
    expect(facts('equipment', 'Walloping Ammunition')).toMatchObject({ Type: 'Ammunition' });
    const gleaming = find('equipment', 'Armor of Gleaming');
    expect(
      Object.fromEntries(entryFacts(gleaming, registry, 'item.leather-armor').facts),
    ).not.toHaveProperty('AC');
    expect(Object.fromEntries(entryFacts(gleaming, registry, 'item.chain-mail').facts).AC).toBe(
      '16',
    );
  });

  it('uses verified base variants and magic overrides without inventing damage', () => {
    const item = find('equipment', 'Flame Tongue');
    expect(Object.fromEntries(entryFacts(item, registry).facts)).toMatchObject({
      'Applies to': 'Any sword',
    });
    expect(Object.fromEntries(entryFacts(item, registry, 'item.rapier').facts)).toMatchObject({
      Damage: '1d8',
      'Damage Type': 'Piercing',
      Properties: 'Finesse',
    });
    expect(Object.fromEntries(entryFacts(item, registry, 'item.halberd').facts)).not.toHaveProperty(
      'Damage',
    );
    expect(facts('equipment', 'Longbow').Range).toBe('150/600 ft');
    expect(facts('equipment', 'Blowgun')).toMatchObject({ Damage: '1', 'Damage Type': 'Piercing' });
    expect(facts('equipment', 'Net')).toMatchObject({ Damage: 'No damage', Range: '5/15 ft' });
    expect(facts('equipment', 'Ammunition, +1')).not.toHaveProperty('Damage');
    expect(facts('equipment', 'Animated Shield').AC).toBe('+2');
    expect(facts('equipment', 'Sun Blade')).toMatchObject({
      'Damage Type': 'Radiant',
      Properties: 'Finesse, Versatile',
      'Magic bonus': '+2 to attack and damage rolls',
    });
    const mithral = find('equipment', 'Mithral Armor');
    const plate = Object.fromEntries(entryFacts(mithral, registry, 'item.plate-armor').facts);
    expect(plate.AC).toBe('18');
    expect(plate).not.toHaveProperty('Strength');
    expect(plate).not.toHaveProperty('Stealth');
  });
});
