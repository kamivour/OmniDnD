import { z } from 'zod';

/**
 * An outside tool or site (VTT, map maker, audio and so on) in our own words. Links only: the app
 * never fetches or embeds them.
 */
export const TOOL_OBJECTIVES = [
  'vtt',
  'maps',
  'generators',
  'tokens',
  'minis',
  'ai-3d',
  'audio',
  'builders',
  'prep',
  'other-systems',
] as const;
export const ToolObjectiveSchema = z.enum(TOOL_OBJECTIVES);
export type ToolObjective = z.infer<typeof ToolObjectiveSchema>;

export const TOOL_PLATFORMS = ['web', 'windows', 'mac', 'linux', 'ios', 'android'] as const;
export const ToolPlatformSchema = z.enum(TOOL_PLATFORMS);
export type ToolPlatform = z.infer<typeof ToolPlatformSchema>;

export const ToolCostSchema = z.enum(['free', 'freemium', 'paid']);

export const ToolSchema = z.strictObject({
  id: z.string().regex(/^tool\.[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  url: z.url().startsWith('https://'),
  objective: ToolObjectiveSchema,
  platforms: z.array(ToolPlatformSchema).min(1),
  cost: ToolCostSchema,
  /** One line, our own words. */
  summary: z.string().min(1).max(140),
  /** True when the tool makes its output with generative AI. */
  ai: z.boolean(),
  /** Extra words people may search for. */
  synonyms: z.array(z.string().min(1)),
});
export type Tool = z.infer<typeof ToolSchema>;

export const ToolPackSchema = z.array(ToolSchema).superRefine((tools, context) => {
  const ids = new Set<string>();
  const urls = new Set<string>();
  tools.forEach((tool, index) => {
    const url = tool.url.replace(/\/+$/, '').toLowerCase();
    if (ids.has(tool.id))
      context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate id ${tool.id}` });
    if (urls.has(url))
      context.addIssue({
        code: 'custom',
        path: [index, 'url'],
        message: `Duplicate url ${tool.url}`,
      });
    ids.add(tool.id);
    urls.add(url);
  });
});
