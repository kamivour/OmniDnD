import seed from '../../../data/characters/the-fool.json';
import { registry } from '../../data/registry';
import { computeSheet, type CharacterState } from '../calc/sheet';
import { ExportFileSchema, type LiveState, type LogEvent } from '../schema';
import { appendEvent, runCommand, undo, type Command, type RunResult } from './runner';

/** Test-only helpers for command tests. Not imported by app code. */

const fool = ExportFileSchema.parse(seed);

/** The Fool as seeded: HP 11/19, L1 slots 0/4, L2 2/2, Bardic Inspiration 3/5, Day 1 08:00. */
export const seedState: CharacterState = {
  campaign: fool.campaign,
  build: fool.build,
  live: fool.live,
};

/** The Fool fully rested (TEST_CHARACTER §6 start): HP 19/19, every slot and use back. */
export const freshState: CharacterState = withLive(seedState, {
  hp: 19,
  slotsUsed: seedState.live.slotsUsed.map(() => 0),
  featureUsesSpent: {},
});

export function withLive(state: CharacterState, live: Partial<LiveState>): CharacterState {
  return { ...state, live: { ...state.live, ...live } };
}

/** A character with its event log: runs commands like the app will, and undoes them. */
export class Session {
  state: CharacterState;
  events: LogEvent[] = [];
  private count = 0;

  constructor(state: CharacterState = freshState) {
    this.state = state;
  }

  get live(): LiveState {
    return this.state.live;
  }

  get sheet() {
    return computeSheet(this.state, registry);
  }

  /** Runs a command; the state changes only when the result is ok. */
  try<P>(command: Command<P>, payload: P, force = false): RunResult {
    const result = runCommand(command, this.state, payload, registry, {
      ...this.nextIds(),
      force,
    });
    if (result.result === 'ok') {
      this.state = result.next;
      this.events = appendEvent(this.events, result.event);
    }
    return result;
  }

  /** Runs a command that must succeed and returns its log text. */
  run<P>(command: Command<P>, payload: P, force = false): string {
    const result = this.try(command, payload, force);
    if (result.result !== 'ok') {
      throw new Error(`${command.name} ${result.result}: ${result.reasons.join('; ')}`);
    }
    return result.event.text;
  }

  /** What the command would do: blocked or warn with reasons, or ok with info. Changes nothing. */
  preview<P>(command: Command<P>, payload: P) {
    const { result, reasons } = runCommand(command, this.state, payload, registry, this.nextIds());
    return { result, reasons };
  }

  undo(): string {
    const result = undo(this.state, this.events, this.nextIds());
    if (result.result !== 'ok') throw new Error(result.reasons.join('; '));
    this.state = result.next;
    this.events = result.events;
    return result.event.text;
  }

  private nextIds() {
    this.count += 1;
    return { eventId: `e${this.count}`, realTime: '2026-11-02T10:00:00.000Z' };
  }
}
