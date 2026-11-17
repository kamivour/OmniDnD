import { z } from 'zod';
import { cannonSaveDc, classLevel, resolveCompanion } from '../calc/companion-profiles';
import type { Command } from './runner';
import { block, economyChecks, spendEconomy, warn } from './shared';

const Payload = z.strictObject({
  ids: z.array(z.string().min(1)).min(1).max(2),
  mode: z.enum(['activate', 'detonate']),
});
type CannonPayload = z.infer<typeof Payload>;

/** Activating two cannons shares one bonus action at Artificer 15; targets remain manual. */
export const useCannon: Command<CannonPayload> = {
  name: 'useCannon',
  check: (ctx, input) => {
    const parsed = Payload.safeParse(input);
    if (!parsed.success) return [block('Cannon action details are invalid')];
    const { ids, mode } = parsed.data;
    const level = classLevel({ build: ctx.build, sheet: ctx.sheet }, 'class.artificer');
    if (new Set(ids).size !== ids.length) return [block('Choose each cannon only once')];
    if (mode === 'detonate' && (level < 9 || ids.length !== 1))
      return [block('Detonate one cannon at a time, from Artificer level 9')];
    if (ids.length > 1 && level < 15) return [block('Two cannons require Artificer level 15')];
    const checks = economyChecks(ctx, mode === 'activate' ? 'bonus' : 'action');
    for (const id of ids) {
      const cannon = ctx.build.companions?.find((entry) => entry.id === id);
      const live = ctx.live.companions?.[id];
      if (!cannon || !live || cannon.profile?.family !== 'eldritch-cannon')
        return [block('Choose a configured Eldritch Cannon')];
      if (live.status !== 'active' || live.hp === 0) return [block(`${cannon.name} is not active`)];
      if (live.conditions.length)
        checks.push(warn(`${cannon.name} has conditions; confirm it can activate`));
    }
    return checks;
  },
  apply: (draft, { ids, mode }, ctx) => {
    spendEconomy(draft.live, mode === 'activate' ? 'bonus' : 'action');
    const descriptions = ids.map((id) => {
      const cannon = resolveCompanion(
        draft.build.companions!.find((entry) => entry.id === id)!,
        { build: draft.build, sheet: ctx.sheet },
      );
      if (mode === 'detonate') {
        const live = draft.live.companions![id]!;
        live.hp = 0;
        live.tempHp = 0;
        live.status = 'destroyed';
        delete live.endsAt;
        return `${cannon.name} (${cannon.profile!.form}) — 3d8 force, Dexterity save DC ${cannonSaveDc({ build: draft.build, sheet: ctx.sheet })}, half on success`;
      }
      return `${cannon.name} (${cannon.profile!.form}): ${cannon.actions![0]!.effect}`;
    });
    return `${mode === 'activate' ? 'Activate' : 'Detonate'} ${descriptions.join('; ')}`;
  },
};
