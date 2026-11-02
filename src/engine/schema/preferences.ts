import { z } from 'zod';

export const AutomationSchema = z.enum(['assisted', 'manual']);

/** Workspace preferences; reduced motion supplements the operating system preference. */
export const PreferencesSchema = z.strictObject({
  automation: AutomationSchema,
  reducedMotion: z.boolean(),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
