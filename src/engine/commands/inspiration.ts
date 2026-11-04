import { z } from 'zod';
import type { Command } from './runner';
import { block } from './shared';

const SetInspirationPayloadSchema = z.strictObject({ inspired: z.boolean() });

export type SetInspirationPayload = z.infer<typeof SetInspirationPayloadSchema>;

/** A player/DM choice. Older saves retain their absent field until an explicit command. */
export const setInspiration: Command<SetInspirationPayload> = {
  name: 'setInspiration',
  check: (_ctx, payload) =>
    SetInspirationPayloadSchema.safeParse(payload).success
      ? []
      : [block('Inspiration details are invalid')],
  apply: ({ live }, payload) => {
    const { inspired } = SetInspirationPayloadSchema.parse(payload);
    live.inspiration = inspired;
    return `Inspiration ${inspired ? 'on' : 'off'}`;
  },
};
