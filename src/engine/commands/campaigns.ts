import { z } from 'zod';
import { ABILITIES } from '../calc/abilities';
import { POINT_BUY_COSTS, STANDARD_ARRAY } from '../creation';
import { CampaignSchema, type Campaign, type CharacterBuild } from '../schema';
import type { ManagementCommand } from './management';

/** Phase 1 campaign settings; source books and optional rules stay unchanged. */
export type CampaignChanges = Pick<
  Campaign,
  'name' | 'leveling' | 'hpMethod' | 'hpLevelFloor' | 'abilityMethod'
>;

const CampaignChangesSchema = CampaignSchema.pick({
  name: true,
  leveling: true,
  hpMethod: true,
  hpLevelFloor: true,
  abilityMethod: true,
}).extend({ name: z.string().trim().min(1) });

const UpdateCampaignSchema = z.strictObject({
  campaignId: z.string().min(1),
  changes: CampaignChangesSchema,
});

/** Change future character choices without rewriting previously entered choices or play. */
export const updateCampaign: ManagementCommand<{
  campaignId: string;
  changes: CampaignChanges;
}> = {
  name: 'updateCampaign',
  check: (ctx, payload) => {
    const parsed = UpdateCampaignSchema.safeParse(payload);
    if (!parsed.success) return [{ level: 'block', reason: 'Campaign settings are invalid' }];
    if (!Object.hasOwn(ctx.campaigns, parsed.data.campaignId))
      return [{ level: 'block', reason: 'Campaign does not exist' }];
    return [];
  },
  apply: (draft, payload, ctx) => {
    const { campaignId, changes } = UpdateCampaignSchema.parse(payload);
    const current = ctx.campaigns[campaignId]!;
    if (changes.hpLevelFloor !== current.hpLevelFloor) {
      for (const { build } of Object.values(draft.characters)) {
        if (build.campaignId !== campaignId) continue;
        // Legacy entries inherit their old campaign floor. Lock that interpretation
        // before changing it, keeping both the raw value and the recorded method.
        for (const entry of build.hpEntries) entry.floor ??= current.hpLevelFloor;
      }
    }
    draft.campaigns[campaignId] = { ...current, ...changes };
    return `Update campaign: ${changes.name}`;
  },
};

/** Information for settings previews: old choices remain valid, retained character data. */
export function campaignMethodConflicts(campaign: Campaign, build: CharacterBuild): string[] {
  const notes: string[] = [];
  for (const entry of build.hpEntries) {
    if (entry.level === 1 || entry.method === campaign.hpMethod) continue;
    notes.push(
      `Level ${entry.level} HP retains its ${entry.method} value (${entry.value}); campaign uses ${campaign.hpMethod} HP.`,
    );
  }

  const bases = ABILITIES.map((ability) => build.abilityScores.base[ability]);
  if (
    campaign.abilityMethod === 'standard-array' &&
    [...bases].sort((a, b) => b - a).some((score, index) => score !== STANDARD_ARRAY[index])
  ) {
    notes.push(
      `Base ability scores do not match the standard array (${STANDARD_ARRAY.join(', ')}); existing scores are retained.`,
    );
  }
  if (campaign.abilityMethod === 'point-buy') {
    const outside = ABILITIES.filter((ability) => {
      const score = build.abilityScores.base[ability];
      return score < 8 || score > 15;
    });
    if (outside.length > 0) {
      notes.push(
        `Base scores outside point-buy bounds (8–15): ${outside.map((ability) => `${ability} ${build.abilityScores.base[ability]}`).join(', ')}. Existing scores are retained.`,
      );
    } else {
      const cost = bases.reduce((total, score) => total + POINT_BUY_COSTS[score]!, 0);
      if (cost > 27)
        notes.push(
          `Base ability scores cost ${cost} point-buy points (budget 27); existing scores are retained.`,
        );
    }
  }
  if (campaign.leveling === 'xp' && build.xp === undefined) notes.push('XP is not tracked yet');
  return notes;
}
