import { useEffect } from 'react';
import { useStore } from 'zustand';
import { shouldAutostart, type ChapterId } from './model';
import { CHAPTERS } from './steps';
import { tour, tourStore } from './store';

export const useTourProgress = () => useStore(tourStore, (state) => state.progress);

/**
 * Start a chapter by itself the first time its screen appears on this device. Waits a beat so
 * the highlighted elements have rendered, and never interrupts a tour already on screen.
 */
export function useTourAutostart(id: ChapterId, ready = true) {
  const progress = useTourProgress();
  useEffect(() => {
    const chapter = CHAPTERS.find((entry) => entry.id === id);
    if (!ready || !chapter || chapter.steps.length === 0) return;
    if (!shouldAutostart(progress, chapter)) return;
    const timer = setTimeout(() => {
      if (!tourStore.getState().active) tour.start(id);
    }, 400);
    return () => clearTimeout(timer);
  }, [id, ready, progress]);
}
