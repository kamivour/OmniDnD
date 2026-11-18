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

const MoveSchema = z.strictObject({
  characterId: z.string().min(1),
  campaignId: z.string().min(1),
});

/** Moves one of your characters to another campaign, keeping its history. */
export const moveToCampaign: ManagementCommand<z.infer<typeof MoveSchema>> = {
  name: 'moveToCampaign',
  check: (ctx, input) => {
    const parsed = MoveSchema.safeParse(input);
    if (!parsed.success) return [{ level: 'block', reason: 'Character move details are invalid' }];
    const { characterId, campaignId } = parsed.data;
    const record = Object.hasOwn(ctx.characters, characterId)
      ? ctx.characters[characterId]
      : undefined;
    if (!record || record.build.partyOwner || record.build.playedBy === 'dm')
      return [{ level: 'block', reason: 'Choose one of your own player characters' }];
    const target = Object.hasOwn(ctx.campaigns, campaignId) ? ctx.campaigns[campaignId] : undefined;
    if (!target) return [{ level: 'block', reason: 'That campaign is not on this device' }];
    if (record.build.campaignId === campaignId)
      return [{ level: 'block', reason: 'This character is already in this campaign' }];
    const source = ctx.campaigns[record.build.campaignId];
    return [
      {
        level: 'warn',
        reason: `${record.build.name} follows ${target.name}'s books and rules, so calculated values may change.`,
      },
      ...(target.shared
        ? [{ level: 'warn' as const, reason: `Members of ${target.name} will see this character.` }]
        : []),
      ...(source?.shared
        ? [
            {
              level: 'warn' as const,
              reason: `${source.name}'s members will no longer see this character.`,
            },
          ]
        : []),
    ];
  },
  apply: (draft, { characterId, campaignId }, ctx) => {
    draft.characters[characterId]!.build.campaignId = campaignId;
    return `Move ${ctx.characters[characterId]!.build.name} to ${ctx.campaigns[campaignId]!.name}`;
  },
};

const KeepPrivateSchema = z.strictObject({
  campaignId: z.string().min(1),
  characterIds: z.array(z.string().min(1)).min(1),
  privateId: z.string().min(1),
});

/**
 * Before sharing, characters the owner leaves out move to a private copy of the campaign
 * (same books and rules), so members never see them.
 */
export const keepOutOfSharing: ManagementCommand<z.infer<typeof KeepPrivateSchema>> = {
  name: 'keepOutOfSharing',
  check: (ctx, input) => {
    const parsed = KeepPrivateSchema.safeParse(input);
    if (!parsed.success) return [{ level: 'block', reason: 'Sharing details are invalid' }];
    const { campaignId, characterIds, privateId } = parsed.data;
    const campaign = Object.hasOwn(ctx.campaigns, campaignId)
      ? ctx.campaigns[campaignId]
      : undefined;
    if (!campaign) return [{ level: 'block', reason: 'Campaign does not exist' }];
    if (campaign.shared) return [{ level: 'block', reason: 'This campaign is already shared' }];
    if (Object.hasOwn(ctx.campaigns, privateId))
      return [{ level: 'block', reason: `Campaign "${privateId}" already exists` }];
    const outside = characterIds.some(
      (id) =>
        !Object.hasOwn(ctx.characters, id) ||
        ctx.characters[id]!.build.campaignId !== campaignId ||
        ctx.characters[id]!.build.partyOwner,
    );
    return outside ? [{ level: 'block', reason: 'Choose characters from this campaign' }] : [];
  },
  apply: (draft, { campaignId, characterIds, privateId }, ctx) => {
    const campaign = ctx.campaigns[campaignId]!;
    draft.campaigns[privateId] = {
      ...structuredClone(campaign),
      id: privateId,
      name: `${campaign.name} (private)`,
    };
    for (const id of characterIds) draft.characters[id]!.build.campaignId = privateId;
    const count = characterIds.length;
    return `Keep ${count} character${count === 1 ? '' : 's'} private when sharing ${campaign.name}`;
  },
};
