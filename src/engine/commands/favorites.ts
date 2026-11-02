import { z } from 'zod';
import { refId } from '../schema';
import type { Command } from './runner';
import { block } from './shared';

const SetSpellFavoritePayloadSchema = z.strictObject({
  spellId: refId('spell'),
  favorite: z.boolean(),
});

export type SetSpellFavoritePayload = z.infer<typeof SetSpellFavoritePayloadSchema>;

/** Favorites survive spell selection changes; only the chosen reference needs to be a spell. */
export const setSpellFavorite: Command<SetSpellFavoritePayload> = {
  name: 'setSpellFavorite',
  check: ({ registry }, payload) => {
    const parsed = SetSpellFavoritePayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Spell favorite details are invalid')];
    if (registry.entries.get(parsed.data.spellId)?.kind !== 'spell')
      return [block('Choose a spell from the reference library')];
    return [];
  },
  apply: ({ build }, payload, { registry }) => {
    const { spellId, favorite } = SetSpellFavoritePayloadSchema.parse(payload);
    const first = build.favorites.indexOf(spellId);
    if (favorite) {
      if (first < 0) build.favorites.push(spellId);
      else if (first !== build.favorites.lastIndexOf(spellId))
        build.favorites = build.favorites.filter((id, index) => id !== spellId || index === first);
    } else if (first >= 0) build.favorites = build.favorites.filter((id) => id !== spellId);
    return `${favorite ? 'Favorite' : 'Remove favorite'} ${registry.get('spell', spellId).name}`;
  },
};
