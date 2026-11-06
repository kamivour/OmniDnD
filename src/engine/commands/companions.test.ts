import { describe, expect, it } from 'vitest';
import { companionStats } from '../calc/companions';
import { CharacterBuildSchema, ExportFileSchema, LiveStateSchema, type Companion } from '../schema';
import {
  addCompanion,
  adjustCompanionUse,
  commandCompanion,
  damageCompanion,
  dismissCompanion,
  healCompanion,
  removeCompanion,
  resummonCompanion,
  setCompanionInitiative,
  setCompanionTempHp,
  toggleCompanionCondition,
  updateCompanion,
} from './companions';
import { startCombat, startTurn } from './combat';
import { advanceTime } from './time';
import { completeLongRest, completeShortRest } from './rest';
import { freshState, Session } from './test-utils';

const mastiff: Companion = {
  id: 'mastiff',
  name: 'Mastiff',
  type: 'pet',
  kind: 'Medium beast',
  ac: 12,
  maxHp: 5,
  speed: { walk: 40 },
  abilities: { STR: 13, DEX: 14, CON: 12, INT: 3, WIS: 12, CHA: 7 },
  attacks: [{ name: 'Bite', bonus: 3, damage: { dice: '1d6', bonus: 1, type: 'piercing' } }],
  traits: ['Keen hearing and smell'],
  uses: [{ id: 'howl', name: 'Howl', max: 1, recharge: 'short' }],
};

/** Owner-derived: HP and attack follow the owner (Steel Defender style, using the Fool's CHA). */
const guardian: Companion = {
  id: 'guardian',
  name: 'Guardian',
  type: 'summon',
  ac: { base: 12, ownerProficiency: 1 },
  maxHp: { base: 2, ownerLevel: 5, ownerAbilityMod: 'CHA' },
  speed: { walk: 40 },
  abilities: { STR: 14, DEX: 12, CON: 14, INT: 4, WIS: 10, CHA: 6 },
  attacks: [
    {
      name: 'Slam',
      bonus: { ownerProficiency: 1, ownerAbilityMod: 'CHA' },
      damage: { dice: '1d8', bonus: { ownerProficiency: 1 }, type: 'force' },
    },
  ],
  traits: [],
  uses: [],
  limit: { key: 'guardian', max: 1 },
  durationSeconds: 3600,
};

function withMastiff() {
  const session = new Session(freshState);
  session.run(addCompanion, { companion: mastiff });
  return session;
}

const live = (session: Session, id = 'mastiff') => session.live.companions![id]!;

describe('companion numbers', () => {
  it('follows the owner for derived values', () => {
    const session = new Session(freshState);
    const { level, proficiency, abilities } = session.sheet;
    const stats = companionStats(guardian, { build: session.state.build, sheet: session.sheet });
    expect(stats.maxHp).toBe(2 + 5 * level + abilities.CHA.mod);
    expect(stats.ac).toBe(12 + proficiency);
    expect(stats.attacks[0]).toMatchObject({
      bonus: proficiency + abilities.CHA.mod,
      damage: { dice: '1d8', bonus: proficiency, type: 'force' },
    });
  });

  it('counts only one class level when the formula names a class', () => {
    const session = new Session(freshState);
    const classId = session.state.build.classes[0]!.classId;
    const other = { ...guardian, maxHp: { ownerLevel: 10, classId } };
    const stats = companionStats(other, { build: session.state.build, sheet: session.sheet });
    expect(stats.maxHp).toBe(10 * session.state.build.classes[0]!.level);
    const none = { ...guardian, maxHp: { ownerLevel: 10, classId: 'class.nonexistent' } };
    expect(
      companionStats(none as Companion, { build: session.state.build, sheet: session.sheet }).maxHp,
    ).toBe(1);
  });
});

describe('addCompanion and removeCompanion', () => {
  it('adds with full health and leaves owner state alone, and undo restores everything', () => {
    const session = new Session(freshState);
    const before = structuredClone(session.state);
    expect(session.run(addCompanion, { companion: mastiff })).toBe('Add companion: Mastiff');
    expect(live(session)).toMatchObject({ status: 'active', hp: 5, tempHp: 0, conditions: [] });
    expect(session.live.hp).toBe(before.live.hp);
    expect(CharacterBuildSchema.safeParse(session.state.build).success).toBe(true);
    expect(LiveStateSchema.safeParse(session.live).success).toBe(true);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks duplicates and invalid details', () => {
    const session = withMastiff();
    expect(session.preview(addCompanion, { companion: mastiff }).result).toBe('blocked');
    expect(
      session.preview(addCompanion, { companion: { ...mastiff, id: 'x', name: '' } }).result,
    ).toBe('blocked');
  });

  it('warns past the shared limit and starts the timer for timed summons', () => {
    const session = new Session(freshState);
    session.run(addCompanion, { companion: guardian });
    expect(live(session, 'guardian').endsAt).toBe(session.live.clock.seconds + 3600);
    expect(session.preview(addCompanion, { companion: { ...guardian, id: 'g2' } }).result).toBe(
      'warn',
    );
    session.run(dismissCompanion, { id: 'guardian' });
    expect(session.preview(addCompanion, { companion: { ...guardian, id: 'g2' } }).result).toBe(
      'ok',
    );
  });

  it('removes the definition and live entry together', () => {
    const session = withMastiff();
    session.run(removeCompanion, { id: 'mastiff' });
    expect(session.state.build.companions).toEqual([]);
    expect(session.live.companions).toEqual({});
    expect(session.preview(removeCompanion, { id: 'mastiff' }).result).toBe('blocked');
  });
});

describe('companion health', () => {
  it('temp HP soaks damage first, and 0 HP destroys it', () => {
    const session = withMastiff();
    session.run(setCompanionTempHp, { id: 'mastiff', amount: 3 });
    session.run(setCompanionTempHp, { id: 'mastiff', amount: 2 });
    expect(live(session).tempHp).toBe(3);
    session.run(damageCompanion, { id: 'mastiff', amount: 4 });
    expect(live(session)).toMatchObject({ tempHp: 0, hp: 4, status: 'active' });
    session.run(toggleCompanionCondition, { id: 'mastiff', condition: 'prone' });
    expect(session.run(damageCompanion, { id: 'mastiff', amount: 99 })).toBe(
      'Mastiff takes 99 damage (HP 0); destroyed',
    );
    expect(live(session)).toMatchObject({ hp: 0, status: 'destroyed', conditions: [] });
    expect(session.live.hp).toBe(freshState.live.hp);
    session.undo();
    expect(live(session)).toMatchObject({ hp: 4, status: 'active', conditions: ['prone'] });
  });

  it('heals up to the maximum, and blocks healing a destroyed companion', () => {
    const session = withMastiff();
    session.run(damageCompanion, { id: 'mastiff', amount: 3 });
    session.run(healCompanion, { id: 'mastiff', amount: 10 });
    expect(live(session).hp).toBe(5);
    session.run(damageCompanion, { id: 'mastiff', amount: 5 });
    expect(session.preview(healCompanion, { id: 'mastiff', amount: 1 }).result).toBe('blocked');
    session.run(resummonCompanion, { id: 'mastiff' });
    expect(live(session)).toMatchObject({ hp: 5, status: 'active' });
  });

  it('caps HP when an edit lowers the maximum and drops uses that no longer exist', () => {
    const session = withMastiff();
    session.run(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: 1 });
    session.run(updateCompanion, { companion: { ...mastiff, maxHp: 3, uses: [] } });
    expect(live(session)).toMatchObject({ hp: 3, usesSpent: {} });
  });

  it('keeps derived max HP current when the owner changes', () => {
    const session = new Session(freshState);
    session.run(addCompanion, { companion: guardian });
    const max = live(session, 'guardian').hp;
    session.run(healCompanion, { id: 'guardian', amount: 5 });
    expect(live(session, 'guardian').hp).toBe(max);
  });
});

describe('conditions, uses, initiative', () => {
  it('toggles a condition on and off', () => {
    const session = withMastiff();
    session.run(toggleCompanionCondition, { id: 'mastiff', condition: 'frightened' });
    expect(live(session).conditions).toEqual(['frightened']);
    session.run(toggleCompanionCondition, { id: 'mastiff', condition: 'frightened' });
    expect(live(session).conditions).toEqual([]);
  });

  it('spends and restores uses within limits', () => {
    const session = withMastiff();
    session.run(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: 1 });
    expect(live(session).usesSpent).toEqual({ howl: 1 });
    expect(
      session.preview(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: 1 }).result,
    ).toBe('blocked');
    expect(
      session.preview(adjustCompanionUse, { id: 'mastiff', useId: 'nope', delta: 1 }).result,
    ).toBe('blocked');
    session.run(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: -1 });
    expect(live(session).usesSpent).toEqual({});
    expect(
      session.preview(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: -1 }).result,
    ).toBe('blocked');
  });

  it('short rest restores short uses; long rest restores them too', () => {
    const session = withMastiff();
    session.run(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: 1 });
    session.run(completeShortRest, {});
    expect(live(session).usesSpent).toEqual({});
    session.run(adjustCompanionUse, { id: 'mastiff', useId: 'howl', delta: 1 });
    session.run(completeLongRest, null);
    expect(live(session).usesSpent).toEqual({});
  });

  it('sets and clears initiative', () => {
    const session = withMastiff();
    session.run(setCompanionInitiative, { id: 'mastiff', initiative: 14 });
    expect(live(session).initiative).toBe(14);
    session.run(setCompanionInitiative, { id: 'mastiff', initiative: null });
    expect(live(session).initiative).toBeUndefined();
  });
});

describe('time', () => {
  it('expires a timed companion on the shared clock, not before', () => {
    const session = new Session(freshState);
    session.run(addCompanion, { companion: guardian });
    session.run(advanceTime, { seconds: 3599 });
    expect(live(session, 'guardian').status).toBe('active');
    expect(session.run(advanceTime, { seconds: 1 })).toContain('Guardian expired');
    expect(live(session, 'guardian')).toMatchObject({ status: 'dismissed' });
    expect(live(session, 'guardian').endsAt).toBeUndefined();
    session.run(resummonCompanion, { id: 'guardian' });
    expect(live(session, 'guardian').endsAt).toBe(session.live.clock.seconds + 3600);
  });
});

describe('commandCompanion', () => {
  it('spends the owner economy slot in combat and logs the order', () => {
    const session = withMastiff();
    session.run(startCombat, null);
    session.run(startTurn, null);
    expect(
      session.run(commandCompanion, { id: 'mastiff', slot: 'action', order: 'Attack the goblin' }),
    ).toBe('Command Mastiff (action); Attack the goblin');
    expect(session.live.combat?.economy.actionUsed).toBe(true);
    expect(session.preview(commandCompanion, { id: 'mastiff', slot: 'action' }).result).toBe(
      'warn',
    );
    session.run(commandCompanion, { id: 'mastiff', slot: 'bonus' });
    expect(session.live.combat?.economy.bonusUsed).toBe(true);
    session.undo();
    expect(session.live.combat?.economy.bonusUsed).toBe(false);
    expect(session.live.combat?.economy.actionUsed).toBe(true);
  });

  it('records outside combat without tracking economy, and warns for a downed companion', () => {
    const session = withMastiff();
    session.run(commandCompanion, { id: 'mastiff', slot: 'bonus' });
    expect(session.live.combat).toBeUndefined();
    session.run(damageCompanion, { id: 'mastiff', amount: 5 });
    expect(session.preview(commandCompanion, { id: 'mastiff', slot: 'bonus' }).result).toBe('warn');
  });
});

describe('persistence', () => {
  it('older saves without companions stay valid', () => {
    expect(CharacterBuildSchema.safeParse(freshState.build).success).toBe(true);
    expect(freshState.build.companions).toBeUndefined();
  });

  it('exports and imports with companions, and rejects a mismatched live entry', () => {
    const session = withMastiff();
    const file = {
      app: 'omnidnd' as const,
      schemaVersion: 1 as const,
      exportedAt: '2026-11-06T10:00:00.000Z',
      campaign: session.state.campaign,
      build: session.state.build,
      live: session.live,
      events: [],
    };
    expect(ExportFileSchema.safeParse(file).success).toBe(true);
    expect(
      ExportFileSchema.safeParse({ ...file, live: { ...file.live, companions: {} } }).success,
    ).toBe(false);
    expect(
      ExportFileSchema.safeParse({
        ...file,
        live: {
          ...file.live,
          companions: { ...file.live.companions, ghost: file.live.companions!.mastiff },
        },
      }).success,
    ).toBe(false);
  });
});
