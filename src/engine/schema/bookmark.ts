import { z } from 'zod';

/** Workspace reference links accept web addresses only; opening them remains a UI action. */
export const BookmarkSchema = z.strictObject({
  id: z.string().refine((value) => value.trim().length > 0, 'A bookmark id is required'),
  title: z.string().trim().min(1),
  url: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ })),
});

export type Bookmark = z.infer<typeof BookmarkSchema>;
