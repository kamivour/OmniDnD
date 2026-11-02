import { z } from 'zod';
import {
  spellSelectionCountWarning,
  spellSelectionDetails,
  spellSelectionRuleWarnings,
} from '../calc/spell-selections';
import { refId, SpellTypeSchema, type CharacterBuild } from '../schema';
import type { Command } from './runner';
import { block, warn } from './shared';

const selectionFields = {
  classId: refId('class'),
  list: z.enum(['known', 'prepared']),
  spellId: refId('spell'),
};

const ChangeSpellSelectionPayloadSchema = z.discriminatedUnion('action', [
  z.strictObject({ ...selectionFields, action: z.literal('add') }),
  z.strictObject({ ...selectionFields, action: z.literal('remove') }),
  z.strictObject({
    ...selectionFields,
    action: z.literal('replace'),
    replacementId: refId('spell'),
  }),
]);

export type ChangeSpellSelectionPayload = z.infer<typeof ChangeSpellSelectionPayloadSchema>;

/** Merge only the affected class; retain the order and data of all other class records. */
function changedRecords(
  records: CharacterBuild['spells'],
  payload: ChangeSpellSelectionPayload,
): CharacterBuild['spells'] {
  const affected = records.filter((entry) => entry.classId === payload.classId);
  const known = [...new Set(affected.flatMap((entry) => entry.known))];
  const prepared = [...new Set(affected.flatMap((entry) => entry.prepared ?? []))];
  const selected = payload.list === 'known' ? known : prepared;
  const next =
    payload.action === 'add'
      ? [...new Set([...selected, payload.spellId])]
      : payload.action === 'remove'
        ? selected.filter((id) => id !== payload.spellId)
        : [...new Set(selected.map((id) => (id === payload.spellId ? payload.replacementId : id)))];
  const nextKnown = payload.list === 'known' ? next : known;
  const nextPrepared = payload.list === 'prepared' ? next : prepared;
  const hasPrepared =
    payload.list === 'prepared' || affected.some((entry) => entry.prepared !== undefined);
  const changed = {
    classId: payload.classId,
    known: nextKnown,
    ...(hasPrepared ? { prepared: nextPrepared } : {}),
  };
  const keep = nextKnown.length > 0 || nextPrepared.length > 0;
  let inserted = false;
  const result: CharacterBuild['spells'] = [];
  for (const entry of records) {
    if (entry.classId !== payload.classId) result.push(entry);
    else if (!inserted) {
      if (keep) result.push(changed);
      inserted = true;
    }
  }
  if (!inserted && keep) result.push(changed);
  return result;
}

export const changeSpellSelection: Command<ChangeSpellSelectionPayload> = {
  name: 'changeSpellSelection',
  check: (ctx, payload) => {
    const parsed = ChangeSpellSelectionPayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Spell selection details are invalid')];
    const choice = parsed.data;
    if (ctx.registry.entries.get(choice.classId)?.kind !== 'class')
      return [block('Choose a class from the reference library')];
    const ids =
      choice.action === 'replace' ? [choice.spellId, choice.replacementId] : [choice.spellId];
    if (ids.some((id) => ctx.registry.entries.get(id)?.kind !== 'spell'))
      return [block('Choose spells from the reference library')];
    const before = spellSelectionDetails(ctx, choice.classId);
    if (choice.action !== 'add' && !before.selection[choice.list].includes(choice.spellId))
      return [block('That spell is not selected in this list')];
    if (choice.action !== 'remove' && before.mode === 'unsupported')
      return [block('Spell selection is not supported for this class')];
    const nextContext = {
      ...ctx,
      build: { ...ctx.build, spells: changedRecords(ctx.build.spells, choice) },
    };
    const after = spellSelectionDetails(nextContext, choice.classId);
    const oldRules = new Set(spellSelectionRuleWarnings(ctx, before));
    const checks = spellSelectionRuleWarnings(nextContext, after)
      .filter((reason) => !oldRules.has(reason))
      .map(warn);
    for (const list of ['cantrips', 'known', 'prepared'] as const) {
      if (after[list].count <= before[list].count) continue;
      const warning = spellSelectionCountWarning(after, list);
      if (warning) checks.push(warn(warning));
    }
    return checks;
  },
  apply: ({ build }, payload, { registry }) => {
    const choice = ChangeSpellSelectionPayloadSchema.parse(payload);
    build.spells = changedRecords(build.spells, choice);
    const name = registry.get('spell', choice.spellId).name;
    const className = registry.get('class', choice.classId).name;
    if (choice.action === 'replace')
      return `Replace ${name} with ${registry.get('spell', choice.replacementId).name} (${className}, ${choice.list})`;
    return `${choice.action === 'add' ? 'Add' : 'Remove'} ${name} (${className}, ${choice.list})`;
  },
};

const SetSpellTagsPayloadSchema = z.strictObject({
  spellId: refId('spell'),
  tags: z
    .array(SpellTypeSchema)
    .max(6)
    .refine((tags) => new Set(tags).size === tags.length, 'Choose each spell type once')
    .nullable(),
});

export type SetSpellTagsPayload = z.infer<typeof SetSpellTagsPayloadSchema>;

/** Ordered character-only display tags; null restores registry defaults, while [] means Utility. */
export const setSpellTags: Command<SetSpellTagsPayload> = {
  name: 'setSpellTags',
  check: ({ registry }, payload) => {
    const parsed = SetSpellTagsPayloadSchema.safeParse(payload);
    if (!parsed.success) return [block('Spell type details are invalid')];
    return registry.entries.get(parsed.data.spellId)?.kind === 'spell'
      ? []
      : [block('Choose a spell from the reference library')];
  },
  apply: ({ build }, payload, { registry }) => {
    const { spellId, tags } = SetSpellTagsPayloadSchema.parse(payload);
    const name = registry.get('spell', spellId).name;
    if (tags === null) {
      if (build.spellTags) delete build.spellTags[spellId];
      return `Reset spell types: ${name}`;
    }
    build.spellTags ??= {};
    build.spellTags[spellId] = [...tags];
    return `Set spell types: ${name} (${tags.join(', ') || 'utility'})`;
  },
};
