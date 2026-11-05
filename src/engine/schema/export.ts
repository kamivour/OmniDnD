import { z } from 'zod';
import { CampaignSchema, CharacterBuildSchema, LiveStateSchema } from './character';
import { SCHEMA_VERSION } from './common';
import { LogEventSchema } from './log';

/** One character with its campaign, as Export writes it and Import reads it (DATA.md §6). The seed fixture uses it too. */
export const ExportFileSchema = z
  .strictObject({
    app: z.literal('omnidnd'),
    schemaVersion: z.literal(SCHEMA_VERSION),
    exportedAt: z.iso.datetime(),
    campaign: CampaignSchema,
    build: CharacterBuildSchema,
    live: LiveStateSchema,
    events: z.array(LogEventSchema),
  })
  .superRefine((file, ctx) => {
    if (file.build.campaignId !== file.campaign.id) {
      ctx.addIssue({
        code: 'custom',
        message: `Build belongs to campaign ${file.build.campaignId}, not ${file.campaign.id}`,
        path: ['build', 'campaignId'],
      });
    }
    if (file.live.characterId !== file.build.id) {
      ctx.addIssue({
        code: 'custom',
        message: `Live state is for ${file.live.characterId}, not ${file.build.id}`,
        path: ['live', 'characterId'],
      });
    }
    file.events.forEach((event, index) => {
      if (event.characterId !== file.build.id) {
        ctx.addIssue({
          code: 'custom',
          message: `Event ${event.id} is for ${event.characterId}, not ${file.build.id}`,
          path: ['events', index, 'characterId'],
        });
      }
    });

    // Every owned item needs a live entry (qty, equipped), and nothing else may have one.
    const instanceIds = new Set(file.build.items.map((item) => item.instanceId));
    for (const id of instanceIds) {
      if (!Object.hasOwn(file.live.items, id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Item ${id} has no live state`,
          path: ['live', 'items'],
        });
      }
    }
    for (const id of Object.keys(file.live.items)) {
      if (!instanceIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Live state has unknown item ${id}`,
          path: ['live', 'items', id],
        });
      }
    }
  });

export type ExportFile = z.infer<typeof ExportFileSchema>;
