import { applyPatches, enablePatches, produceWithPatches, type Draft } from 'immer';
import { computeSheet, type CharacterState, type Sheet } from '../calc/sheet';
import type { Registry } from '../registry';
import {
  CharacterBuildSchema,
  LiveStateSchema,
  type CharacterBuild,
  type LiveState,
  type LogEvent,
} from '../schema';

enablePatches();

/** Assisted: validate and warn. Manual: track only; Block still applies (SPEC §5 Settings). */
export type Automation = 'assisted' | 'manual';

/**
 * Validation levels (SPEC §6, D10). Block: no resource left, the command does not run.
 * Warn: a rule limit the player may override with "Do anyway". Info: a reminder, never stops.
 */
export interface Check {
  level: 'block' | 'warn' | 'info';
  reason: string;
}

/** The part of a character that commands change. Patch paths start at `build` or `live`. */
export interface CharacterData {
  build: CharacterBuild;
  live: LiveState;
}

export interface CommandContext extends CharacterState {
  registry: Registry;
  sheet: Sheet;
}

/** Caller-supplied metadata is available only when a command actually applies. */
export interface CommandApplyContext extends CommandContext {
  eventId: string;
  automation: Automation;
}

export interface Command<Payload> {
  name: string;
  /** Rule checks against the state before the command runs. */
  check?: (ctx: CommandContext, payload: Payload) => Check[];
  /** Changes the draft and returns the log line, e.g. "Cast Faerie Fire (L1 slot)". */
  apply: (draft: Draft<CharacterData>, payload: Payload, ctx: CommandApplyContext) => string;
}

export interface RunOptions {
  /** Event id and real time come from the caller, so the engine stays deterministic. */
  eventId: string;
  realTime: string;
  /** The user chose "Do anyway" on the warnings. */
  force?: boolean;
  automation?: Automation;
}

export type RunResult =
  | { result: 'blocked' | 'warn'; reasons: string[] }
  /** `reasons` holds the Info notes. */
  | { result: 'ok'; reasons: string[]; next: CharacterState; event: LogEvent };

/** Keep the last 500 events per character (DATA.md §5). */
export const EVENT_LIMIT = 500;

export function runCommand<Payload>(
  command: Command<Payload>,
  state: CharacterState,
  payload: Payload,
  registry: Registry,
  { eventId, realTime, force = false, automation = 'assisted' }: RunOptions,
): RunResult {
  const ctx: CommandContext = { ...state, registry, sheet: computeSheet(state, registry) };
  const checks = command.check?.(ctx, payload) ?? [];
  const reasons = (level: Check['level']) =>
    checks.filter((check) => check.level === level).map((check) => check.reason);

  const blocks = reasons('block');
  if (blocks.length > 0) return { result: 'blocked', reasons: blocks };
  const warnings = automation === 'assisted' ? reasons('warn') : [];
  if (warnings.length > 0 && !force) return { result: 'warn', reasons: warnings };

  let text = '';
  const [next, patches, inversePatches] = produceWithPatches(
    { build: state.build, live: state.live },
    (draft) => {
      text = command.apply(draft, payload, { ...ctx, eventId, automation });
    },
  );
  assertValid(command.name, next);

  const event: LogEvent = {
    id: eventId,
    characterId: state.live.characterId,
    realTime,
    gameSeconds: state.live.clock.seconds,
    command: command.name,
    text,
    patches,
    inversePatches,
  };
  if (warnings.length > 0) event.override = true;
  return {
    result: 'ok',
    reasons: automation === 'assisted' ? reasons('info') : [],
    next: { ...state, ...next },
    event,
  };
}

export type UndoResult =
  | { result: 'blocked'; reasons: string[] }
  /** `events` has the undone event marked and the undo event appended. */
  | { result: 'ok'; next: CharacterState; event: LogEvent; events: LogEvent[] };

/** Linear undo (D5): reverts the last event that is not an undo and not yet undone. */
export function undo(
  state: CharacterState,
  events: readonly LogEvent[],
  { eventId, realTime }: Pick<RunOptions, 'eventId' | 'realTime'>,
): UndoResult {
  const target = events.findLast((event) => event.command !== 'undo' && !event.undoneBy);
  if (!target) return { result: 'blocked', reasons: ['Nothing to undo'] };

  const next = applyPatches({ build: state.build, live: state.live }, target.inversePatches);
  assertValid('undo', next);
  const event: LogEvent = {
    id: eventId,
    characterId: state.live.characterId,
    realTime,
    gameSeconds: state.live.clock.seconds,
    command: 'undo',
    text: `Undo: ${target.text}`,
    patches: target.inversePatches,
    inversePatches: target.patches,
  };
  const marked = events.map((entry) =>
    entry === target ? { ...entry, undoneBy: eventId } : entry,
  );
  return { result: 'ok', next: { ...state, ...next }, event, events: appendEvent(marked, event) };
}

/** Appends an event and drops the oldest past the limit. */
export function appendEvent(
  events: readonly LogEvent[],
  event: LogEvent,
  limit = EVENT_LIMIT,
): LogEvent[] {
  return [...events, event].slice(-limit);
}

/** A command that leaves an invalid character is a bug in the command, not a user error. */
function assertValid(name: string, { build, live }: CharacterData) {
  for (const [part, result] of [
    ['build', CharacterBuildSchema.safeParse(build)],
    ['live', LiveStateSchema.safeParse(live)],
  ] as const) {
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `${name} left an invalid ${part} at ${issue?.path.join('.')}: ${issue?.message}`,
      );
    }
  }
}
