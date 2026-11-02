import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import { registry } from '../data/registry';
import { computeSheet } from '../engine/calc/sheet';
import { EVENT_LIMIT, undo, type Automation } from '../engine/commands/runner';
import {
  ManagementEventSchema,
  undoManagement,
  type ManagementEvent,
} from '../engine/commands/management';
import {
  CampaignSchema,
  CharacterBuildSchema,
  ExportFileSchema,
  LiveStateSchema,
  LogEventSchema,
  SCHEMA_VERSION,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../engine/schema';
import type { CharacterRecord, CharacterStoreState } from '../state/character-store';

export interface StoredRecord<T> {
  id: string;
  schemaVersion: typeof SCHEMA_VERSION;
  data: T;
}

export interface StoredEvent extends StoredRecord<LogEvent> {
  characterId: string;
  order: number;
}

export type Workspace = Pick<
  CharacterStoreState,
  'campaigns' | 'characters' | 'automation' | 'managementEvents'
>;

export interface WorkspaceRows {
  builds: StoredRecord<CharacterBuild>[];
  live: StoredRecord<LiveState>[];
  events: StoredEvent[];
  campaigns: StoredRecord<Campaign>[];
  automation: Automation;
  /** Missing in the first M3 saves; they contain no management history. */
  managementEvents?: ManagementEvent[];
}

class OmniDatabase extends Dexie {
  builds!: Table<StoredRecord<CharacterBuild>, string>;
  live!: Table<StoredRecord<LiveState>, string>;
  events!: Table<StoredEvent, [string, string]>;
  campaigns!: Table<StoredRecord<Campaign>, string>;
  settings!: Table<StoredRecord<unknown>, string>;
  userPacks!: Table<StoredRecord<unknown>, string>;
  backups!: Table<StoredRecord<unknown>, string>;

  constructor() {
    super('omnidnd');
    this.version(1).stores({
      builds: 'id',
      live: 'id',
      events: '[characterId+id],characterId,[characterId+order]',
      campaigns: 'id',
      settings: 'id',
      userPacks: 'id',
      backups: 'id',
    });
  }
}

export const database = new OmniDatabase();
export const AutomationSchema = z.enum(['assisted', 'manual']);

const StoredRecordSchema = z.strictObject({
  id: z.string().min(1),
  schemaVersion: z.literal(SCHEMA_VERSION),
  data: z.unknown(),
});
const StoredEventSchema = StoredRecordSchema.extend({
  characterId: z.string().min(1),
  order: z.int().nonnegative(),
  data: LogEventSchema,
});

function assertVersion(row: unknown, label: string) {
  if (
    typeof row === 'object' &&
    row !== null &&
    'schemaVersion' in row &&
    row.schemaVersion !== SCHEMA_VERSION
  ) {
    throw new Error(`Unsupported ${label} schema version ${String(row.schemaVersion)}`);
  }
}

export function parseStoredRecord<T>(
  row: unknown,
  schema: z.ZodType<T>,
  label: string,
): StoredRecord<T> {
  assertVersion(row, label);
  const saved = StoredRecordSchema.parse(row);
  return { id: saved.id, schemaVersion: SCHEMA_VERSION, data: schema.parse(saved.data) };
}

export function storedRecord<T>(id: string, data: T): StoredRecord<T> {
  return { id, schemaVersion: SCHEMA_VERSION, data };
}

function validateCharacter(record: CharacterRecord, campaign: Campaign | undefined) {
  if (!campaign) throw new Error(`Character "${record.build.id}" has no saved campaign`);
  const file = ExportFileSchema.parse({
    app: 'omnidnd',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '1970-01-01T00:00:00.000Z',
    campaign,
    ...record,
  });
  computeSheet({ campaign: file.campaign, build: file.build, live: file.live }, registry);
  for (const spells of file.build.spells) {
    for (const id of [...spells.known, ...(spells.prepared ?? [])]) registry.get('spell', id);
  }
  if (file.live.concentration) registry.get('spell', file.live.concentration.spellId);
  if (file.events.length > EVENT_LIMIT)
    throw new Error(`Character "${file.build.id}" has too many saved events`);
  const eventIds = new Set<string>();
  for (const event of file.events) {
    if (eventIds.has(event.id)) throw new Error(`Duplicate saved event "${event.id}"`);
    if (
      [...event.patches, ...event.inversePatches].some(
        (patch) =>
          patch.path.length === 0 || (patch.path[0] !== 'build' && patch.path[0] !== 'live'),
      )
    ) {
      throw new Error(`Saved event "${event.id}" has an invalid patch root`);
    }
    eventIds.add(event.id);
  }
  return file;
}

/** Loaded history must remain usable; patch values cannot be validated by their shape alone. */
function validateUndoHistory(file: ExportFile) {
  let state = { campaign: file.campaign, build: file.build, live: file.live };
  let events = file.events;
  try {
    for (let index = 0; index < EVENT_LIMIT; index += 1) {
      const result = undo(state, events, {
        eventId: `load-validation-${index}`,
        realTime: '1970-01-01T00:00:00.000Z',
      });
      if (result.result === 'blocked') return;
      if (result.next.build.id !== file.build.id)
        throw new Error('Undo changed character identity');
      validateCharacter(
        { build: result.next.build, live: result.next.live, events: [] },
        file.campaign,
      );
      state = result.next;
      events = result.events;
    }
  } catch {
    throw new Error(`Saved undo history for "${file.build.id}" is invalid`);
  }
}

/** Validate and clone only source state. Derived sheet values never enter IndexedDB. */
export function serializeWorkspace(workspace: Workspace): WorkspaceRows {
  const campaigns = Object.entries(workspace.campaigns).map(([id, value]) => {
    const campaign = CampaignSchema.parse(value);
    if (id !== campaign.id) throw new Error('Campaign key does not match its saved id');
    return storedRecord(id, campaign);
  });
  const campaignMap = Object.fromEntries(campaigns.map(({ id, data }) => [id, data]));
  const builds: WorkspaceRows['builds'] = [];
  const live: WorkspaceRows['live'] = [];
  const events: WorkspaceRows['events'] = [];
  for (const [id, record] of Object.entries(workspace.characters)) {
    if (id !== record.build.id) throw new Error('Character key does not match its saved id');
    const campaign = Object.hasOwn(campaignMap, record.build.campaignId)
      ? campaignMap[record.build.campaignId]
      : undefined;
    const file = validateCharacter(record, campaign);
    builds.push(storedRecord(id, file.build));
    live.push(storedRecord(id, file.live));
    events.push(
      ...file.events.map((event, order) => ({
        ...storedRecord(event.id, event),
        characterId: id,
        order,
      })),
    );
  }
  return {
    builds,
    live,
    events,
    campaigns,
    automation: AutomationSchema.parse(workspace.automation),
    managementEvents: z
      .array(ManagementEventSchema)
      .max(EVENT_LIMIT)
      .parse(workspace.managementEvents),
  };
}

/** Reject damaged or unsupported records before any state is hydrated or written. */
export function deserializeWorkspace(rows: WorkspaceRows): Workspace {
  const campaigns: Workspace['campaigns'] = Object.fromEntries(
    rows.campaigns.map((row) => {
      const saved = parseStoredRecord(row, CampaignSchema, 'campaign');
      if (saved.id !== saved.data.id)
        throw new Error('Saved campaign id does not match its record');
      return [saved.id, saved.data];
    }),
  );
  const builds = rows.builds.map((row) => {
    const saved = parseStoredRecord(row, CharacterBuildSchema, 'build');
    if (saved.id !== saved.data.id) throw new Error('Saved build id does not match its record');
    return saved;
  });
  const live = Object.fromEntries(
    rows.live.map((row) => {
      const saved = parseStoredRecord(row, LiveStateSchema, 'live');
      if (saved.id !== saved.data.characterId)
        throw new Error('Saved live id does not match its character');
      return [saved.id, saved.data];
    }),
  );
  const events = rows.events.map((row) => {
    assertVersion(row, 'event');
    const saved = StoredEventSchema.parse(row);
    if (saved.id !== saved.data.id || saved.characterId !== saved.data.characterId) {
      throw new Error('Saved event id does not match its record');
    }
    return saved;
  });
  const buildIds = new Set(builds.map(({ id }) => id));
  if (Object.keys(live).some((id) => !buildIds.has(id)))
    throw new Error('Saved live state has no character');
  if (events.some(({ characterId }) => !buildIds.has(characterId)))
    throw new Error('Saved event has no character');
  const characters: [string, CharacterRecord][] = builds.map(({ id, data: build }) => {
    const characterLive = Object.hasOwn(live, id) ? live[id] : undefined;
    if (!characterLive) throw new Error(`Character "${id}" has no saved live state`);
    const ordered = events
      .filter(({ characterId }) => characterId === id)
      .sort((a, b) => a.order - b.order);
    if (ordered.some(({ order }, index) => order !== index))
      throw new Error(`Character "${id}" has invalid event order`);
    const campaign = Object.hasOwn(campaigns, build.campaignId)
      ? campaigns[build.campaignId]
      : undefined;
    const file = validateCharacter(
      { build, live: characterLive, events: ordered.map(({ data }) => data) },
      campaign,
    );
    validateUndoHistory(file);
    return [id, { build: file.build, live: file.live, events: file.events }];
  });
  const workspace = {
    campaigns,
    characters: Object.fromEntries(characters),
    automation: AutomationSchema.parse(rows.automation),
    managementEvents: z
      .array(ManagementEventSchema)
      .max(EVENT_LIMIT)
      .parse(rows.managementEvents ?? []),
  };
  let check = { campaigns: workspace.campaigns, characters: workspace.characters };
  let history = workspace.managementEvents;
  const ids = new Set(history.map((event) => event.id));
  if (ids.size !== history.length) throw new Error('Duplicate saved management event');
  try {
    for (let index = 0; index < EVENT_LIMIT; index += 1) {
      if (!history.some((event) => event.command !== 'undo' && !event.undoneBy)) break;
      const result = undoManagement(
        check,
        history,
        registry,
        { eventId: `load-management-${index}`, realTime: '1970-01-01T00:00:00.000Z' },
        true,
      );
      if (result.result !== 'ok') throw new Error('Saved management command cannot be undone');
      check = result.next;
      history = result.events;
    }
  } catch {
    throw new Error('Saved management undo history is invalid');
  }
  return workspace;
}
