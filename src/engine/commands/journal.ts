import { z } from 'zod';
import { LocationEntrySchema, NpcSchema, QuestSchema, SessionNoteSchema } from '../schema';
import type { Command } from './runner';
import { block } from './shared';

const UpdateJournalNarrativePayloadSchema = z.strictObject({
  personality: z.string().optional(),
  ideals: z.string().optional(),
  bonds: z.string().optional(),
  flaws: z.string().optional(),
  relationships: z.string().optional(),
  backstory: z.string().optional(),
  appearance: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
});

export type UpdateJournalNarrativePayload = z.infer<typeof UpdateJournalNarrativePayloadSchema>;

export const updateJournalNarrative: Command<UpdateJournalNarrativePayload> = {
  name: 'updateJournalNarrative',
  check: (_ctx, input) => {
    const parsed = UpdateJournalNarrativePayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Journal narrative details are invalid')];
    return [];
  },
  apply: (draft, payload) => {
    draft.build.journal = {
      ...draft.build.journal,
      ...payload,
    };
    return 'Update character journal';
  },
};

const AddQuestPayloadSchema = z.strictObject({
  quest: QuestSchema,
});
export type AddQuestPayload = z.infer<typeof AddQuestPayloadSchema>;

export const addQuest: Command<AddQuestPayload> = {
  name: 'addQuest',
  check: ({ build }, input) => {
    const parsed = AddQuestPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Quest details are invalid')];
    if (build.journal.quests?.some((q) => q.id === parsed.data.quest.id)) {
      return [block('A quest with this id already exists')];
    }
    return [];
  },
  apply: (draft, { quest }) => {
    draft.build.journal.quests ??= [];
    draft.build.journal.quests.push(quest);
    return `Add quest: ${quest.title}`;
  },
};

const EditQuestPayloadSchema = z.strictObject({
  quest: QuestSchema,
});
export type EditQuestPayload = z.infer<typeof EditQuestPayloadSchema>;

export const editQuest: Command<EditQuestPayload> = {
  name: 'editQuest',
  check: ({ build }, input) => {
    const parsed = EditQuestPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Quest details are invalid')];
    if (!build.journal.quests?.some((q) => q.id === parsed.data.quest.id)) {
      return [block('Quest does not exist')];
    }
    return [];
  },
  apply: (draft, { quest }, { build }) => {
    draft.build.journal.quests ??= [];
    const index = draft.build.journal.quests.findIndex((q) => q.id === quest.id);
    const existing = build.journal.quests?.find((q) => q.id === quest.id);
    draft.build.journal.quests[index] = quest;
    if (existing && existing.status === 'open' && quest.status === 'done') {
      return `Complete quest: ${quest.title}`;
    }
    return `Edit quest: ${quest.title}`;
  },
};

const RemoveQuestPayloadSchema = z.strictObject({
  questId: z.string().min(1),
});
export type RemoveQuestPayload = z.infer<typeof RemoveQuestPayloadSchema>;

export const removeQuest: Command<RemoveQuestPayload> = {
  name: 'removeQuest',
  check: ({ build }, input) => {
    const parsed = RemoveQuestPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Quest id is invalid')];
    if (!build.journal.quests?.some((q) => q.id === parsed.data.questId)) {
      return [block('Quest does not exist')];
    }
    return [];
  },
  apply: (draft, { questId }, { build }) => {
    const quest = build.journal.quests?.find((q) => q.id === questId);
    draft.build.journal.quests = (draft.build.journal.quests ?? []).filter((q) => q.id !== questId);
    return `Remove quest: ${quest?.title ?? questId}`;
  },
};

const AddNpcPayloadSchema = z.strictObject({
  npc: NpcSchema,
});
export type AddNpcPayload = z.infer<typeof AddNpcPayloadSchema>;

export const addNpc: Command<AddNpcPayload> = {
  name: 'addNpc',
  check: ({ build }, input) => {
    const parsed = AddNpcPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('NPC details are invalid')];
    if (build.journal.npcs?.some((n) => n.id === parsed.data.npc.id)) {
      return [block('An NPC with this id already exists')];
    }
    return [];
  },
  apply: (draft, { npc }) => {
    draft.build.journal.npcs ??= [];
    draft.build.journal.npcs.push(npc);
    return `Add NPC: ${npc.name}`;
  },
};

const EditNpcPayloadSchema = z.strictObject({
  npc: NpcSchema,
});
export type EditNpcPayload = z.infer<typeof EditNpcPayloadSchema>;

export const editNpc: Command<EditNpcPayload> = {
  name: 'editNpc',
  check: ({ build }, input) => {
    const parsed = EditNpcPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('NPC details are invalid')];
    if (!build.journal.npcs?.some((n) => n.id === parsed.data.npc.id)) {
      return [block('NPC does not exist')];
    }
    return [];
  },
  apply: (draft, { npc }) => {
    draft.build.journal.npcs ??= [];
    const index = draft.build.journal.npcs.findIndex((n) => n.id === npc.id);
    draft.build.journal.npcs[index] = npc;
    return `Edit NPC: ${npc.name}`;
  },
};

const RemoveNpcPayloadSchema = z.strictObject({
  npcId: z.string().min(1),
});
export type RemoveNpcPayload = z.infer<typeof RemoveNpcPayloadSchema>;

export const removeNpc: Command<RemoveNpcPayload> = {
  name: 'removeNpc',
  check: ({ build }, input) => {
    const parsed = RemoveNpcPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('NPC id is invalid')];
    if (!build.journal.npcs?.some((n) => n.id === parsed.data.npcId)) {
      return [block('NPC does not exist')];
    }
    return [];
  },
  apply: (draft, { npcId }, { build }) => {
    const npc = build.journal.npcs?.find((n) => n.id === npcId);
    draft.build.journal.npcs = (draft.build.journal.npcs ?? []).filter((n) => n.id !== npcId);
    return `Remove NPC: ${npc?.name ?? npcId}`;
  },
};

const AddLocationPayloadSchema = z.strictObject({
  location: LocationEntrySchema,
});
export type AddLocationPayload = z.infer<typeof AddLocationPayloadSchema>;

export const addLocation: Command<AddLocationPayload> = {
  name: 'addLocation',
  check: ({ build }, input) => {
    const parsed = AddLocationPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Location details are invalid')];
    if (build.journal.locations?.some((l) => l.id === parsed.data.location.id)) {
      return [block('A location with this id already exists')];
    }
    return [];
  },
  apply: (draft, { location }) => {
    draft.build.journal.locations ??= [];
    draft.build.journal.locations.push(location);
    return `Add location: ${location.name}`;
  },
};

const EditLocationPayloadSchema = z.strictObject({
  location: LocationEntrySchema,
});
export type EditLocationPayload = z.infer<typeof EditLocationPayloadSchema>;

export const editLocation: Command<EditLocationPayload> = {
  name: 'editLocation',
  check: ({ build }, input) => {
    const parsed = EditLocationPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Location details are invalid')];
    if (!build.journal.locations?.some((l) => l.id === parsed.data.location.id)) {
      return [block('Location does not exist')];
    }
    return [];
  },
  apply: (draft, { location }) => {
    draft.build.journal.locations ??= [];
    const index = draft.build.journal.locations.findIndex((l) => l.id === location.id);
    draft.build.journal.locations[index] = location;
    return `Edit location: ${location.name}`;
  },
};

const RemoveLocationPayloadSchema = z.strictObject({
  locationId: z.string().min(1),
});
export type RemoveLocationPayload = z.infer<typeof RemoveLocationPayloadSchema>;

export const removeLocation: Command<RemoveLocationPayload> = {
  name: 'removeLocation',
  check: ({ build }, input) => {
    const parsed = RemoveLocationPayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Location id is invalid')];
    if (!build.journal.locations?.some((l) => l.id === parsed.data.locationId)) {
      return [block('Location does not exist')];
    }
    return [];
  },
  apply: (draft, { locationId }, { build }) => {
    const loc = build.journal.locations?.find((l) => l.id === locationId);
    draft.build.journal.locations = (draft.build.journal.locations ?? []).filter(
      (l) => l.id !== locationId,
    );
    return `Remove location: ${loc?.name ?? locationId}`;
  },
};

const AddSessionNotePayloadSchema = z.strictObject({
  sessionNote: SessionNoteSchema,
});
export type AddSessionNotePayload = z.infer<typeof AddSessionNotePayloadSchema>;

export const addSessionNote: Command<AddSessionNotePayload> = {
  name: 'addSessionNote',
  check: ({ build }, input) => {
    const parsed = AddSessionNotePayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Session note details are invalid')];
    if (build.journal.sessionNotes?.some((n) => n.id === parsed.data.sessionNote.id)) {
      return [block('A session note with this id already exists')];
    }
    return [];
  },
  apply: (draft, { sessionNote }) => {
    draft.build.journal.sessionNotes ??= [];
    draft.build.journal.sessionNotes.push(sessionNote);
    return `Add session note: ${sessionNote.title || sessionNote.date}`;
  },
};

const EditSessionNotePayloadSchema = z.strictObject({
  sessionNote: SessionNoteSchema,
});
export type EditSessionNotePayload = z.infer<typeof EditSessionNotePayloadSchema>;

export const editSessionNote: Command<EditSessionNotePayload> = {
  name: 'editSessionNote',
  check: ({ build }, input) => {
    const parsed = EditSessionNotePayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Session note details are invalid')];
    if (!build.journal.sessionNotes?.some((n) => n.id === parsed.data.sessionNote.id)) {
      return [block('Session note does not exist')];
    }
    return [];
  },
  apply: (draft, { sessionNote }) => {
    draft.build.journal.sessionNotes ??= [];
    const index = draft.build.journal.sessionNotes.findIndex((n) => n.id === sessionNote.id);
    draft.build.journal.sessionNotes[index] = sessionNote;
    return `Edit session note: ${sessionNote.title || sessionNote.date}`;
  },
};

const RemoveSessionNotePayloadSchema = z.strictObject({
  sessionNoteId: z.string().min(1),
});
export type RemoveSessionNotePayload = z.infer<typeof RemoveSessionNotePayloadSchema>;

export const removeSessionNote: Command<RemoveSessionNotePayload> = {
  name: 'removeSessionNote',
  check: ({ build }, input) => {
    const parsed = RemoveSessionNotePayloadSchema.safeParse(input);
    if (!parsed.success) return [block('Session note id is invalid')];
    if (!build.journal.sessionNotes?.some((n) => n.id === parsed.data.sessionNoteId)) {
      return [block('Session note does not exist')];
    }
    return [];
  },
  apply: (draft, { sessionNoteId }, { build }) => {
    const note = build.journal.sessionNotes?.find((n) => n.id === sessionNoteId);
    draft.build.journal.sessionNotes = (draft.build.journal.sessionNotes ?? []).filter(
      (n) => n.id !== sessionNoteId,
    );
    return `Remove session note: ${note?.title || note?.date || sessionNoteId}`;
  },
};
