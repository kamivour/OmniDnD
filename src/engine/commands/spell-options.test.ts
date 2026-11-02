import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { previewSpellHealing, spellCastDetails } from './spell-options';
import { seedState } from './test-utils';

const HEALING_WORD = 'spell.healing-word';
const DETECT_MAGIC = 'spell.detect-magic';

function context(state = seedState) {
  return { ...state, registry, sheet: computeSheet(state, registry) };
}

function caster(classId: string, known: string[], prepared?: string[]): CharacterState {
  return {
    ...seedState,
    build: {
      ...seedState.build,
      classes: [{ classId, level: 3 }],
      hpEntries: seedState.build.hpEntries.map((entry) => ({ ...entry, classId })),
      spells: [{ classId, known, ...(prepared === undefined ? {} : { prepared }) }],
    },
  };
}

describe('spellCastDetails', () => {
  it('derives upcast healing dice, range, exact modifier and own-words upcast text', () => {
    const details = spellCastDetails(context(), {
      spellId: HEALING_WORD,
      classId: 'class.bard',
      slotLevel: 2,
    });
    expect(details.healing).toEqual({ dice: '2d4', minRoll: 2, maxRoll: 8, modifier: 5 });
    expect(details.casting?.classId).toBe('class.bard');
    expect(details.upcastText).toBe('+1d4 per slot level above 1.');
    expect(details.selected).toBe(true);
  });

  it('does not borrow another caster modifier for a missing or mismatched association', () => {
    for (const classId of ['class.cleric', 'class.fighter', 'class.unknown']) {
      const details = spellCastDetails(context(), { spellId: HEALING_WORD, classId, slotLevel: 2 });
      expect(details.casting).toBeUndefined();
      expect(details.selected).toBe(false);
      expect(details.healing?.modifier).toBeUndefined();
    }
    const unsupported = spellCastDetails(context(caster('class.fighter', [HEALING_WORD])), {
      spellId: HEALING_WORD,
      classId: 'class.fighter',
    });
    expect(unsupported.selected).toBe(true);
    expect(unsupported.casting).toBeUndefined();
    expect(unsupported.healing?.modifier).toBeUndefined();
  });

  it('derives an explicitly chosen owned class modifier for an unknown-spell override (D56)', () => {
    const ctx = context();
    const details = spellCastDetails(ctx, {
      spellId: 'spell.cure-wounds',
      classId: 'class.bard',
      slotLevel: 1,
    });
    expect(details.selected).toBe(false);
    expect(details.casting?.classId).toBe('class.bard');
    expect(details.healing).toEqual({ dice: '1d8', minRoll: 1, maxRoll: 8, modifier: 5 });
    expect(
      spellCastDetails(ctx, { spellId: 'spell.cure-wounds' }).healing?.modifier,
    ).toBeUndefined();
  });

  it('requires an explicit class when the same spell has two casting associations', () => {
    const state: CharacterState = {
      ...seedState,
      build: {
        ...seedState.build,
        classes: [...seedState.build.classes, { classId: 'class.cleric', level: 1 }],
        hpEntries: [
          ...seedState.build.hpEntries,
          { level: 4, classId: 'class.cleric', value: 5, method: 'average' },
        ],
        spells: [...seedState.build.spells, { classId: 'class.cleric', known: [HEALING_WORD] }],
      },
    };
    const ctx = context(state);
    expect(spellCastDetails(ctx, { spellId: HEALING_WORD }).casting).toBeUndefined();
    expect(
      spellCastDetails(ctx, { spellId: HEALING_WORD, classId: 'class.cleric' }).healing?.modifier,
    ).toBe(1);
    expect(
      spellCastDetails(ctx, { spellId: HEALING_WORD, classId: 'class.bard' }).healing?.modifier,
    ).toBe(5);
  });

  it('makes only a known bard ritual eligible without a slot or combat-dependent rule', () => {
    const ctx = context(caster('class.bard', [DETECT_MAGIC]));
    expect(spellCastDetails(ctx, { spellId: DETECT_MAGIC }).ritualEligible).toBe(true);
    expect(
      spellCastDetails(context(caster('class.bard', [], [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      }),
    ).toMatchObject({
      ritualEligible: false,
      ritualReason: 'Detect Magic is not known as a Bard spell',
    });
    expect(spellCastDetails(context(), { spellId: HEALING_WORD }).ritualEligible).toBe(false);
  });

  it('uses the prepared list for cleric rituals and rejects a class without ritual casting', () => {
    expect(
      spellCastDetails(context(caster('class.cleric', [], [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      }).ritualEligible,
    ).toBe(true);
    expect(
      spellCastDetails(context(caster('class.cleric', [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      }),
    ).toMatchObject({
      ritualEligible: false,
      ritualReason: 'Detect Magic is not prepared as a Cleric spell',
    });
    expect(
      spellCastDetails(context(caster('class.sorcerer', [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      }),
    ).toMatchObject({
      ritualEligible: false,
      ritualReason: 'Sorcerer does not grant ritual casting',
    });
  });

  it.each(['class.cleric', 'class.druid', 'class.paladin', 'class.wizard'])(
    'requires normal leveled preparation for %s without hiding known ritual eligibility',
    (classId) => {
      const unprepared = spellCastDetails(context(caster(classId, [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      });
      expect(unprepared).toMatchObject({
        selected: true,
        needsPreparation: true,
        preparedForCasting: false,
      });
      const prepared = spellCastDetails(context(caster(classId, [DETECT_MAGIC], [DETECT_MAGIC])), {
        spellId: DETECT_MAGIC,
      });
      expect(prepared).toMatchObject({ needsPreparation: true, preparedForCasting: true });
      if (classId === 'class.wizard') expect(unprepared.ritualEligible).toBe(true);
    },
  );

  it('does not require cantrip preparation or infer a prepared class from missing known-spell data', () => {
    const wizardCantrip = spellCastDetails(
      context(caster('class.wizard', ['spell.minor-illusion'])),
      {
        spellId: 'spell.minor-illusion',
      },
    );
    expect(wizardCantrip).toMatchObject({ needsPreparation: false, preparedForCasting: true });
    const unsupported = spellCastDetails(context(caster('class.fighter', [DETECT_MAGIC])), {
      spellId: DETECT_MAGIC,
    });
    expect(unsupported).toMatchObject({ needsPreparation: false, preparedForCasting: true });
  });

  it('derives damage upcasting from mechanics and never applies an ability bonus by default', () => {
    expect(
      spellCastDetails(context(), { spellId: 'spell.dissonant-whispers', slotLevel: 2 }).damage,
    ).toEqual({ dice: '4d6', minRoll: 4, maxRoll: 24, modifier: 0, type: 'psychic' });
  });

  it.each<[number, string]>([
    [1, '1d4'],
    [4, '1d4'],
    [5, '2d4'],
    [10, '2d4'],
    [11, '3d4'],
    [16, '3d4'],
    [17, '4d4'],
    [20, '4d4'],
  ])('scales a cantrip at total character level %i to %s', (level, dice) => {
    const ctx = context();
    ctx.sheet.level = level;
    expect(spellCastDetails(ctx, { spellId: 'spell.vicious-mockery' }).damage?.dice).toBe(dice);
  });

  it('never upcasts ritual mechanics even when passed a slot level for a preview', () => {
    const normal = spellCastDetails(context(), { spellId: HEALING_WORD, slotLevel: 2 });
    const ritual = spellCastDetails(context(), {
      spellId: HEALING_WORD,
      slotLevel: 2,
      ritual: true,
    });
    expect(normal.healing?.dice).toBe('2d4');
    expect(ritual.healing?.dice).toBe('1d4');
  });
});

describe('previewSpellHealing', () => {
  it('adds the engine modifier and caps healing without mutating the character', () => {
    const ctx = context();
    const before = structuredClone(ctx.live);
    expect(previewSpellHealing(ctx, { spellId: HEALING_WORD, slotLevel: 2 }, 8)).toEqual({
      amount: 13,
      before: 11,
      after: 19,
    });
    expect(ctx.live).toEqual(before);
  });

  it('rejects invalid roll totals, unsupported modifiers and non-healing spells', () => {
    const ctx = context();
    for (const roll of [1, 9, 2.5, Number.NaN])
      expect(
        previewSpellHealing(ctx, { spellId: HEALING_WORD, slotLevel: 2 }, roll),
      ).toBeUndefined();
    expect(
      previewSpellHealing(
        ctx,
        { spellId: HEALING_WORD, classId: 'class.fighter', slotLevel: 2 },
        2,
      ),
    ).toBeUndefined();
    expect(previewSpellHealing(ctx, { spellId: 'spell.minor-illusion' }, 1)).toBeUndefined();
  });

  it('floors healing with a negative modifier and never lowers HP already over its maximum', () => {
    const ctx = context();
    ctx.sheet.abilities.CHA.mod = -3;
    expect(previewSpellHealing(ctx, { spellId: HEALING_WORD, slotLevel: 1 }, 1)).toEqual({
      amount: 0,
      before: 11,
      after: 11,
    });
    ctx.live = { ...ctx.live, hp: 22 };
    expect(previewSpellHealing(ctx, { spellId: HEALING_WORD, slotLevel: 1 }, 4)).toEqual({
      amount: 1,
      before: 22,
      after: 22,
    });
  });
});
