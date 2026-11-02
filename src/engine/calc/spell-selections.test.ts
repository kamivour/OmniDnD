import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { freshState } from '../commands/test-utils';
import { buildRegistry, type Registry } from '../registry';
import { computeSheet, type CharacterState } from './sheet';
import { spellSelectionDetails } from './spell-selections';

function caster(classId: string, level = 3, reference = registry): CharacterState {
  const die = Number(reference.get('class', classId).hitDie.slice(1));
  return {
    ...freshState,
    build: {
      ...freshState.build,
      classes: [{ classId, level }],
      hpEntries: Array.from({ length: level }, (_, index) => ({
        level: index + 1,
        classId,
        value: index === 0 ? die : die / 2 + 1,
        method: index === 0 ? ('max' as const) : ('average' as const),
      })),
      spells: [],
    },
  };
}

function context(state = freshState, reference: Registry = registry) {
  return { ...state, registry: reference, sheet: computeSheet(state, reference) };
}

describe('spellSelectionDetails', () => {
  it('derives The Fool’s separate distinct known and cantrip counts from class data', () => {
    const details = spellSelectionDetails(context(), 'class.bard');
    expect(details).toMatchObject({ mode: 'known', classLevel: 3, maxSpellLevel: 2 });
    expect(details.cantrips).toMatchObject({ count: 2, limit: 2 });
    expect(details.known).toMatchObject({ count: 6, limit: 6 });
    expect(details.prepared.count).toBe(0);
    expect(details.prepared.limit).toBeUndefined();
    expect(details.warnings).toEqual([]);
  });

  it.each([
    ['class.bard', 3, 'known', 2, 6, undefined, 2],
    ['class.sorcerer', 3, 'known', 4, 4, undefined, 2],
    ['class.ranger', 5, 'known', 0, 4, undefined, 2],
    ['class.warlock', 20, 'known', 4, 15, undefined, 5],
    ['class.cleric', 3, 'prepared', 3, undefined, 4, 2],
    ['class.druid', 3, 'prepared', 2, undefined, 4, 2],
    ['class.paladin', 5, 'prepared', 0, undefined, 7, 2],
    ['class.wizard', 3, 'spellbook', 3, undefined, 4, 2],
    ['class.paladin', 1, 'prepared', 0, undefined, 0, 0],
    ['class.ranger', 1, 'known', 0, 0, undefined, 0],
  ] as const)(
    '%s %i has mode %s and base class caps',
    (classId, level, mode, cantrips, known, prepared, maxSpellLevel) => {
      const details = spellSelectionDetails(context(caster(classId, level)), classId);
      expect(details.mode).toBe(mode);
      expect(details.cantrips.limit).toBe(cantrips);
      expect(details.known.limit).toBe(known);
      expect(details.prepared.limit).toBe(prepared);
      expect(details.maxSpellLevel).toBe(maxSpellLevel);
    },
  );

  it('floors prepared limits at one once spellcasting is available', () => {
    const state = caster('class.wizard', 1);
    const ctx = context(state);
    ctx.sheet.abilities.INT.mod = -4;
    expect(spellSelectionDetails(ctx, 'class.wizard').prepared.limit).toBe(1);
  });

  it('uses the individual class maximum rather than the combined multiclass slot pool', () => {
    const state = caster('class.bard', 5);
    state.build = {
      ...state.build,
      classes: [...state.build.classes, { classId: 'class.wizard', level: 1 }],
      hpEntries: [
        ...state.build.hpEntries,
        { level: 6, classId: 'class.wizard', value: 4, method: 'average' },
      ],
    };
    const ctx = context(state);
    expect(ctx.sheet.slots.max[3]).toBeGreaterThan(0);
    const wizard = spellSelectionDetails(ctx, 'class.wizard');
    expect(wizard.maxSpellLevel).toBe(1);
    expect(wizard.candidates.known).not.toContain('spell.invisibility');
    expect(wizard.candidates.known).not.toContain('spell.fireball');
    expect(spellSelectionDetails(ctx, 'class.bard').maxSpellLevel).toBe(3);
  });

  it('offers only enabled class-list candidates at a learnable level', () => {
    const details = spellSelectionDetails(context(caster('class.bard')), 'class.bard');
    expect(details.candidates.cantrips).toContain('spell.minor-illusion');
    expect(details.candidates.known).toContain('spell.healing-word');
    expect(details.candidates.known).toContain('spell.invisibility');
    expect(details.candidates.known).not.toContain('spell.fireball');
    expect(details.candidates.known).not.toContain('spell.hypnotic-pattern');
    expect(details.candidates.prepared).toEqual([]);
    const disabled = context({
      ...freshState,
      campaign: { ...freshState.campaign, sources: ['HB'] },
    });
    const retained = spellSelectionDetails(disabled, 'class.bard');
    expect(retained.candidates).toEqual({ cantrips: [], known: [], prepared: [] });
    expect(retained.selection.known).toEqual(freshState.build.spells[0]!.known);
    expect(retained.warnings.some((warning) => warning.includes('source is not enabled'))).toBe(
      true,
    );
  });

  it('prepares from a Wizard book without imposing a book limit or silently adding orphan entries', () => {
    const state = caster('class.wizard');
    state.build.spells = [
      {
        classId: 'class.wizard',
        known: [
          'spell.minor-illusion',
          'spell.detect-magic',
          'spell.magic-missile',
          'spell.fireball',
        ],
        prepared: ['spell.detect-magic', 'spell.shield', 'spell.minor-illusion'],
      },
    ];
    const details = spellSelectionDetails(context(state), 'class.wizard');
    expect(details.known).toMatchObject({ count: 3 });
    expect(details.known.limit).toBeUndefined();
    expect(details.prepared).toMatchObject({
      ids: ['spell.detect-magic', 'spell.shield', 'spell.minor-illusion'],
      count: 2,
      limit: 4,
    });
    expect(details.candidates.prepared).toEqual(['spell.detect-magic', 'spell.magic-missile']);
    expect(details.selection.known).not.toContain('spell.shield');
    expect(details.warnings).toContain('Shield is prepared but is not in your Wizard spellbook.');
    expect(details.warnings).toContain(
      'Minor Illusion is a cantrip; it is learned rather than prepared.',
    );
    expect(details.warnings).toContain("Fireball exceeds Wizard's level 2 spell limit.");
  });

  it('merges duplicate class records without mutating retained choices or double counting', () => {
    const state = caster('class.cleric');
    state.build.spells = [
      { classId: 'class.cleric', known: ['spell.light', 'spell.light'], prepared: ['spell.bless'] },
      {
        classId: 'class.cleric',
        known: ['spell.guidance', 'spell.healing-word'],
        prepared: ['spell.bless', 'spell.guidance'],
      },
    ];
    const before = structuredClone(state);
    const details = spellSelectionDetails(context(state), 'class.cleric');
    expect(details.selection).toEqual({
      known: ['spell.light', 'spell.guidance', 'spell.healing-word'],
      prepared: ['spell.bless', 'spell.guidance'],
    });
    expect(details.cantrips.count).toBe(2);
    expect(details.known.count).toBe(1);
    expect(details.prepared.count).toBe(1);
    expect(details.candidates.known).toEqual([]);
    expect(details.candidates.prepared).toContain('spell.healing-word');
    expect(state).toEqual(before);
  });

  it('keeps invalid and over-limit selections with warnings instead of trimming them', () => {
    const state = caster('class.bard', 1);
    state.build.spells = [
      {
        classId: 'class.bard',
        known: [
          'spell.healing-word',
          'spell.cure-wounds',
          'spell.faerie-fire',
          'spell.disguise-self',
          'spell.invisibility',
          'spell.fireball',
        ],
        prepared: ['spell.healing-word'],
      },
    ];
    const before = structuredClone(state);
    const details = spellSelectionDetails(context(state), 'class.bard');
    expect(details.known).toMatchObject({ count: 6, limit: 4 });
    expect(details.warnings).toContain('Bard: 6/4 known spells exceeds the base class limit.');
    expect(details.warnings).toContain('Fireball is not on the Bard spell list.');
    expect(details.warnings).toContain(
      'Bard normally learns Healing Word rather than preparing it.',
    );
    expect(state).toEqual(before);
  });

  it('limits ordinary Warlock choices to Pact Magic levels without offering Mystic Arcanum', () => {
    const details = spellSelectionDetails(context(caster('class.warlock', 20)), 'class.warlock');
    expect(details.maxSpellLevel).toBe(5);
    expect(details.candidates.known.length).toBeGreaterThan(0);
    expect(details.candidates.known.every((id) => registry.get('spell', id).level <= 5)).toBe(true);
    expect(details.candidates.known).not.toContain('spell.circle-of-death');
  });

  it('retains unsupported and unowned class choices without invented caps or candidates', () => {
    const state = caster('class.fighter');
    state.build.spells = [
      { classId: 'class.fighter', known: ['spell.detect-magic'] },
      { classId: 'class.bard', known: ['spell.minor-illusion'], prepared: ['spell.healing-word'] },
    ];
    for (const classId of ['class.fighter', 'class.bard']) {
      const details = spellSelectionDetails(context(state), classId);
      expect(details.mode).toBe('unsupported');
      expect(details.cantrips.limit).toBeUndefined();
      expect(details.known.limit).toBeUndefined();
      expect(details.prepared.limit).toBeUndefined();
      expect(details.candidates).toEqual({ cantrips: [], known: [], prepared: [] });
      expect(details.selection.known.length).toBeGreaterThan(0);
      expect(details.warnings.length).toBeGreaterThan(0);
      expect(details.warnings.some((warning) => warning.includes('level 0 spell limit'))).toBe(
        false,
      );
    }
  });

  it('does not infer homebrew preparation or a book limit from absent known-spell data', () => {
    const custom = {
      ...registry.get('class', 'class.wizard'),
      id: 'class.custom',
      source: 'HB' as const,
    };
    const reference = buildRegistry([[...registry.entries.values(), custom]], [], []);
    const details = spellSelectionDetails(
      context(caster('class.custom', 3, reference), reference),
      'class.custom',
    );
    expect(details.mode).toBe('unsupported');
    expect(details.maxSpellLevel).toBe(0);
    expect(details.prepared.limit).toBeUndefined();
    expect(details.known.limit).toBeUndefined();
    expect(details.candidates).toEqual({ cantrips: [], known: [], prepared: [] });
  });
});
