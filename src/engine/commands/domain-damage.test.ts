import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { spellCastDetails } from './spell-options';
import { freshState } from './test-utils';

function caster(classId: string, subclassId: string, level: number, known: string[]) {
  const state: CharacterState = structuredClone(freshState);
  state.build.classes = [{ classId, level, subclassId }];
  state.build.hpEntries = Array.from({ length: level }, (_, index) => ({
    level: index + 1,
    classId,
    value: index === 0 ? 8 : 5,
    method: index === 0 ? ('max' as const) : ('average' as const),
  }));
  state.build.spells = [{ classId, known, prepared: known }];
  return state;
}

const strike = (state: CharacterState) =>
  computeSheet(state, registry).attacks.find((attack) => attack.instanceId === 'rapier-1')
    ?.extraDamage;

describe('domain and school damage bonuses', () => {
  it('Divine Strike adds once-per-turn weapon damage that grows at cleric 14', () => {
    const life = (level: number) => caster('class.cleric', 'subclass.cleric.life', level, []);
    expect(strike(life(7))).toBeUndefined();
    expect(strike(life(8))).toEqual([
      { dice: '1d8', type: 'radiant', source: 'Divine Strike', oncePerTurn: true },
    ]);
    expect(strike(life(14))?.[0]?.dice).toBe('2d8');
    expect(strike(caster('class.cleric', 'subclass.cleric.war', 8, []))?.[0]?.type).toBe(
      'piercing',
    );
    expect(strike(caster('class.cleric', 'subclass.cleric.nature', 8, []))?.[0]?.type).toEqual([
      'cold',
      'fire',
      'lightning',
    ]);
  });

  it('Potent Spellcasting adds WIS to cleric cantrip damage only', () => {
    const state = caster('class.cleric', 'subclass.cleric.light', 8, [
      'spell.sacred-flame',
      'spell.burning-hands',
    ]);
    const sheet = computeSheet(state, registry);
    const damage = (spellId: string) =>
      spellCastDetails({ ...state, registry, sheet }, { spellId, classId: 'class.cleric' }).damage;
    expect(damage('spell.sacred-flame')?.bonuses).toEqual([
      { name: 'Potent Spellcasting', bonus: sheet.abilities.WIS.mod },
    ]);
    expect(damage('spell.burning-hands')?.bonuses).toBeUndefined();
  });

  it('Empowered Evocation adds INT to wizard evocation damage at wizard 10', () => {
    const wizard = (level: number) =>
      caster('class.wizard', 'subclass.wizard.evocation', level, [
        'spell.fire-bolt',
        'spell.chill-touch',
      ]);
    const bonuses = (level: number, spellId: string) => {
      const state = wizard(level);
      const sheet = computeSheet(state, registry);
      return spellCastDetails({ ...state, registry, sheet }, { spellId, classId: 'class.wizard' })
        .damage?.bonuses;
    };
    expect(bonuses(10, 'spell.fire-bolt')?.[0]?.name).toBe('Empowered Evocation');
    expect(bonuses(9, 'spell.fire-bolt')).toBeUndefined();
    expect(bonuses(10, 'spell.chill-touch')).toBeUndefined();
  });
});
