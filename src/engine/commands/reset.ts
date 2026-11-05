import { z } from 'zod';
import { computeSheet } from '../calc/sheet';
import { CampaignSchema, CharacterBuildSchema, LiveStateSchema } from '../schema';
import { equalData } from './management';
import type { Command, CommandContext } from './runner';
import { block } from './shared';

const ResetCharacterPayloadSchema = z.strictObject({
  /** A reviewed baseline, never a replacement for the current character. */
  expected: z
    .strictObject({ campaign: CampaignSchema, build: CharacterBuildSchema, live: LiveStateSchema })
    .optional(),
});

export type ResetCharacterPayload = z.infer<typeof ResetCharacterPayloadSchema>;

function prepare(ctx: CommandContext, input: ResetCharacterPayload) {
  const parsed = ResetCharacterPayloadSchema.safeParse(input);
  if (!parsed.success) return { checks: [block('Reset details are invalid')] };
  const current = { campaign: ctx.campaign, build: ctx.build, live: ctx.live };
  if (parsed.data.expected && !equalData(parsed.data.expected, current))
    return {
      checks: [
        block(
          'The character or campaign changed after this reset was reviewed. Review Reset again.',
        ),
      ],
    };

  // D107: this is a live-state reset, not a rest or a replacement build. Item charges and
  // Inspiration have no implicit recovery rule; inventory, time and the rest limit survive.
  const live = {
    ...ctx.live,
    tempHp: 0,
    deathSaves: { success: 0, fail: 0 },
    hitDiceSpent: {},
    slotsUsed: ctx.live.slotsUsed.map(() => 0),
    featureUsesSpent: {},
    effects: [],
    conditions: [],
    exhaustion: 0,
  };
  delete live.pactSlotsUsed;
  delete live.concentration;
  delete live.combat;
  try {
    // Exhaustion and effects must be gone before deriving the full HP target.
    const maxHp = computeSheet({ ...current, live }, ctx.registry).maxHp.value;
    if (!Number.isSafeInteger(maxHp) || maxHp < 1)
      return { checks: [block('Reset produces an unsafe maximum HP value')] };
    live.hp = maxHp;
    if (!LiveStateSchema.safeParse(live).success)
      return { checks: [block('Reset produces invalid live state')] };
    return { checks: [], live };
  } catch {
    return { checks: [block('Reset could not be calculated. Review the character records.')] };
  }
}

/** Refill tracked resources and clear session conditions without advancing game time. */
export const resetCharacter: Command<ResetCharacterPayload> = {
  name: 'resetCharacter',
  check: (ctx, input) => prepare(ctx, input).checks,
  apply: (draft, input, ctx) => {
    const next = prepare(ctx, input);
    if (!next.live) throw new Error('Invalid reset reached Apply');
    draft.live = next.live;
    return `Reset character; HP ${ctx.live.hp} → ${next.live.hp}; resources refilled; combat, conditions and effects cleared`;
  },
};
