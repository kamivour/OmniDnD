import { describe, expect, it } from 'vitest';
import { freshState } from '../../engine/commands/test-utils';
import type { ActiveEffect } from '../../engine/schema';
import { buildEffect, effectFields, emptyEffectFields } from './effect-editor-model';
import { damageDefenseLines, effectTimingText } from './effects-model';

const now = freshState.live.clock.seconds;

describe('effect editor fields', () => {
  it('builds a timed effect with numeric bonuses and damage defenses', () => {
    const form = emptyEffectFields(true);
    form.name = 'Stoneskin';
    form.amount = '3';
    form.modifiers.ac = '+2';
    form.modifiers.speed = '-10';
    form.damage.fire = 'resistances';
    form.damage.poison = 'immunities';
    form.note = '  from the wizard ';
    expect(buildEffect(form)).toEqual({
      errors: [],
      fields: {
        name: 'Stoneskin',
        durationSeconds: 18,
        conditions: [],
        modifiers: [
          { target: 'ac', value: 2 },
          { target: 'speed', value: -10 },
        ],
        defenses: { resistances: ['fire'], immunities: ['poison'] },
        note: 'from the wizard',
      },
    });
  });

  it('reports bad numbers instead of guessing', () => {
    const form = emptyEffectFields(false);
    form.name = 'x';
    form.unit = 'minutes';
    form.amount = '0';
    form.modifiers.saves = '1.5';
    expect(buildEffect(form).errors).toEqual([
      'Enter a duration of 1 or more.',
      'Saving throws must be a whole number, like +2 or -1.',
    ]);
  });

  it('round-trips a saved effect and keeps modifier kinds the form cannot show', () => {
    const effect: ActiveEffect = {
      id: 'effect.x',
      name: 'Blessing',
      endsAt: now + 120,
      concentration: false,
      conditions: ['invisible'],
      modifiers: [
        { target: 'ac', value: 1 },
        { target: 'unproficient-checks', value: { proficiency: 'half' } },
      ],
      defenses: { vulnerabilities: ['cold'], saveAdvantages: ['charmed'] },
      endsOn: { event: 'long-rest' },
    };
    const form = effectFields(effect, freshState.live);
    expect(form).toMatchObject({ amount: '2', unit: 'minutes', endsOn: 'long-rest' });
    expect(form.modifiers.ac).toBe('1');
    expect(form.damage.cold).toBe('vulnerabilities');
    expect(buildEffect(form, effect).fields).toEqual({
      name: 'Blessing',
      durationSeconds: 120,
      endsOn: 'long-rest',
      conditions: ['invisible'],
      modifiers: [
        { target: 'unproficient-checks', value: { proficiency: 'half' } },
        { target: 'ac', value: 1 },
      ],
      defenses: { vulnerabilities: ['cold'], saveAdvantages: ['charmed'] },
    });
  });

  it('shows remaining time in rounds when it fits, otherwise seconds', () => {
    const base = { id: 'e', name: 'e', concentration: false, conditions: [], modifiers: [] };
    expect(effectFields({ ...base, endsAt: now + 54 }, freshState.live)).toMatchObject({
      amount: '9',
      unit: 'rounds',
    });
    expect(effectFields({ ...base, endsAt: now + 7 }, freshState.live)).toMatchObject({
      amount: '7',
      unit: 'seconds',
    });
  });
});

describe('effect list text', () => {
  it('combines time left with the end trigger', () => {
    const base = { id: 'e', name: 'e', concentration: false, conditions: [], modifiers: [] };
    expect(effectTimingText({ ...base, endsOn: { event: 'short-rest' } }, freshState.live)).toBe(
      'Until a short or long rest',
    );
    expect(
      effectTimingText(
        { ...base, endsAt: now + 60, endsOn: { event: 'long-rest' } },
        freshState.live,
      ),
    ).toBe('1 min left, or until a long rest');
  });

  it('merges defenses from several sources', () => {
    expect(
      damageDefenseLines([
        { defenses: { resistances: ['fire'] } },
        {},
        { defenses: { resistances: ['fire', 'cold'], immunities: ['poison'] } },
      ]),
    ).toEqual(['Resistant: fire, cold', 'Immune: poison']);
  });
});
