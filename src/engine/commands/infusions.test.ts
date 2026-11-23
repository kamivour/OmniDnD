import { describe, it, expect } from 'vitest';
import { registry } from '../../data/registry';
import { CharacterBuildSchema, LiveStateSchema } from '../schema';
import { freshState, Session } from './test-utils';
import { completeLongRest } from './rest';
import { infuseItem, endInfusion } from './infusions';
import { resolveChoices } from './resolve-choices';
import { pendingChoices } from '../calc/pending-choices';
import {
  COMMON_REPLICA_PREFIX,
  HOMUNCULUS_INFUSION,
  INFUSION_PREFIX,
  infusionLimit,
  activeInfusions,
  infusionDefenses,
  REPLICATE_INFUSION,
  REPLICATE_RECIPES,
} from '../calc/infusions';
import { computeSheet } from '../calc/sheet';
import { replicaItem } from '../calc/infusion-replicas';
import { levelUp } from './level';
import { commandCompanion, damageCompanion } from './companions';
import { startCombat, startTurn } from './combat';
import { companionStats } from '../calc/companions';

function artificer(level = 2) {
  const state = structuredClone(freshState);
  state.build.classes = [{ classId: 'class.artificer', level }];
  state.build.hpEntries = Array.from({ length: level }, (_, i) => ({
    level: i + 1,
    classId: 'class.artificer',
    method: i ? ('average' as const) : ('max' as const),
    value: i ? 5 : 8,
  }));
  state.build.spells = [];
  state.build.featureIds = [
    'enhanced-weapon',
    'enhanced-defense',
    'repeating-shot',
    'enhanced-arcane-focus',
  ].map((s) => INFUSION_PREFIX + s);
  state.build.items = [
    ['sword', 'item.shortsword'],
    ['shield', 'item.shield'],
    ['bow', 'item.shortbow'],
  ].map(([instanceId, itemId]) => ({ instanceId: instanceId!, itemId: itemId! }));
  state.live.items = Object.fromEntries(
    state.build.items.map((i) => [i.instanceId, { qty: 1, equipped: true, attuned: false }]),
  );
  state.live.lastLongRestEnd = state.live.clock.seconds;
  return state;
}
const weapon = { featureId: INFUSION_PREFIX + 'enhanced-weapon', instanceId: 'sword' };
describe('infusing inventory', () => {
  it('uses one slot for a Homunculus, scales its stats and releases the slot on destruction', () => {
    const state = artificer(5);
    state.build.featureIds.push(HOMUNCULUS_INFUSION);
    state.build.abilityScores.bonuses = [];
    state.build.abilityScores.base.INT = 16;
    state.build.items.push({ instanceId: 'heart', itemId: 'item.crystal' });
    state.live.items.heart = { qty: 1, equipped: false, attuned: false };
    const session = new Session(state);
    const infusion = { featureId: HOMUNCULUS_INFUSION, instanceId: 'heart' };
    expect(session.try(infuseItem, infusion).result).toBe('blocked');
    session.run(infuseItem, { ...infusion, materialConfirmed: true });
    const companion = session.state.build.companions![0]!;
    expect(activeInfusions(session.state.build, session.live)).toEqual([
      { ...infusion, companionId: companion.id },
    ]);
    expect(
      companionStats(companion, { build: session.state.build, sheet: session.sheet }),
    ).toMatchObject({
      ac: 13,
      maxHp: 9,
      attacks: [
        { name: 'Force Strike', bonus: 6, damage: { dice: '1d4', bonus: 3, type: 'force' } },
      ],
    });
    session.run(startCombat, null);
    session.run(startTurn, null);
    expect(session.try(commandCompanion, { id: companion.id, slot: 'action' }).result).toBe(
      'blocked',
    );
    session.run(commandCompanion, { id: companion.id, slot: 'bonus' });
    expect(session.live.combat?.economy).toMatchObject({ actionUsed: false, bonusUsed: true });
    session.run(damageCompanion, { id: companion.id, amount: 9 });
    expect(session.live.infusions).toEqual([]);
    expect(session.live.items.heart?.qty).toBe(1);
    expect(session.live.companions?.[companion.id]).toMatchObject({ status: 'destroyed', hp: 0 });
    session.undo();
    expect(session.live.companions?.[companion.id]).toMatchObject({ status: 'active', hp: 9 });
    expect(session.live.infusions).toHaveLength(1);
  });

  it('tracks a replica in its original inventory entry and ends it when the recipe is replaced', () => {
    const state = artificer();
    const featureId = `${REPLICATE_INFUSION}-bag-of-holding`;
    state.campaign.sources = ['PHB', 'TCE'];
    state.campaign.hpMethod = 'average';
    state.build.featureIds.push(featureId);
    state.build.items.push({ instanceId: 'bag', itemId: 'item.backpack' });
    state.build.items.find(({ instanceId }) => instanceId === 'sword')!.container = 'bag';
    state.live.items.bag = { qty: 1, equipped: false, attuned: false };
    const session = new Session(state);
    expect(session.try(infuseItem, { featureId, instanceId: 'shield' }).result).toBe('blocked');
    session.run(infuseItem, { featureId, instanceId: 'bag' });
    expect(session.state.build.items.at(-1)?.itemId).toBe('item.bag-of-holding');
    expect(activeInfusions(session.state.build, session.live)).toContainEqual({
      featureId,
      instanceId: 'bag',
      replicaBaseItemId: 'item.backpack',
    });
    const replicated = structuredClone(session.state);
    session.run(levelUp, {
      classId: 'class.artificer',
      infusionSwap: { remove: featureId, add: `${INFUSION_PREFIX}returning-weapon` },
    });
    expect(session.state.build.items.at(-1)?.itemId).toBe('item.backpack');
    expect(
      session.state.build.items.find(({ instanceId }) => instanceId === 'sword')?.container,
    ).toBeUndefined();
    expect(session.live.infusions).toEqual([]);
    session.undo();
    expect(session.state).toEqual(replicated);
    session.run(endInfusion, { instanceId: 'bag' }, true);
    expect(session.state.build.items.at(-1)?.itemId).toBe('item.backpack');
    session.undo();
    expect(session.state).toEqual(replicated);
  });

  it('resolves every named and concrete common replica recipe', () => {
    const ids = [
      ...REPLICATE_RECIPES.map(({ id }) => id),
      ...[...registry.entries.keys()].filter((id) => id.startsWith(COMMON_REPLICA_PREFIX)),
    ];
    expect(ids.filter((id) => !replicaItem(registry, id))).toEqual([]);
  });
  it('computes weapon bonuses by artificer level, not total level; reload and Undo restore exactly', () => {
    const state = artificer();
    const session = new Session(state);
    const before = session.sheet.attacks.find((a) => a.instanceId === 'sword')!;
    session.run(infuseItem, weapon);
    const next = session.sheet.attacks.find((a) => a.instanceId === 'sword')!;
    expect(next.toHit.value).toBe(before.toHit.value + 1);
    expect(next.damage!.bonus).toBe(before.damage!.bonus + 1);
    expect(
      computeSheet(
        { ...session.state, live: LiveStateSchema.parse(JSON.parse(JSON.stringify(session.live))) },
        registry,
      ).attacks,
    ).toEqual(session.sheet.attacks);
    session.undo();
    expect(session.state).toEqual(state);
    const high = new Session(artificer(10));
    high.run(infuseItem, weapon);
    expect(high.sheet.attacks.find((a) => a.instanceId === 'sword')!.toHit.value).toBe(
      computeSheet(artificer(10), registry).attacks.find((a) => a.instanceId === 'sword')!.toHit
        .value + 2,
    );
  });
  it('counts armor bonuses without requiring attunement and only while equipped', () => {
    const session = new Session(artificer());
    const ac = session.sheet.ac.value;
    session.run(infuseItem, {
      featureId: INFUSION_PREFIX + 'enhanced-defense',
      instanceId: 'shield',
    });
    expect(session.sheet.ac.value).toBe(ac + 1);
    const state = structuredClone(session.state);
    state.live.items.shield!.equipped = false;
    expect(computeSheet(state, registry).ac.value).toBe(ac - 2);
  });
  it('gates repeating-shot bonuses on attunement and removes loading only when active', () => {
    const session = new Session(artificer());
    const hit = session.sheet.attacks.find((a) => a.instanceId === 'bow')!.toHit.value;
    session.run(infuseItem, { featureId: INFUSION_PREFIX + 'repeating-shot', instanceId: 'bow' });
    expect(session.sheet.attacks.find((a) => a.instanceId === 'bow')!.toHit.value).toBe(hit);
    session.undo();
    session.run(infuseItem, {
      featureId: INFUSION_PREFIX + 'repeating-shot',
      instanceId: 'bow',
      attune: true,
    });
    expect(session.sheet.attacks.find((a) => a.instanceId === 'bow')!.toHit.value).toBe(hit + 1);
    expect(session.live.items.bow!.attuned).toBe(true);
  });
  it('preserves applications through long rests and restores them when ending is undone', () => {
    const session = new Session(artificer());
    session.run(infuseItem, weapon);
    session.run(completeLongRest, null, true);
    expect(session.live.infusions).toEqual([weapon]);
    expect(session.try(endInfusion, { instanceId: 'sword' }).result).toBe('warn');
    session.run(endInfusion, { instanceId: 'sword' }, true);
    expect(session.live.infusions).toEqual([]);
    session.undo();
    expect(session.live.infusions).toEqual([weapon]);
  });
  it('requires review before ending the oldest application at the limit', () => {
    const session = new Session(artificer());
    session.run(infuseItem, weapon);
    session.run(infuseItem, {
      featureId: INFUSION_PREFIX + 'enhanced-defense',
      instanceId: 'shield',
    });
    const next = { featureId: INFUSION_PREFIX + 'repeating-shot', instanceId: 'bow' };
    expect(session.try(infuseItem, next).result).toBe('warn');
    session.run(infuseItem, next, true);
    expect(session.live.infusions?.map((i) => i.instanceId)).toEqual(['shield', 'bow']);
    session.undo();
    expect(session.live.infusions?.map((i) => i.instanceId)).toEqual(['sword', 'shield']);
  });
  it('blocks unknown, duplicate, unsuitable and stacked applications, including forced commands', () => {
    const session = new Session(artificer());
    expect(
      session.try(infuseItem, { ...weapon, featureId: INFUSION_PREFIX + 'radiant-weapon' }, true)
        .result,
    ).toBe('blocked');
    expect(session.try(infuseItem, { ...weapon, instanceId: 'shield' }, true).result).toBe(
      'blocked',
    );
    session.state.live.items.sword!.qty = 2;
    expect(session.try(infuseItem, weapon, true).result).toBe('blocked');
    session.state.live.items.sword!.qty = 1;
    session.run(infuseItem, weapon);
    expect(session.try(infuseItem, weapon, true).result).toBe('blocked');
    const missing = structuredClone(session.state);
    delete missing.live.items.sword;
    expect(computeSheet(missing, registry).attacks.some((a) => a.instanceId === 'sword')).toBe(
      false,
    );
  });
  it('keeps older saves unchanged and computes the active limit from artificer levels', () => {
    expect(LiveStateSchema.parse(freshState.live)).not.toHaveProperty('infusions');
    expect(CharacterBuildSchema.safeParse(artificer().build).success).toBe(true);
    expect([1, 2, 6, 10, 14, 18].map((n) => infusionLimit(artificer(n).build))).toEqual([
      0, 2, 3, 4, 5, 6,
    ]);
  });
  it('keeps away items in the infusion limit without giving their owner bonuses', () => {
    const session = new Session(artificer());
    session.run(infuseItem, weapon);
    const hit = session.sheet.attacks.find((a) => a.instanceId === 'sword')!.toHit.value;
    const state = structuredClone(session.state);
    state.live.items.sword!.equipped = false;
    expect(activeInfusions(state.build, state.live)).toHaveLength(1);
    expect(computeSheet(state, registry).attacks.some((a) => a.instanceId === 'sword')).toBe(false);
    state.live.items.sword!.qty = 0;
    expect(activeInfusions(state.build, state.live)).toHaveLength(1);
    expect(hit).toBeGreaterThan(0);
  });
  it('computes focus bonuses without changing spell DC and checks attunement capacity', () => {
    const state = artificer(10);
    state.build.items.push({ instanceId: 'focus', itemId: 'item.rod' });
    state.live.items.focus = { qty: 1, equipped: true, attuned: false };
    const session = new Session(state);
    const before = session.sheet.spellcasting[0]!;
    session.run(infuseItem, {
      featureId: INFUSION_PREFIX + 'enhanced-arcane-focus',
      instanceId: 'focus',
      attune: true,
    });
    expect(session.sheet.spellcasting[0]!.attack.value).toBe(before.attack.value + 2);
    expect(session.sheet.spellcasting[0]!.saveDc).toEqual(before.saveDc);
    const capped = artificer();
    for (const item of Object.values(capped.live.items)) item.attuned = true;
    const full = new Session(capped);
    full.state.live.items.bow!.attuned = false;
    full.state.live.items.extra = { qty: 1, equipped: false, attuned: true };
    full.state.build.items.push({ instanceId: 'extra', itemId: 'item.candle' });
    expect(
      full.try(infuseItem, {
        featureId: INFUSION_PREFIX + 'repeating-shot',
        instanceId: 'bow',
        attune: true,
      }).result,
    ).toBe('blocked');
  });
  it.each(['fire', 'force', 'psychic'] as const)(
    'shows %s resistance when the infused armor is worn and attuned',
    (damageType) => {
      const state = artificer(6);
      state.build.featureIds.push(INFUSION_PREFIX + 'resistant-armor');
      state.build.items.push({ instanceId: 'armor', itemId: 'item.leather-armor' });
      state.live.items.armor = { qty: 1, equipped: true, attuned: false };
      const session = new Session(state);
      const input = {
        featureId: INFUSION_PREFIX + 'resistant-armor',
        instanceId: 'armor',
        damageType,
        attune: true,
      };
      expect(session.try(infuseItem, { ...input, damageType: 'slashing' }).result).toBe('blocked');
      session.run(infuseItem, input);
      expect(
        infusionDefenses(session.state.build, session.live, registry)[0]?.defenses.resistances,
      ).toEqual([damageType]);
      expect(session.live.hp).toBe(state.live.hp);
    },
  );
});

describe('learning replicate recipes', () => {
  const recipe = (slug: string) => `${REPLICATE_INFUSION}-${slug}`;
  const picks = (state: ReturnType<typeof artificer>) =>
    pendingChoices(state, registry).find((item) => item.prefix === INFUSION_PREFIX);

  it.each([
    [2, 8],
    [6, 16],
    [10, 37],
    [14, 49],
  ])('offers the full cumulative replica table at Artificer %i', (level, count) => {
    const state = artificer(level);
    state.campaign.sources = ['PHB', 'TCE'];
    state.build.featureIds = [];
    const ids = picks(state)?.optionIds ?? [];
    const tableIds = ids.filter(
      (id) => id.startsWith(`${REPLICATE_INFUSION}-`) && !id.startsWith(COMMON_REPLICA_PREFIX),
    );
    expect(tableIds).toHaveLength(count);
  });

  it('learns two separate level-2 recipes, keeps the legacy slot and undoes them together', () => {
    const state = artificer();
    state.campaign.sources = ['PHB', 'TCE'];
    state.build.featureIds = [REPLICATE_INFUSION];
    const session = new Session(state);
    const classId = 'class.artificer';
    const learn = (...features: string[]) => ({ classId, choices: { features } });
    expect(session.preview(resolveChoices, learn(recipe('ring-of-the-ram'))).result).toBe(
      'blocked',
    );
    const low = [recipe('bag-of-holding'), recipe('sending-stones')];
    session.run(resolveChoices, learn(...low));
    expect(session.state.build.featureIds).toEqual([REPLICATE_INFUSION, ...low]);
    expect(picks(session.state)?.count).toBe(1);
    expect(session.preview(resolveChoices, learn(low[0]!)).result).toBe('blocked');
    session.undo();
    expect(session.state.build.featureIds).toEqual([REPLICATE_INFUSION]);
    expect(new Set(REPLICATE_RECIPES.map(({ id }) => id)).size).toBe(49);
  });
});
