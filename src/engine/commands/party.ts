import { z } from 'zod';
import { duplicateCharacter, type ManagementCommand } from './management';

const CopySchema = z.strictObject({
  sourceId: z.string().min(1),
  id: z.string().min(1),
  campaignId: z.string().min(1),
});

/** Membership is cloud-managed; bringing your own character is a separate, undoable local copy. */
export const copyToCampaign: ManagementCommand<z.infer<typeof CopySchema>> = {
  name: 'copyToCampaign',
  check: (ctx, input) => {
    const parsed = CopySchema.safeParse(input);
    if (!parsed.success) return [{ level: 'block', reason: 'Character copy details are invalid' }];
    const { sourceId, id, campaignId } = parsed.data;
    const source = Object.hasOwn(ctx.characters, sourceId) ? ctx.characters[sourceId] : undefined;
    if (!source || source.build.partyOwner || source.build.playedBy === 'dm')
      return [{ level: 'block', reason: 'Choose one of your own player characters' }];
    const target = Object.hasOwn(ctx.campaigns, campaignId) ? ctx.campaigns[campaignId] : undefined;
    if (!target?.shared)
      return [
        { level: 'block', reason: 'Join and sync this campaign before bringing a character' },
      ];
    const invalid =
      duplicateCharacter.check?.(ctx, { sourceId, id, name: source.build.name }) ?? [];
    if (invalid.length) return invalid;
    if (source.build.campaignId === campaignId)
      return [{ level: 'block', reason: 'This character is already in this campaign' }];
    return [
      {
        level: 'warn',
        reason: `The copy follows ${target.name}'s books and rules, so calculated values may change. Your original character stays unchanged.`,
      },
    ];
  },
  apply: (draft, { sourceId, id, campaignId }, ctx) => {
    duplicateCharacter.apply(
      draft,
      { sourceId, id, name: ctx.characters[sourceId]!.build.name },
      ctx,
    );
    draft.characters[id]!.build.campaignId = campaignId;
    draft.characters[id]!.build.playedBy = 'me';
    return `Bring ${ctx.characters[sourceId]!.build.name} to ${ctx.campaigns[campaignId]!.name} (copy)`;
  },
};
