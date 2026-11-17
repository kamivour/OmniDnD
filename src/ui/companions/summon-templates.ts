import { SUMMON_PROFILES } from '../../engine/calc/companion-profiles';
import type { Companion } from '../../engine/schema';
import type { CompanionTemplate } from './templates';

/** The editor asks for a form and cast level; engine profiles supply the numbers. */
export const SUMMON_SPELL_TEMPLATES: { spellId: string; template: CompanionTemplate }[] =
  SUMMON_PROFILES.map((spec) => {
    const spellId = 'spell.summon-' + spec.family;
    return {
      spellId,
      template: {
        label: spec.name,
        group: 'Summon spells',
        companion: {
          name: spec.name,
          type: 'summon',
          kind: spec.kind,
          ac: spec.ac + spec.level,
          maxHp: spec.hp,
          speed: spec.forms[0]!.speed,
          abilities: Object.fromEntries(
            ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((key, index) => [
              key,
              spec.abilities[index],
            ]),
          ) as Companion['abilities'],
          attacks: [],
          traits: [],
          uses: [],
          profile: { family: spec.family, form: spec.forms[0]!.name, spellLevel: spec.level },
          limit: { key: spellId, max: 1 },
          sourceId: spellId,
          durationSeconds: 3600,
          notes:
            'Choose a form and the slot level used. Record casting and its slot in Spells; adding this record does not spend a second slot. Hits, saves and target effects remain manual.',
        },
      },
    };
  });
