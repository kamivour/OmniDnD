import { z } from 'zod';
import { BookmarkSchema, type Bookmark } from '../schema';
import type { ManagementCommand } from './management';

const BookmarkPayloadSchema = z.strictObject({ bookmark: BookmarkSchema });
const DeleteBookmarkPayloadSchema = z.strictObject({
  bookmarkId: BookmarkSchema.shape.id,
});

export const addBookmark: ManagementCommand<{ bookmark: Bookmark }> = {
  name: 'addBookmark',
  check: (ctx, payload) => {
    const parsed = BookmarkPayloadSchema.safeParse(payload);
    if (!parsed.success) return [{ level: 'block', reason: 'Bookmark details are invalid' }];
    if (ctx.bookmarks?.some(({ id }) => id === parsed.data.bookmark.id))
      return [{ level: 'block', reason: 'A bookmark with this id already exists' }];
    return [];
  },
  apply: (draft, payload) => {
    const { bookmark } = BookmarkPayloadSchema.parse(payload);
    draft.bookmarks ??= [];
    draft.bookmarks.push(bookmark);
    return `Add bookmark: ${bookmark.title}`;
  },
};

export const updateBookmark: ManagementCommand<{ bookmark: Bookmark }> = {
  name: 'updateBookmark',
  check: (ctx, payload) => {
    const parsed = BookmarkPayloadSchema.safeParse(payload);
    if (!parsed.success) return [{ level: 'block', reason: 'Bookmark details are invalid' }];
    if (!ctx.bookmarks?.some(({ id }) => id === parsed.data.bookmark.id))
      return [{ level: 'block', reason: 'Bookmark does not exist' }];
    return [];
  },
  apply: (draft, payload) => {
    const { bookmark } = BookmarkPayloadSchema.parse(payload);
    const index = draft.bookmarks!.findIndex(({ id }) => id === bookmark.id);
    draft.bookmarks![index] = bookmark;
    return `Update bookmark: ${bookmark.title}`;
  },
};

export const deleteBookmark: ManagementCommand<{ bookmarkId: string }> = {
  name: 'deleteBookmark',
  check: (ctx, payload) => {
    const parsed = DeleteBookmarkPayloadSchema.safeParse(payload);
    if (!parsed.success) return [{ level: 'block', reason: 'Bookmark id is invalid' }];
    if (!ctx.bookmarks?.some(({ id }) => id === parsed.data.bookmarkId))
      return [{ level: 'block', reason: 'Bookmark does not exist' }];
    return [];
  },
  apply: (draft, payload) => {
    const { bookmarkId } = DeleteBookmarkPayloadSchema.parse(payload);
    const index = draft.bookmarks!.findIndex(({ id }) => id === bookmarkId);
    const [bookmark] = draft.bookmarks!.splice(index, 1);
    return `Delete bookmark: ${bookmark!.title}`;
  },
};
