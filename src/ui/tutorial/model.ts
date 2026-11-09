import { z } from 'zod';

/** One card of a tour. `target` is a `data-tour` id; no target (or a missing one) centers the card. */
export interface TourStep {
  id: string;
  target?: string;
  title: string;
  body: string;
}

export type ChapterId =
  'welcome' | 'character' | 'combat' | 'spells' | 'rest' | 'inventory' | 'party';

export interface Chapter {
  id: ChapterId;
  title: string;
  /** Chapters after the first two are screen tips: they respect the "Show screen tips" switch. */
  tip: boolean;
  steps: readonly TourStep[];
}

/** Device-only tutorial state. Never synced, never part of a character. */
export interface TutorialProgress {
  /** Chapters finished or skipped on this device. */
  done: ChapterId[];
  tipsOn: boolean;
}

export const EMPTY_PROGRESS: TutorialProgress = { done: [], tipsOn: true };

const ProgressSchema = z.object({
  done: z.array(z.enum(['welcome', 'character', 'combat', 'spells', 'rest', 'inventory', 'party'])),
  tipsOn: z.boolean(),
});

/** Read saved progress; anything unreadable counts as a fresh device. */
export function parseProgress(raw: string | null): TutorialProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const parsed = ProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function markDone(progress: TutorialProgress, id: ChapterId): TutorialProgress {
  return progress.done.includes(id) ? progress : { ...progress, done: [...progress.done, id] };
}

/** "Reset tips": every chapter shows again; the switch keeps its setting. */
export function resetTips(progress: TutorialProgress): TutorialProgress {
  return { ...progress, done: [] };
}

/** True when this chapter should start by itself on a screen that has just appeared. */
export function shouldAutostart(progress: TutorialProgress, chapter: Chapter): boolean {
  if (progress.done.includes(chapter.id)) return false;
  return chapter.tip ? progress.tipsOn : true;
}

/** Step to show after moving by `delta`, or `'end'` once past the last step. Never goes before 0. */
export function moveStep(index: number, delta: 1 | -1, length: number): number | 'end' {
  const next = index + delta;
  if (next >= length) return 'end';
  return Math.max(0, next);
}
