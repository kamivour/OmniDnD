import { z } from 'zod';
import { refId, SourceSchema } from './common';
import { CreatureBookSchema, CreatureDefSchema } from './refs';

/**
 * A private monster pack (M50): stat blocks and lore a person extracted from monster books
 * they own. It is imported on each device, kept in IndexedDB and never bundled or synced.
 */
export const MONSTER_PACK_FORMAT = 1;

export const MonsterLoreSchema = z.strictObject({
  id: z.string().min(1),
  source: SourceSchema,
  /** Printed page of the family heading. */
  page: z.int().positive(),
  title: z.string().min(1).optional(),
  sections: z
    .array(z.strictObject({ title: z.string().min(1).optional(), text: z.string().min(1) }))
    .min(1),
});

/** Book tags and lore for a creature whose stats are already bundled (an SRD monster). */
export const CreatureSupplementSchema = z.strictObject({
  id: refId('creature'),
  books: z.array(CreatureBookSchema).min(1),
  loreIds: z.array(z.string().min(1)).optional(),
});

export const MonsterPackSchema = z
  .strictObject({
    format: z.literal(MONSTER_PACK_FORMAT),
    version: z.string().min(1),
    extractedAt: z.string().min(1),
    /** A marker string. A build test fails if it ever appears in the production bundle. */
    canary: z.string().min(1),
    creatures: z.array(CreatureDefSchema),
    lore: z.array(MonsterLoreSchema),
    supplements: z.array(CreatureSupplementSchema),
  })
  .superRefine((pack, ctx) => {
    const ids = new Set<string>();
    const loreIds = new Set(pack.lore.map((lore) => lore.id));
    const check = (id: string, loreRefs: readonly string[] | undefined, path: PropertyKey[]) => {
      if (ids.has(id)) ctx.addIssue({ code: 'custom', message: `Duplicate id ${id}`, path });
      ids.add(id);
      for (const loreId of loreRefs ?? []) {
        if (!loreIds.has(loreId))
          ctx.addIssue({ code: 'custom', message: `Unknown lore ${loreId}`, path });
      }
    };
    pack.creatures.forEach((creature, index) => {
      const path = ['creatures', index];
      check(creature.id, creature.loreIds, path);
      if (creature.srd)
        ctx.addIssue({ code: 'custom', message: 'Pack creatures are not SRD', path });
      if (!creature.books)
        ctx.addIssue({ code: 'custom', message: 'Pack creatures list their books', path });
    });
    pack.supplements.forEach((supplement, index) =>
      check(supplement.id, supplement.loreIds, ['supplements', index]),
    );
  });

export type MonsterLore = z.infer<typeof MonsterLoreSchema>;
export type CreatureSupplement = z.infer<typeof CreatureSupplementSchema>;
export type MonsterPack = z.infer<typeof MonsterPackSchema>;
