import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { seedFile } from '../../data/seed';
import { computeSheet, type CharacterState } from '../../engine/calc/sheet';
import {
  castSpell,
  endTurn,
  startCombat,
  startTurn,
  useEconomy,
  useFeature,
} from '../../engine/commands';
import { Session } from '../../engine/commands/test-utils';
import { buildRegistry, type Registry } from '../../engine/registry';
import type { FeatureDef } from '../../engine/schema';
import { combatModel, combatSpellsForEconomy } from './combat-model';

function state(): CharacterState {
  return structuredClone(seedFile);
}

function model(character: CharacterState, refs: Registry = registry) {
  return combatModel(character, computeSheet(character, refs), refs);
}

function equip(character: CharacterState, itemId: string, instanceId = itemId) {
  character.build.items.push({ itemId, instanceId });
  character.live.items[instanceId] = { qty: 1, equipped: true, attuned: false };
}

function extraFeatures(...features: FeatureDef[]): Registry {
  return buildRegistry([[...registry.entries.values(), ...features]], [], []);
}

function spellSession(): Session {
  const character = state();
  character.build.spells = [
    {
      classId: 'class.bard',
      known: [
        'spell.vicious-mockery',
        'spell.healing-word',
        'spell.shillelagh',
        'spell.shield',
        'spell.mending',
        'spell.find-familiar',
        'spell.dissonant-whispers',
      ],
    },
  ];
  character.live.slotsUsed = character.live.slotsUsed.map(() => 0);
  const session = new Session(character);
  session.run(startCombat, null);
  session.run(startTurn, null);
  return session;
}

function visibleSpellIds(session: Session): string[] {
  return combatSpellsForEconomy(model(session.state).spells.entries, session.live, registry).map(
    ({ spell }) => spell.id,
  );
}

describe('combatModel', () => {
  it('uses equipped weapon instances and live shared feature resources from the character', () => {
    const character = state();
    character.live.featureUsesSpent['feature.bard.bardic-inspiration'] = 4;
    const result = model(character);
    expect(result.weapons.map(({ attack }) => attack.name)).toEqual(['Rapier', 'Dagger']);
    expect(result.weapons[0]?.attack).toMatchObject({
      id: 'item.rapier',
      toHit: 4,
      damage: '1d8+2',
      damageType: 'piercing',
    });
    const inspiration = result.features.find(({ feature }) =>
      feature.id.endsWith('bardic-inspiration'),
    );
    const cuttingWords = result.features.find(({ feature }) =>
      feature.id.endsWith('cutting-words'),
    );
    expect(inspiration?.feature).toMatchObject({
      cost: 'BA',
      uses: { max: 5, used: 4, die: 'd6', recharge: 'Long rest' },
    });
    expect(cuttingWords?.feature).toMatchObject({
      cost: 'R',
      uses: { max: 5, used: 4, die: 'd6', recharge: 'Long rest · Uses Bardic Inspiration' },
    });
    expect(cuttingWords?.meta).toBe('1 / 5 left · d6 · Long rest · Uses Bardic Inspiration');
    expect(cuttingWords?.remainingUses).toBe(1);
    expect(result.spells.entries).toHaveLength(8);
    expect(result.spells.slots).toEqual([
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 2, used: 0 },
    ]);
  });

  it('keeps identical equipped weapons distinct and excludes unequipped items', () => {
    const character = state();
    equip(character, 'item.dagger', 'second-dagger');
    const daggers = model(character).weapons.filter(({ attack }) => attack.id === 'item.dagger');
    expect(daggers).toHaveLength(2);
    expect(new Set(daggers.map(({ instanceId }) => instanceId)).size).toBe(2);
    character.live.items['second-dagger']!.equipped = false;
    expect(
      model(character).weapons.filter(({ attack }) => attack.id === 'item.dagger'),
    ).toHaveLength(1);
  });

  it('preserves flat damage, no-damage weapons, ranged identity, range and versatile details', () => {
    const character = state();
    equip(character, 'item.blowgun');
    equip(character, 'item.net');
    equip(character, 'item.longsword');
    const result = model(character);
    const blowgun = result.weapons.find(({ attack }) => attack.id === 'item.blowgun');
    expect(blowgun).toMatchObject({
      type: 'ranged',
      attack: { damage: '3', damageType: 'piercing' },
    });
    expect(blowgun?.attack.notes).toContain('Not proficient');
    expect(blowgun?.attack.notes).toContain('Range 25/100 ft');
    const net = result.weapons.find(({ attack }) => attack.id === 'item.net');
    expect(net).toMatchObject({ type: 'ranged' });
    expect(net?.attack).not.toHaveProperty('damage');
    expect(net?.attack).not.toHaveProperty('damageType');
    const longsword = result.weapons.find(({ attack }) => attack.id === 'item.longsword');
    expect(longsword).toMatchObject({
      type: 'melee',
      attack: { damage: '1d8', damageType: 'slashing' },
    });
    expect(longsword?.attack.notes).toContain('Versatile 1d10');
    expect(longsword?.attack.notes).toContain('Proficient');
  });

  it('formats negative modifiers without altering the engine’s dice or flat totals', () => {
    const character = state();
    character.build.abilityScores.base.STR = 6;
    character.build.abilityScores.base.DEX = 6;
    character.build.abilityScores.bonuses = [];
    equip(character, 'item.blowgun');
    equip(character, 'item.longsword');
    const result = model(character);
    expect(result.weapons.find(({ attack }) => attack.id === 'item.blowgun')?.attack.damage).toBe(
      '0',
    );
    const longsword = result.weapons.find(({ attack }) => attack.id === 'item.longsword');
    expect(longsword?.attack.damage).toBe('1d8-2');
    expect(longsword?.attack.notes).toContain('Versatile 1d10-2');
  });

  it('excludes passive/special activations and reports exhausted or missing pools honestly', () => {
    const character = state();
    const resource: FeatureDef = {
      ...registry.get('feature', 'feature.bard.bardic-inspiration'),
      id: 'feature.test.no-dice',
      name: 'No dice resource',
      activation: 'action',
      uses: { max: 3, recharge: 'short' },
    };
    delete resource.die;
    const missing: FeatureDef = {
      ...registry.get('feature', 'feature.bard.cutting-words'),
      id: 'feature.test.missing-pool',
      name: 'Missing pool',
      usesFrom: 'feature.darkvision',
    };
    character.build.featureIds.push(resource.id, missing.id);
    character.live.featureUsesSpent['feature.bard.bardic-inspiration'] = 7;
    const result = model(character, extraFeatures(resource, missing));
    expect(result.features.map(({ feature }) => feature.cost)).toEqual(['BA', 'R', 'A', 'R']);
    expect(
      result.features.find(({ feature }) => feature.id.endsWith('cutting-words'))
        ?.unavailableReason,
    ).toBe('No Bardic Inspiration uses left');
    expect(
      result.features.find(({ feature }) => feature.id.endsWith('cutting-words'))?.remainingUses,
    ).toBe(0);
    const noDice = result.features.find(({ feature }) => feature.id === resource.id);
    expect(noDice?.feature.uses).toMatchObject({
      max: 3,
      used: 0,
      die: '',
      recharge: 'Short rest',
    });
    expect(noDice?.meta).toBe('3 / 3 left · Short rest');
    expect(
      result.features.find(({ feature }) => feature.id === missing.id)?.unavailableReason,
    ).toBe("Missing pool's required resource pool is unavailable");
  });

  it('retains spell class ownership and does not invent actions for an empty character selection', () => {
    const character = state();
    character.build.spells.push({ classId: 'class.wizard', known: ['spell.minor-illusion'] });
    const result = model(character);
    expect(
      result.spells.entries
        .filter(({ spell }) => spell.id === 'spell.minor-illusion')
        .map(({ classId }) => classId),
    ).toEqual(['class.bard', 'class.wizard']);
    expect(result.spells.unsupportedClassIds).toEqual(['class.wizard']);
    character.build.spells = [];
    for (const item of Object.values(character.live.items)) item.equipped = false;
    const empty = model(character);
    expect(empty.weapons).toEqual([]);
    expect(empty.spells.entries).toEqual([]);
    expect(empty.spells.slots).toHaveLength(2);
  });

  it('does not mutate character, sheet or registry while constructing display data', () => {
    const character = state();
    const sheet = computeSheet(character, registry);
    const beforeCharacter = structuredClone(character);
    const beforeSheet = structuredClone(sheet);
    const beforeEntries = structuredClone([...registry.entries]);
    const result = combatModel(character, sheet, registry);
    result.features[0]!.feature.lines.push('Display-only text');
    result.weapons[0]!.attack.notes = 'Display-only notes';
    expect(character).toEqual(beforeCharacter);
    expect(sheet).toEqual(beforeSheet);
    expect([...registry.entries]).toEqual(beforeEntries);
  });

  it('limits default spell-tab visibility by current economy while retaining the complete model', () => {
    const character = state();
    character.build.spells = [
      {
        classId: 'class.bard',
        known: [
          'spell.vicious-mockery',
          'spell.healing-word',
          'spell.shield',
          'spell.mending',
          'spell.find-familiar',
        ],
      },
    ];
    const entries = model(character).spells.entries;
    expect(combatSpellsForEconomy(entries, character.live, registry)).toEqual(entries);
    character.live.combat = {
      round: 1,
      turnActive: true,
      economy: {
        actionUsed: false,
        bonusUsed: false,
        reactionUsed: false,
        movementUsed: 0,
        objectInteractionUsed: false,
        bonusActionSpellCast: false,
        otherSpellCast: false,
      },
    };
    const combat = character.live.combat;
    expect(combatSpellsForEconomy(entries, character.live, registry)).toHaveLength(5);
    // Minute/hour choices stay under Action; their casting warnings remain engine-owned.
    expect(
      combatSpellsForEconomy(entries, character.live, registry).filter(({ spell }) =>
        / (min|h)$/.test(spell.cost),
      ),
    ).toHaveLength(2);
    combat.turnActive = false;
    expect(
      combatSpellsForEconomy(entries, character.live, registry).map(({ spell }) => spell.id),
    ).toEqual(['spell.shield']);
    combat.turnActive = true;
    combat.economy.actionUsed = true;
    expect(
      combatSpellsForEconomy(entries, character.live, registry).map(({ spell }) => spell.id),
    ).toEqual(['spell.healing-word', 'spell.shield']);
    combat.economy.reactionUsed = true;
    expect(
      combatSpellsForEconomy(entries, character.live, registry).map(({ spell }) => spell.id),
    ).toEqual(['spell.healing-word']);
    combat.economy.bonusUsed = true;
    expect(combatSpellsForEconomy(entries, character.live, registry)).toEqual([]);
    expect(entries).toHaveLength(5);
  });

  it.each([{ spellId: 'spell.healing-word', slotLevel: 1 }, { spellId: 'spell.shillelagh' }])(
    'shows only available 1-action cantrips after casting $spellId',
    (cast) => {
      const session = spellSession();
      session.run(castSpell, cast);
      expect(visibleSpellIds(session)).toEqual(['spell.vicious-mockery']);
      expect(model(session.state).spells.entries).toHaveLength(7);
    },
  );

  it.each(['spell.dissonant-whispers', 'spell.shield'])(
    'excludes bonus-action spells after an earlier %s cast on this turn',
    (spellId) => {
      const session = spellSession();
      session.run(castSpell, { spellId, slotLevel: 1 });
      const visible = visibleSpellIds(session);
      expect(visible).not.toContain('spell.healing-word');
      expect(visible).not.toContain('spell.shillelagh');
      expect(visible).toContain(
        spellId === 'spell.shield' ? 'spell.dissonant-whispers' : 'spell.shield',
      );
    },
  );

  it('permits bonus-action spells after a 1-action cantrip', () => {
    const session = spellSession();
    session.run(castSpell, { spellId: 'spell.vicious-mockery' });
    expect(visibleSpellIds(session)).toEqual([
      'spell.shillelagh',
      'spell.healing-word',
      'spell.shield',
    ]);
  });

  it('does not infer a spell restriction from a nonspell bonus action', () => {
    const session = spellSession();
    session.run(useFeature, { featureId: 'feature.bard.bardic-inspiration' });
    expect(visibleSpellIds(session)).toContain('spell.dissonant-whispers');
    expect(visibleSpellIds(session)).toContain('spell.shield');
    expect(visibleSpellIds(session)).not.toContain('spell.healing-word');
    session.run(useEconomy, { kind: 'bonus', release: true });
    expect(visibleSpellIds(session)).toContain('spell.healing-word');
  });

  it('ends the spell restriction off-turn while keeping spent reactions until the next turn', () => {
    const session = spellSession();
    session.run(castSpell, { spellId: 'spell.healing-word', slotLevel: 1 });
    expect(visibleSpellIds(session)).not.toContain('spell.shield');
    session.run(endTurn, null);
    expect(visibleSpellIds(session)).toEqual(['spell.shield']);
    session.run(castSpell, { spellId: 'spell.shield', slotLevel: 1 });
    expect(visibleSpellIds(session)).toEqual([]);
    session.run(startTurn, null);
    expect(visibleSpellIds(session)).toHaveLength(7);
  });

  it('filters a view without changing selected or unsupported class spell entries', () => {
    const session = spellSession();
    session.state = structuredClone(session.state);
    session.state.build.spells.push({
      classId: 'class.wizard',
      known: ['spell.vicious-mockery', 'spell.healing-word'],
    });
    session.run(castSpell, { spellId: 'spell.healing-word', slotLevel: 1 });
    const characterBefore = structuredClone(session.state);
    const refsBefore = structuredClone([...registry.entries]);
    const full = model(session.state).spells;
    const entriesBefore = structuredClone(full.entries);
    const visible = combatSpellsForEconomy(full.entries, session.live, registry);
    expect(visible.map(({ spell, classId }) => [spell.id, classId])).toEqual([
      ['spell.vicious-mockery', 'class.bard'],
      ['spell.vicious-mockery', 'class.wizard'],
    ]);
    expect(full.entries).toHaveLength(9);
    expect(full.unsupportedClassIds).toEqual(['class.wizard']);
    expect(full.entries).toEqual(entriesBefore);
    expect(session.state).toEqual(characterBefore);
    expect([...registry.entries]).toEqual(refsBefore);
  });
});
