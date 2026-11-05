import { z } from 'zod';
import { CURRENCY_UNITS } from '../calc/currency';
import type { Command } from './runner';
import { block } from './shared';

const AdjustCurrencyPayloadSchema = z.strictObject({
  unit: z.enum(CURRENCY_UNITS),
  amount: z.int().positive(),
  operation: z.enum(['add', 'spend']),
  /** The reviewed selected coin count; other denominations remain independent. */
  expected: z.int().nonnegative().optional(),
});

export type AdjustCurrencyPayload = z.infer<typeof AdjustCurrencyPayloadSchema>;

/** Record actual coins received or spent; never exchange denominations or acquire items. */
export const adjustCurrency: Command<AdjustCurrencyPayload> = {
  name: 'adjustCurrency',
  check: ({ live }, input) => {
    const parsed = AdjustCurrencyPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Coin adjustment details are invalid')];
    const { unit, amount, operation, expected } = parsed.data;
    const balance = live.currency[unit];
    if (expected !== undefined && expected !== balance)
      return [block(`The ${unit} count changed after review. Refresh the preview.`)];
    if (operation === 'spend' && amount > balance)
      return [block(`Not enough ${unit}; other coins are not exchanged automatically`)];
    if (operation === 'add' && amount > Number.MAX_SAFE_INTEGER - balance)
      return [block(`That addition would exceed the safe ${unit} coin limit`)];
    return [];
  },
  apply: (draft, { unit, amount, operation }, { live }) => {
    const before = live.currency[unit];
    const after = operation === 'add' ? before + amount : before - amount;
    draft.live.currency[unit] = after;
    return `${operation === 'add' ? 'Add' : 'Spend'} ${amount} ${unit} (${before} → ${after})`;
  },
};
