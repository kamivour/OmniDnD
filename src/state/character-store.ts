import { createStore } from 'zustand/vanilla';
import { registry } from '../data/registry';
import { seedFile } from '../data/seed';
import type { CharacterState } from '../engine/calc/sheet';
import {
  runManagement,
  undoManagement as undoManagementCommand,
  appendManagementEvent,
  type ManagementCommand,
  type ManagementEvent,
  type ManagementRunResult,
  type ManagementUndoResult,
} from '../engine/commands/management';
import {
  appendEvent,
  runCommand,
  undo as undoCommand,
  type Automation,
  type Command,
  type RunOptions,
  type RunResult,
  type UndoResult,
} from '../engine/commands/runner';
import {
  ExportFileSchema,
  type Bookmark,
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../engine/schema';
import { recordActivity, type ActivityReference } from './activity-order';

export interface CharacterRecord {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

export interface CharacterStoreState {
  campaigns: Record<string, Campaign>;
  characters: Record<string, CharacterRecord>;
  bookmarks: Bookmark[];
  automation: Automation;
  reducedMotion: boolean;
  managementEvents: ManagementEvent[];
  /** Optional local ordering only; never part of character files or engine events. */
  activityOrder?: ActivityReference[];
  dispatchManagement: <Payload>(
    command: ManagementCommand<Payload>,
    payload: Payload,
    options?: Partial<RunOptions>,
  ) => ManagementRunResult;
  undoManagement: (options?: Partial<RunOptions>) => ManagementUndoResult;
  dispatch: <Payload>(
    characterId: string,
    command: Command<Payload>,
    payload: Payload,
    options?: Partial<RunOptions>,
  ) => RunResult;
  undo: (characterId: string, options?: Pick<RunOptions, 'eventId' | 'realTime'>) => UndoResult;
}

/** Join the current campaign rules; character records never keep a second campaign copy. */
export function characterState(
  state: Pick<CharacterStoreState, 'campaigns' | 'characters'>,
  characterId: string,
): CharacterState | undefined {
  if (!Object.hasOwn(state.characters, characterId)) return undefined;
  const record = state.characters[characterId];
  if (!record || !Object.hasOwn(state.campaigns, record.build.campaignId)) return undefined;
  const campaign = state.campaigns[record.build.campaignId];
  return campaign ? { campaign, build: record.build, live: record.live } : undefined;
}

function eventMetadata(options?: Partial<Pick<RunOptions, 'eventId' | 'realTime'>>) {
  return {
    eventId: options?.eventId ?? crypto.randomUUID(),
    realTime: options?.realTime ?? new Date().toISOString(),
  };
}

/** The UI mirrors engine results only; persistence subscribes to successful changes. */
export function createCharacterStore(files: ExportFile[] = [seedFile]) {
  // Validation also clones the input, so independent stores cannot share mutable seed state.
  const validated = files.map((file) => ExportFileSchema.parse(file));
  const campaigns = Object.fromEntries(validated.map((file) => [file.campaign.id, file.campaign]));
  const characters = Object.fromEntries(
    validated.map(({ build, live, events }) => [build.id, { build, live, events }]),
  );

  return createStore<CharacterStoreState>()((set, get) => ({
    campaigns,
    characters,
    bookmarks: [],
    automation: 'assisted',
    reducedMotion: false,
    managementEvents: [],
    dispatchManagement: (command, payload, options) => {
      const current = get();
      const result = runManagement(command, current, payload, registry, {
        ...eventMetadata(options),
        force: options?.force,
      });
      if (result.result === 'ok') {
        const next = {
          ...current,
          ...result.next,
          managementEvents: appendManagementEvent(current.managementEvents, result.event),
        };
        set({
          ...result.next,
          managementEvents: next.managementEvents,
          activityOrder: recordActivity(next, { scope: 'workspace', eventId: result.event.id }),
        });
      }
      return result;
    },
    undoManagement: (options) => {
      const current = get();
      const result = undoManagementCommand(
        current,
        current.managementEvents,
        registry,
        eventMetadata(options),
        options?.force,
      );
      if (result.result === 'ok') {
        const next = { ...current, ...result.next, managementEvents: result.events };
        set({
          ...result.next,
          managementEvents: result.events,
          activityOrder: recordActivity(next, { scope: 'workspace', eventId: result.event.id }),
        });
      }
      return result;
    },
    dispatch: (characterId, command, payload, options) => {
      const current = get();
      const state = characterState(current, characterId);
      if (!state) throw new Error(`Character "${characterId}" not found`);
      const result = runCommand(command, state, payload, registry, {
        ...eventMetadata(options),
        automation: options?.automation ?? current.automation,
        force: options?.force ?? false,
      });
      if (result.result === 'ok') {
        const events = current.characters[characterId]?.events ?? [];
        const characters = {
          ...current.characters,
          [characterId]: {
            build: result.next.build,
            live: result.next.live,
            events: appendEvent(events, result.event),
          },
        };
        set({
          characters,
          activityOrder: recordActivity(
            { ...current, characters },
            { scope: 'character', characterId, eventId: result.event.id },
          ),
        });
      }
      return result;
    },
    undo: (characterId, options) => {
      const current = get();
      const state = characterState(current, characterId);
      if (!state) throw new Error(`Character "${characterId}" not found`);
      const events = current.characters[characterId]?.events ?? [];
      const result = undoCommand(state, events, eventMetadata(options));
      if (result.result === 'ok') {
        const characters = {
          ...current.characters,
          [characterId]: {
            build: result.next.build,
            live: result.next.live,
            events: result.events,
          },
        };
        set({
          characters,
          activityOrder: recordActivity(
            { ...current, characters },
            { scope: 'character', characterId, eventId: result.event.id },
          ),
        });
      }
      return result;
    },
  }));
}

export type CharacterStore = ReturnType<typeof createCharacterStore>;

export const characterStore = createCharacterStore();
