import { describe, expect, it } from 'vitest';
import { COMPANION_TEMPLATES } from './templates';
import { emptyAttack, emptyForm, fromForm, parseWhole, toForm } from './companion-form';

describe('companion form', () => {
  it('parses whole numbers strictly', () => {
    expect(parseWhole(' 12 ')).toBe(12);
    expect(parseWhole('-1')).toBe(-1);
    expect(parseWhole('12abc')).toBeNull();
    expect(parseWhole('1.5')).toBeNull();
    expect(parseWhole('')).toBeNull();
  });

  it('round-trips every template unchanged', () => {
    for (const { companion } of COMPANION_TEMPLATES) {
      const result = fromForm(toForm(companion), 'id-1');
      expect(result).toEqual({ companion: { ...companion, id: 'id-1' } });
    }
  });

  it('builds a custom companion with attacks, uses, traits and notes', () => {
    const form = emptyForm();
    form.name = ' Owl ';
    form.type = 'familiar';
    form.speed = { walk: '5', fly: '60', swim: '', climb: '', burrow: '' };
    form.attacks = [
      { ...emptyAttack(), name: 'Talons', bonus: '3', dice: '1d4', type: 'slashing' },
    ];
    form.uses = [{ id: 'u1', name: 'Flyby', max: '2', recharge: 'short' }];
    form.traits = 'Sees in the dark\n\n  Keen sight ';
    form.notes = 'Delivers touch spells.';
    const result = fromForm(form, 'owl');
    expect(result).toMatchObject({
      companion: {
        id: 'owl',
        name: 'Owl',
        speed: { walk: 5, fly: 60 },
        attacks: [{ name: 'Talons', bonus: 3, damage: { dice: '1d4', type: 'slashing' } }],
        uses: [{ id: 'u1', name: 'Flyby', max: 2, recharge: 'short' }],
        traits: ['Sees in the dark', 'Keen sight'],
        notes: 'Delivers touch spells.',
      },
    });
  });

  it('keeps owner-derived numbers and hidden fields', () => {
    const derived = { base: 5, ownerLevel: 5 };
    const form = { ...emptyForm(), name: 'Defender', maxHp: derived };
    const result = fromForm(form, 'd', { limit: { key: 'defender', max: 1 }, notes: 'old' });
    expect(result).toMatchObject({
      companion: { maxHp: derived, limit: { key: 'defender', max: 1 } },
    });
    // The form's empty notes win over the old value.
    expect('companion' in result && result.companion.notes).toBeUndefined();
  });

  it('reports the first problem', () => {
    expect(fromForm({ ...emptyForm(), name: '' }, 'x')).toEqual({ error: 'Enter a name.' });
    expect(fromForm({ ...emptyForm(), name: 'A', ac: '12abc' }, 'x')).toEqual({
      error: 'AC must be a whole number.',
    });
    const noType = {
      ...emptyForm(),
      name: 'A',
      attacks: [{ ...emptyAttack(), name: 'Bite', dice: '1d6' }],
    };
    expect(fromForm(noType, 'x')).toEqual({ error: 'Bite: choose a damage type.' });
    const badDice = {
      ...emptyForm(),
      name: 'A',
      attacks: [{ ...emptyAttack(), name: 'Bite', dice: 'd6', type: 'piercing' as const }],
    };
    expect(fromForm(badDice, 'x')).toEqual({ error: 'Bite: damage dice look like 1d6 or 2d8.' });
    const badScore = { ...emptyForm(), name: 'A' };
    badScore.abilities = { ...badScore.abilities, STR: '31' };
    expect(fromForm(badScore, 'x')).toEqual({ error: 'STR must be from 1 to 30.' });
  });
});
