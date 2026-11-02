import { applyPatches, enablePatches, produceWithPatches, type Draft } from 'immer';
import { z } from 'zod';
import { computeSheet } from '../calc/sheet';
import type { Registry } from '../registry';
import {
  BookmarkSchema,
  CampaignSchema,
  ExportFileSchema,
  PatchSchema,
  SCHEMA_VERSION,
  type Bookmark,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
  type Patch,
} from '../schema';
import { EVENT_LIMIT, undo, type Check, type RunOptions } from './runner';

enablePatches();

// Immer cannot safely traverse these object keys when applying undo patches.
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export interface ManagementData {
  campaigns: Record<string, Campaign>;
  characters: Record<string, { build: CharacterBuild; live: LiveState; events: LogEvent[] }>;
  bookmarks?: Bookmark[];
}

const ManagementPatchSchema = PatchSchema.refine(
  ({ path }) => ['campaigns', 'characters', 'bookmarks'].includes(String(path[0])),
  'Management patches must start at campaigns, characters, or bookmarks',
).refine(
  ({ path }) => !path.some((key) => typeof key === 'string' && RESERVED_IDS.has(key)),
  'Management patches cannot contain reserved object keys',
);

/** Workspace changes have their own history, without a character or game clock. */
export const ManagementEventSchema = z.strictObject({
  id: z.string().min(1),
  realTime: z.iso.datetime(),
  command: z.string().min(1),
  text: z.string().min(1),
  patches: z.array(ManagementPatchSchema),
  inversePatches: z.array(ManagementPatchSchema),
  override: z.boolean().optional(),
  undoneBy: z.string().optional(),
});

export type ManagementEvent = z.infer<typeof ManagementEventSchema>;
export interface ManagementContext extends ManagementData {
  registry: Registry;
}

export interface ManagementCommand<Payload> {
  name: string;
  check?: (ctx: ManagementContext, payload: Payload) => Check[];
  apply: (draft: Draft<ManagementData>, payload: Payload, ctx: ManagementContext) => string;
}

export type ManagementRunResult =
  | { result: 'blocked' | 'warn'; reasons: string[] }
  | { result: 'ok'; reasons: string[]; next: ManagementData; event: ManagementEvent };

export type ManagementUndoResult =
  | { result: 'blocked' | 'warn'; reasons: string[] }
  | {
      result: 'ok';
      next: ManagementData;
      event: ManagementEvent;
      events: ManagementEvent[];
    };

export function runManagement<Payload>(
  command: ManagementCommand<Payload>,
  state: ManagementData,
  payload: Payload,
  registry: Registry,
  { eventId, realTime, force = false }: RunOptions,
): ManagementRunResult {
  const ctx: ManagementContext = { ...state, registry };
  const checks = command.check?.(ctx, payload) ?? [];
  const reasons = (level: Check['level']) =>
    checks.filter((check) => check.level === level).map((check) => check.reason);
  const blocks = reasons('block');
  if (blocks.length > 0) return { result: 'blocked', reasons: blocks };
  const warnings = reasons('warn');
  if (warnings.length > 0 && !force) return { result: 'warn', reasons: warnings };

  let text = '';
  const [next, patches, inversePatches] = produceWithPatches(
    {
      campaigns: state.campaigns,
      characters: state.characters,
      ...(Object.hasOwn(state, 'bookmarks') ? { bookmarks: state.bookmarks } : {}),
    },
    (draft) => {
      text = command.apply(draft, payload, ctx);
    },
  );
  validateManagementData(next, registry);
  const event = ManagementEventSchema.parse({
    id: eventId,
    realTime,
    command: command.name,
    text,
    patches,
    inversePatches,
    ...(warnings.length > 0 ? { override: true } : {}),
  });
  return { result: 'ok', reasons: reasons('info'), next, event };
}

/** Undo the latest workspace command, asking before replacing intervening character edits. */
export function undoManagement(
  state: ManagementData,
  events: readonly ManagementEvent[],
  registry: Registry,
  { eventId, realTime }: Pick<RunOptions, 'eventId' | 'realTime'>,
  force = false,
): ManagementUndoResult {
  const target = events.findLast((event) => event.command !== 'undo' && !event.undoneBy);
  if (!target) return { result: 'blocked', reasons: ['Nothing to undo'] };
  const parsed = ManagementEventSchema.safeParse(target);
  if (!parsed.success) return { result: 'blocked', reasons: ['Undo history is invalid'] };

  const changed = target.patches.some((patch) => {
    const actual = atPath(state, patch.path);
    return patch.op === 'remove'
      ? actual.exists
      : !actual.exists || !equalData(actual.value, patch.value);
  });
  if (changed && !force) {
    return {
      result: 'warn',
      reasons: [`Undo: ${target.text} also removes or replaces later changes. Do anyway?`],
    };
  }

  try {
    const [next, patches, inversePatches] = produceWithPatches(
      {
        campaigns: state.campaigns,
        characters: state.characters,
        ...(Object.hasOwn(state, 'bookmarks') ? { bookmarks: state.bookmarks } : {}),
      },
      (draft) => {
        for (const patch of target.inversePatches) {
          // Later character undo can remove an entry that received management metadata.
          // Removing that now-absent field is already satisfied, including absent parents.
          if (patch.op === 'remove' && !atPath(draft, patch.path).exists) continue;
          applyPatches(draft, [patch]);
        }
      },
    );
    validateManagementData(next, registry);
    const event = ManagementEventSchema.parse({
      id: eventId,
      realTime,
      command: 'undo',
      text: `Undo: ${target.text}`,
      patches,
      inversePatches,
      ...(changed ? { override: true } : {}),
    });
    const marked = events.map((entry) =>
      entry === target ? { ...entry, undoneBy: eventId } : entry,
    );
    return { result: 'ok', next, event, events: appendManagementEvent(marked, event) };
  } catch (error) {
    return { result: 'blocked', reasons: [`Cannot undo: ${message(error)}`] };
  }
}

/** Keep the newest 500 workspace events; running a command never mutates its history. */
export function appendManagementEvent(
  events: readonly ManagementEvent[],
  event: ManagementEvent,
): ManagementEvent[] {
  return [...events, event].slice(-EVENT_LIMIT);
}

/** Validate source state, crosslinks, and every explicit reference before saving or importing. */
export function validateManagementData(state: ManagementData, registry: Registry): void {
  if (Object.hasOwn(state, 'bookmarks')) {
    const bookmarks = z.array(BookmarkSchema).parse(state.bookmarks);
    const ids = new Set<string>();
    for (const bookmark of bookmarks) {
      if (ids.has(bookmark.id)) throw new Error(`Duplicate bookmark id "${bookmark.id}"`);
      ids.add(bookmark.id);
    }
  }
  for (const [id, value] of Object.entries(state.campaigns)) {
    if (RESERVED_IDS.has(id)) throw new Error(`Campaign id "${id}" is reserved`);
    const campaign = CampaignSchema.parse(value);
    if (id !== campaign.id) throw new Error('Campaign key does not match its id');
  }
  for (const [id, record] of Object.entries(state.characters)) {
    if (RESERVED_IDS.has(id)) throw new Error(`Character id "${id}" is reserved`);
    if (id !== record.build.id) throw new Error('Character key does not match its id');
    const campaign = Object.hasOwn(state.campaigns, record.build.campaignId)
      ? state.campaigns[record.build.campaignId]
      : undefined;
    if (!campaign) throw new Error(`Character "${id}" has no campaign`);
    const file = ExportFileSchema.parse({
      app: 'omnidnd',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '1970-01-01T00:00:00.000Z',
      campaign,
      ...record,
    });
    const { build, live } = file;
    registry.get('race', build.raceId);
    if (build.subraceId) registry.get('race', build.subraceId);
    for (const entry of build.classes) {
      registry.get('class', entry.classId);
      if (entry.subclassId) {
        const subclass = registry.get('subclass', entry.subclassId);
        if (subclass.classId !== entry.classId)
          throw new Error(`${entry.subclassId} does not belong to ${entry.classId}`);
      }
    }
    for (const entry of build.spells) {
      registry.get('class', entry.classId);
      for (const spellId of [...entry.known, ...(entry.prepared ?? [])])
        registry.get('spell', spellId);
    }
    for (const item of build.items) {
      registry.get('item', item.itemId);
      if (item.container && !build.items.some(({ instanceId }) => instanceId === item.container))
        throw new Error(`Item ${item.instanceId} has missing container ${item.container}`);
    }
    for (const itemId of [
      ...build.proficiencies.tools,
      ...build.proficiencies.weapons.filter((value) => value.startsWith('item.')),
      ...build.proficiencies.expertise.filter((value) => value.startsWith('item.')),
    ])
      registry.get('item', itemId);
    for (const refId of [...build.favorites, ...Object.keys(build.spellTags ?? {})])
      if (!registry.entries.has(refId)) throw new Error(`Unknown reference ${refId}`);
    for (const featureId of Object.keys(live.featureUsesSpent)) registry.get('feature', featureId);
    if (live.concentration) registry.get('spell', live.concentration.spellId);
    for (const effect of live.effects)
      if (effect.sourceId && !registry.entries.has(effect.sourceId))
        throw new Error(`Unknown reference ${effect.sourceId}`);
    computeSheet({ campaign, build, live }, registry);
    if (file.events.length > EVENT_LIMIT) throw new Error(`Character "${id}" has too many events`);
    const eventIds = new Set<string>();
    for (const event of file.events) {
      if (eventIds.has(event.id)) throw new Error(`Duplicate character event ${event.id}`);
      eventIds.add(event.id);
      if (
        [...event.patches, ...event.inversePatches].some(
          ({ path }) => path[0] !== 'build' && path[0] !== 'live',
        )
      )
        throw new Error(`Character event ${event.id} has an invalid patch root`);
    }
  }
}

export const addCharacter: ManagementCommand<{ file: ExportFile }> = {
  name: 'addCharacter',
  check: (ctx, { file }) => {
    const parsed = ExportFileSchema.safeParse(file);
    if (!parsed.success) return [{ level: 'block', reason: 'Character JSON is invalid' }];
    if (RESERVED_IDS.has(file.build.id) || RESERVED_IDS.has(file.campaign.id))
      return [{ level: 'block', reason: 'Character or campaign id is a reserved object key' }];
    if (Object.hasOwn(ctx.characters, file.build.id))
      return [{ level: 'block', reason: `Character "${file.build.id}" already exists` }];
    if (
      Object.hasOwn(ctx.campaigns, file.campaign.id) &&
      !equalData(ctx.campaigns[file.campaign.id], file.campaign)
    )
      return [
        { level: 'block', reason: 'The imported campaign conflicts with the saved campaign' },
      ];
    try {
      validateManagementData(
        {
          campaigns: { ...ctx.campaigns, [file.campaign.id]: file.campaign },
          characters: { ...ctx.characters, [file.build.id]: characterFrom(file) },
        },
        ctx.registry,
      );
      validateImportedHistory(file, ctx.registry);
      return [];
    } catch (error) {
      return [{ level: 'block', reason: message(error) }];
    }
  },
  apply: (draft, { file }) => {
    const copy = structuredClone(file);
    if (!Object.hasOwn(draft.campaigns, copy.campaign.id))
      draft.campaigns[copy.campaign.id] = copy.campaign;
    draft.characters[copy.build.id] = characterFrom(copy);
    return `Add character: ${copy.build.name}`;
  },
};

export const duplicateCharacter: ManagementCommand<{ sourceId: string; id: string; name: string }> =
  {
    name: 'duplicateCharacter',
    check: (ctx, { sourceId, id, name }) => {
      if (!Object.hasOwn(ctx.characters, sourceId))
        return [{ level: 'block', reason: 'Character to duplicate does not exist' }];
      if (!id.trim() || !name.trim())
        return [{ level: 'block', reason: 'A character id and name are required' }];
      if (RESERVED_IDS.has(id))
        return [{ level: 'block', reason: `Character id "${id}" is reserved` }];
      if (Object.hasOwn(ctx.characters, id))
        return [{ level: 'block', reason: `Character "${id}" already exists` }];
      return [];
    },
    apply: (draft, { sourceId, id, name }, ctx) => {
      const source = structuredClone(ctx.characters[sourceId]!);
      source.build.id = id;
      source.build.name = name.trim();
      source.live.characterId = id;
      source.events = [];
      draft.characters[id] = source;
      return `Duplicate ${ctx.characters[sourceId]!.build.name}: ${source.build.name}`;
    },
  };

export const deleteCharacter: ManagementCommand<{ characterId: string }> = {
  name: 'deleteCharacter',
  check: (ctx, { characterId }) =>
    Object.hasOwn(ctx.characters, characterId)
      ? []
      : [{ level: 'block', reason: 'Character does not exist' }],
  apply: (draft, { characterId }) => {
    const name = draft.characters[characterId]!.build.name;
    delete draft.characters[characterId];
    return `Delete character: ${name}`;
  },
};

export const createCampaign: ManagementCommand<{ campaign: Campaign }> = {
  name: 'createCampaign',
  check: (ctx, { campaign }) => {
    if (!CampaignSchema.safeParse(campaign).success)
      return [{ level: 'block', reason: 'Campaign settings are invalid' }];
    if (RESERVED_IDS.has(campaign.id))
      return [{ level: 'block', reason: `Campaign id "${campaign.id}" is reserved` }];
    return Object.hasOwn(ctx.campaigns, campaign.id)
      ? [{ level: 'block', reason: `Campaign "${campaign.id}" already exists` }]
      : [];
  },
  apply: (draft, { campaign }) => {
    draft.campaigns[campaign.id] = structuredClone(campaign);
    return `Create campaign: ${campaign.name}`;
  },
};

function characterFrom({ build, live, events }: ExportFile) {
  return { build, live, events };
}

function validateImportedHistory(file: ExportFile, registry: Registry) {
  const imported = structuredClone(file);
  let state = { campaign: imported.campaign, build: imported.build, live: imported.live };
  let events = imported.events;
  for (let index = 0; index < EVENT_LIMIT; index += 1) {
    const result = undo(state, events, {
      eventId: `import-validation-${index}`,
      realTime: '1970-01-01T00:00:00.000Z',
    });
    if (result.result === 'blocked') return;
    if (result.next.build.id !== file.build.id) throw new Error('Undo changes character identity');
    validateManagementData(
      {
        campaigns: { [file.campaign.id]: file.campaign },
        characters: {
          [file.build.id]: { build: result.next.build, live: result.next.live, events: [] },
        },
      },
      registry,
    );
    state = result.next;
    events = result.events;
  }
}

function atPath(value: unknown, path: Patch['path']): { exists: boolean; value?: unknown } {
  for (const key of path) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key))
      return { exists: false };
    value = (value as Record<string | number, unknown>)[key];
  }
  return { exists: true, value };
}

/** JSON object key order is immaterial when comparing imported campaigns or patch values. */
export function equalData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        equalData((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    )
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid character data';
}
