import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { registry } from '../data/registry';
import { seedFile } from '../data/seed';
import { CLASS_START, slotChoices } from './calc/class-start';
import { computeSheet } from './calc/sheet';
import { createCharacter, type CreateCharacterInput, type GuidedChoices } from './creation';

function input(patch: Partial<CreateCharacterInput> = {}): CreateCharacterInput {
  return {
    id: 'guided',
    name: 'Guided',
    campaign: { ...structuredClone(seedFile.campaign), sources: ['PHB', 'TCE'] },
    raceId: 'race.half-elf',
    classId: 'class.fighter',
    backgroundId: 'background.charlatan',
    level: 1,
    abilityBases: { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 10, CHA: 12 },
    racialChoices: ['DEX', 'CON'],
    ...patch,
  };
}

const fighterGuided = (patch: Partial<GuidedChoices> = {}): GuidedChoices => ({
  skills: ['athletics', 'perception'],
  equipment: [
    { option: 0 },
    { option: 0, slots: ['item.longsword'] },
    { option: 0 },
    { option: 0 },
  ],
  ...patch,
});

describe('class start table', () => {
  it('only names items, slots and skills the data has', () => {
    for (const [classId, start] of Object.entries(CLASS_START)) {
      expect(registry.entries.get(classId)?.kind, classId).toBe('class');
      for (const id of [...start.tools, ...start.weapons.filter((w) => w.startsWith('item.'))])
        expect(registry.entries.get(id)?.kind, id).toBe('item');
      for (const step of start.equipment)
        for (const option of step.options)
          for (const entry of option.items) {
            if (entry.itemId)
              expect(registry.entries.get(entry.itemId)?.kind, entry.itemId).toBe('item');
            if (entry.slot)
              expect(slotChoices(entry.slot, registry).length, entry.slot).toBeGreaterThan(0);
          }
    }
  });

  it('covers every class in the data', () => {
    const classes = [...registry.entries.values()]
      .filter((e) => e.kind === 'class')
      .map((e) => e.id);
    for (const id of classes) expect(CLASS_START[id], id).toBeDefined();
  });
});

describe('guided createCharacter', () => {
  it('grants class proficiencies, skills and the chosen kit; equips armor and shield', () => {
    const created = createCharacter(
      input({
        guided: fighterGuided({
          equipment: [
            { option: 0 },
            { option: 0, slots: ['item.longsword'] },
            { option: 0 },
            { option: 0 },
          ],
        }),
      }),
      registry,
    );
    expect(created.build.proficiencies.skills).toEqual(
      expect.arrayContaining(['deception', 'athletics', 'perception']),
    );
    expect(created.build.proficiencies.armor).toEqual(['light', 'medium', 'heavy', 'shield']);
    expect(created.build.proficiencies.weapons).toEqual(['simple', 'martial']);
    const itemIds = created.build.items.map((row) => row.itemId);
    expect(itemIds).toEqual([
      'item.chain-mail',
      'item.longsword',
      'item.shield',
      'item.crossbow-light',
      'item.crossbow-bolt',
      'item.dungeoneers-pack',
    ]);
    const bolts = created.build.items.find((row) => row.itemId === 'item.crossbow-bolt')!;
    expect(created.live.items[bolts.instanceId]).toMatchObject({ qty: 20, equipped: false });
    const sheet = computeSheet({ campaign: input().campaign, ...created }, registry);
    expect(sheet.ac.value).toBe(18);
  });

  it('builds a Wizard 3 with a six-spell book plus two per level', () => {
    const created = createCharacter(
      input({
        classId: 'class.wizard',
        level: 3,
        abilityBases: { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 10, CHA: 12 },
        guided: {
          skills: ['arcana', 'investigation'],
          equipment: [{ option: 0 }, { option: 0 }, { option: 0 }, { option: 0 }],
          spells: {
            add: [
              'spell.fire-bolt',
              'spell.mage-hand',
              'spell.light',
              'spell.magic-missile',
              'spell.shield',
              'spell.sleep',
              'spell.detect-magic',
              'spell.mage-armor',
              'spell.identify',
              'spell.burning-hands',
              'spell.charm-person',
              'spell.thunderwave',
              'spell.feather-fall',
            ],
          },
        },
        hpRolls: [3, 3],
      }),
      registry,
    );
    const known = created.build.spells.find((row) => row.classId === 'class.wizard')!.known;
    expect(known).toHaveLength(13);
  });

  it('builds a Warlock and a Sorcerer with their known spells', () => {
    const warlock = createCharacter(
      input({
        classId: 'class.warlock',
        guided: {
          skills: ['arcana', 'intimidation'],
          equipment: [
            { option: 0 },
            { option: 0 },
            { option: 0 },
            { option: 0, slots: ['item.dagger'] },
          ],
          spells: {
            add: [
              'spell.eldritch-blast',
              'spell.minor-illusion',
              'spell.charm-person',
              'spell.hellish-rebuke',
            ],
          },
        },
      }),
      registry,
    );
    expect(warlock.build.spells[0]!.known).toHaveLength(4);
    const sorcerer = createCharacter(
      input({
        classId: 'class.sorcerer',
        guided: {
          skills: ['arcana', 'persuasion'],
          equipment: [{ option: 0 }, { option: 0 }, { option: 0 }, { option: 0 }],
          spells: {
            add: [
              'spell.fire-bolt',
              'spell.light',
              'spell.mage-hand',
              'spell.prestidigitation',
              'spell.magic-missile',
              'spell.shield',
            ],
          },
        },
      }),
      registry,
    );
    expect(sorcerer.build.spells[0]!.known).toHaveLength(6);
  });

  it('needs the right skill count, list and kit', () => {
    const fail = (guided: GuidedChoices) =>
      expect(() => createCharacter(input({ guided }), registry)).toThrow(ZodError);
    fail(fighterGuided({ skills: ['athletics'] }));
    fail(fighterGuided({ skills: ['athletics', 'arcana'] }));
    fail(fighterGuided({ skills: ['athletics', 'deception'] }));
    fail(fighterGuided({ equipment: [{ option: 0 }] }));
    fail(
      fighterGuided({ equipment: [{ option: 9 }, { option: 0 }, { option: 0 }, { option: 0 }] }),
    );
    fail(
      fighterGuided({
        equipment: [
          { option: 0 },
          { option: 0, slots: ['item.dagger-of-venom'] },
          { option: 0 },
          { option: 0 },
        ],
      }),
    );
  });

  it('keeps blank creation unchanged', () => {
    const created = createCharacter(input(), registry);
    expect(created.build.items).toEqual([]);
    expect(created.build.proficiencies.armor).toEqual([]);
  });
});
