import { describe, expect, it } from 'vitest';
import { registry } from '../../data/registry';
import { CURRENCY_UNITS, currencyTotals } from '../calc/currency';
import { ExportFileSchema } from '../schema';
import { startCombat, startTurn, useEconomy } from './combat';
import { adjustCurrency, type AdjustCurrencyPayload } from './currency';
import { runCommand } from './runner';
import { freshState, Session } from './test-utils';

function fundedSession() {
  const state = structuredClone(freshState);
  state.live.currency = { cp: 10, sp: 20, ep: 30, gp: 40, pp: 50 };
  const session = new Session(state);
  session.run(startCombat, null);
  session.run(startTurn, null);
  session.run(useEconomy, { kind: 'action', label: 'Existing action' });
  session.run(useEconomy, { kind: 'movement', feet: 5 });
  return session;
}

function reload(session: Session) {
  const json = JSON.stringify({
    app: 'omnidnd',
    schemaVersion: 1,
    exportedAt: '2026-11-06T00:00:00.000Z',
    ...session.state,
    events: session.events,
  });
  const file = ExportFileSchema.parse(JSON.parse(json));
  session.state = { campaign: file.campaign, build: file.build, live: file.live };
  session.events = file.events;
  return json;
}

describe('adjustCurrency', () => {
  it.each(CURRENCY_UNITS)(
    'adds only actual %s coins, preserving all other character state and exact Undo',
    (unit) => {
      const session = fundedSession();
      const before = structuredClone(session.state);
      const old = before.live.currency[unit];
      expect(
        session.run(adjustCurrency, { unit, amount: 3, operation: 'add', expected: old }),
      ).toBe(`Add 3 ${unit} (${old} → ${old + 3})`);
      expect(session.state).toEqual({
        ...before,
        live: { ...before.live, currency: { ...before.live.currency, [unit]: old + 3 } },
      });
      expect(session.events.at(-1)?.command).toBe('adjustCurrency');
      expect(session.events.at(-1)?.patches.map(({ path }) => path)).toEqual([
        ['live', 'currency', unit],
      ]);
      reload(session);
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it.each(CURRENCY_UNITS)(
    'spends the selected %s balance down to zero without exchanging any other coins',
    (unit) => {
      const session = fundedSession();
      const before = structuredClone(session.state);
      const amount = before.live.currency[unit];
      session.run(adjustCurrency, { unit, amount, operation: 'spend', expected: amount });
      expect(session.state).toEqual({
        ...before,
        live: { ...before.live, currency: { ...before.live.currency, [unit]: 0 } },
      });
      session.undo();
      expect(session.state).toEqual(before);
    },
  );

  it('blocks spending unavailable copper even when other denominations have ample value', () => {
    const state = structuredClone(freshState);
    state.live.currency = { cp: 0, sp: 100, ep: 100, gp: 100, pp: 100 };
    const before = structuredClone(state);
    const result = runCommand(
      adjustCurrency,
      state,
      { unit: 'cp', amount: 1, operation: 'spend' },
      registry,
      {
        eventId: 'overspend',
        realTime: '2026-11-06T00:00:00.000Z',
        force: true,
        automation: 'manual',
      },
    );
    expect(result).toEqual({
      result: 'blocked',
      reasons: ['Not enough cp; other coins are not exchanged automatically'],
    });
    expect(state).toEqual(before);
  });

  it.each(CURRENCY_UNITS)(
    'blocks %s overflow in Manual/force while allowing the safe boundary',
    (unit) => {
      const state = structuredClone(freshState);
      state.live.currency[unit] = Number.MAX_SAFE_INTEGER - 1;
      const session = new Session(state);
      session.run(adjustCurrency, { unit, amount: 1, operation: 'add' });
      expect(session.live.currency[unit]).toBe(Number.MAX_SAFE_INTEGER);
      const maxed = structuredClone(session.state);
      const result = runCommand(
        adjustCurrency,
        session.state,
        { unit, amount: 1, operation: 'add' },
        registry,
        {
          eventId: 'overflow',
          realTime: '2026-11-06T00:00:00.000Z',
          force: true,
          automation: 'manual',
        },
      );
      expect(result).toEqual({
        result: 'blocked',
        reasons: [`That addition would exceed the safe ${unit} coin limit`],
      });
      expect(session.state).toEqual(maxed);
      session.undo();
      expect(session.state).toEqual(state);
    },
  );

  it('checks the reviewed selected denomination without discarding newer changes to other coins', () => {
    const state = structuredClone(freshState);
    const expected = state.live.currency.gp;
    state.live.currency.cp = 7;
    state.live.currency.pp = 9;
    state.live.clock.seconds += 60;
    const before = structuredClone(state);
    const session = new Session(state);
    session.run(adjustCurrency, { unit: 'gp', amount: 1, operation: 'add', expected });
    expect(session.live.currency).toEqual({ ...before.live.currency, gp: expected + 1 });
    expect(session.live.clock).toEqual(before.live.clock);
    session.undo();
    expect(session.state).toEqual(before);
  });

  it('blocks a stale selected-count preview even when forced or in Manual', () => {
    const state = structuredClone(freshState);
    const result = runCommand(
      adjustCurrency,
      state,
      { unit: 'gp', amount: 1, operation: 'add', expected: state.live.currency.gp - 1 },
      registry,
      {
        eventId: 'stale-coins',
        realTime: '2026-11-06T00:00:00.000Z',
        force: true,
        automation: 'manual',
      },
    );
    expect(result).toEqual({
      result: 'blocked',
      reasons: ['The gp count changed after review. Refresh the preview.'],
    });
    expect(state).toEqual(freshState);
  });

  it('treats a reviewed zero as a real baseline and blocks repeating the same reviewed adjustment', () => {
    const session = new Session();
    const payload = { unit: 'cp', amount: 1, operation: 'add', expected: 0 } as const;
    session.run(adjustCurrency, payload);
    const before = structuredClone(session.state);
    expect(session.preview(adjustCurrency, payload)).toEqual({
      result: 'blocked',
      reasons: ['The cp count changed after review. Refresh the preview.'],
    });
    expect(session.state).toEqual(before);
    session.undo();
    expect(session.state).toEqual(freshState);
  });

  it.each([
    null,
    {},
    { unit: 'constructor', amount: 1, operation: 'add' },
    { unit: '__proto__', amount: 1, operation: 'add' },
    { unit: 'GP', amount: 1, operation: 'add' },
    { unit: 'gp', amount: 1, operation: 'exchange' },
    { unit: 'gp', amount: 0, operation: 'add' },
    { unit: 'gp', amount: -1, operation: 'spend' },
    { unit: 'gp', amount: 0.5, operation: 'add' },
    { unit: 'gp', amount: NaN, operation: 'add' },
    { unit: 'gp', amount: Infinity, operation: 'add' },
    { unit: 'gp', amount: Number.MAX_SAFE_INTEGER + 1, operation: 'add' },
    { unit: 'gp', amount: '1', operation: 'add' },
    { unit: 'gp', amount: 1, operation: 'add', expected: -1 },
    { unit: 'gp', amount: 1, operation: 'add', expected: Number.MAX_SAFE_INTEGER + 1 },
    { unit: 'gp', amount: 1, operation: 'add', expected: {} },
    { unit: 'gp', amount: 1, operation: 'add', convert: true },
  ])('blocks malformed adjustment %j without mutation in Manual/force', (payload) => {
    const before = structuredClone(freshState);
    const result = runCommand(
      adjustCurrency,
      freshState,
      payload as unknown as AdjustCurrencyPayload,
      registry,
      {
        eventId: 'invalid-coins',
        realTime: '2026-11-06T00:00:00.000Z',
        force: true,
        automation: 'manual',
      },
    );
    expect(result).toEqual({ result: 'blocked', reasons: ['Coin adjustment details are invalid'] });
    expect(freshState).toEqual(before);
  });

  it('keeps large recorded counts JSON-safe while exact derived totals stay out of state and history', () => {
    const state = structuredClone(freshState);
    const max = Number.MAX_SAFE_INTEGER;
    state.live.currency = { cp: max - 1, sp: max, ep: max, gp: max, pp: max };
    const session = new Session(state);
    session.run(adjustCurrency, { unit: 'cp', amount: 1, operation: 'add' });
    expect(currencyTotals(session.live.currency).copper).toBe(10457358334754290551n);
    const json = reload(session);
    expect(json).not.toContain('"copper"');
    expect(json).not.toContain('"coins"');
    expect(Object.values(session.live.currency).every((count) => count === max)).toBe(true);
    session.undo();
    expect(session.state).toEqual(state);
  });

  it('restores successive denomination changes exactly after JSON history reloads', () => {
    const session = fundedSession();
    const before = structuredClone(session.state);
    session.run(adjustCurrency, { unit: 'gp', amount: 5, operation: 'add' });
    const added = structuredClone(session.state);
    session.run(adjustCurrency, { unit: 'sp', amount: 2, operation: 'spend' });
    reload(session);
    session.undo();
    expect(session.state).toEqual(added);
    reload(session);
    session.undo();
    expect(session.state).toEqual(before);
  });
});
