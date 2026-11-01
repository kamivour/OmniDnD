import { createStore } from 'zustand/vanilla';
import { registry } from '../data/registry';
import { seedFile } from '../data/seed';
import type { CharacterState } from '../engine/calc/sheet';
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
  type Campaign,
  type CharacterBuild,
  type ExportFile,
  type LiveState,
  type LogEvent,
} from '../engine/schema';

export interface CharacterRecord {
  build: CharacterBuild;
  live: LiveState;
  events: LogEvent[];
}

export interface CharacterStoreState {
  campaigns: Record<string, Campaign>;
  characters: Record<string, CharacterRecord>;
  automation: Automation;
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

/** The UI mirrors engine results only. Persistence subscribes to this store in the next task. */
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
    automation: 'assisted',
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
        set({
          characters: {
            ...current.characters,
            [characterId]: {
              build: result.next.build,
              live: result.next.live,
              events: appendEvent(events, result.event),
            },
          },
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
        set({
          characters: {
            ...current.characters,
            [characterId]: {
              build: result.next.build,
              live: result.next.live,
              events: result.events,
            },
          },
        });
      }
      return result;
    },
  }));
}

export type CharacterStore = ReturnType<typeof createCharacterStore>;

export const characterStore = createCharacterStore();
