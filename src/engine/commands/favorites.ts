import { z } from 'zod';
import { refId } from '../schema';
import type { Command } from './runner';
import { block } from './shared';

const SetSpellFavoritePayloadSchema = z.strictObject({
  spellId: refId('spell'),
  favorite: z.boolean(),
});

export type SetSpellFavoritePayload = z.infer<typeof SetSpellFavoritePayloadSchema>;

/** Only the chosen reference is normalized; unrelated legacy favorites keep their order. */
function updateFavorite(build: { favorites: string[] }, id: string, favorite: boolean) {
  const first = build.favorites.indexOf(id);
  if (favorite) {
    if (first < 0) build.favorites.push(id);
    else if (first !== build.favorites.lastIndexOf(id))
      build.favorites = build.favorites.filter((value, index) => value !== id || index === first);
  } else if (first >= 0) build.favorites = build.favorites.filter((value) => value !== id);
}

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
    updateFavorite(build, spellId, favorite);
    return `${favorite ? 'Favorite' : 'Remove favorite'} ${registry.get('spell', spellId).name}`;
  },
};

const SetQuickAccessFavoritePayloadSchema = z.strictObject({
  refId: z.union([refId('spell'), refId('feature'), refId('item')]),
  favorite: z.boolean(),
});

export type SetQuickAccessFavoritePayload = z.infer<typeof SetQuickAccessFavoritePayloadSchema>;

/** Selection changes retain favorites; removing a stale reference is explicit cleanup. */
export const setQuickAccessFavorite: Command<SetQuickAccessFavoritePayload> = {
  name: 'setQuickAccessFavorite',
  check: ({ registry }, payload) => {
    const parsed = SetQuickAccessFavoritePayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Quick Access favorite details are invalid')];
    const { refId, favorite } = parsed.data;
    const entry = registry.entries.get(refId);
    if (favorite && (!entry || !refId.startsWith(`${entry.kind}.`)))
      return [block('Choose a spell, feature or item from the reference library')];
    return [];
  },
  apply: ({ build }, payload, { registry }) => {
    const { refId, favorite } = SetQuickAccessFavoritePayloadSchema.parse(payload);
    updateFavorite(build, refId, favorite);
    return `${favorite ? 'Favorite' : 'Remove favorite'} ${registry.entries.get(refId)?.name ?? refId}`;
  },
};
