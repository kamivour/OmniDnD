import { describe, expect, it } from 'vitest';
import { companionStats } from '../engine/calc/companions';
import { computeSheet } from '../engine/calc/sheet';
import { freshState } from '../engine/commands/test-utils';
import { CompanionSchema, type Companion } from '../engine/schema';
import { COMPANION_TEMPLATES } from '../ui/companions/templates';
import { SUMMON_SPELL_TEMPLATES } from '../ui/companions/summon-templates';
import { companionLink } from '../ui/companions/companion-links';
import { registry } from './registry';

describe('M32 Tasha’s spells', () => {
  it('adds the cantrips and high-level spells in the right place', () => {
    expect(registry.get('spell', 'spell.lightning-lure').damage).toMatchObject({
      dice: '1d8',
      type: 'lightning',
    });
    expect(registry.get('spell', 'spell.sword-burst').level).toBe(0);
    expect(registry.get('spell', 'spell.blade-of-disaster').level).toBe(9);
    expect(registry.get('spell', 'spell.dream-of-the-blue-veil').casting).toEqual({
      cost: 'minutes',
      amount: 10,
    });
  });

  it('adds ten Summon spells, each with a stat template and Stats link', () => {
    expect(SUMMON_SPELL_TEMPLATES).toHaveLength(10);
    for (const { spellId, template } of SUMMON_SPELL_TEMPLATES) {
      expect(registry.get('spell', spellId).source).toBe('TCE');
      expect(CompanionSchema.safeParse({ ...template.companion, id: spellId }).success).toBe(true);
      expect(companionLink(spellId)?.template).toBe(template.label);
      expect(COMPANION_TEMPLATES).toContain(template);
    }
  });

  it('a summoned creature attacks with the owner’s spell attack', () => {
    const state = structuredClone(freshState);
    state.build.classes = [{ classId: 'class.wizard', level: 5 }];
    state.build.hpEntries = [];
    const sheet = computeSheet(state, registry);
    const best = Math.max(...sheet.spellcasting.map((entry) => entry.attack.value));
    const beast = SUMMON_SPELL_TEMPLATES[0]!.template.companion;
    const stats = companionStats({ ...beast, id: 'x' } as Companion, { build: state.build, sheet });
    expect(stats.attacks[0]!.bonus).toBe(best);
  });
});
