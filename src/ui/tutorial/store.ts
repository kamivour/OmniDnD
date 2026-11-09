import { createStore } from 'zustand/vanilla';
import { markDone, parseProgress, resetTips, type ChapterId, type TutorialProgress } from './model';

const KEY = 'omnidnd.tutorial';

function load(): TutorialProgress {
  try {
    return parseProgress(localStorage.getItem(KEY));
  } catch {
    return parseProgress(null);
  }
}

function save(progress: TutorialProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Private mode or blocked storage: the tour just shows again next time.
  }
}

interface TourState {
  progress: TutorialProgress;
  /** The chapter on screen and its step, or null. */
  active: { chapter: ChapterId; index: number } | null;
}

export const tourStore = createStore<TourState>(() => ({ progress: load(), active: null }));

const update = (progress: TutorialProgress) => {
  save(progress);
  tourStore.setState({ progress });
};

export const tour = {
  start: (chapter: ChapterId) => tourStore.setState({ active: { chapter, index: 0 } }),
  goTo: (index: number) =>
    tourStore.setState((state) => (state.active ? { active: { ...state.active, index } } : state)),
  /** Finish or skip: this chapter never auto-starts again on this device. */
  close: () => {
    const { active, progress } = tourStore.getState();
    if (!active) return;
    tourStore.setState({ active: null });
    update(markDone(progress, active.chapter));
  },
  setTips: (tipsOn: boolean) => update({ ...tourStore.getState().progress, tipsOn }),
  resetTips: () => update(resetTips(tourStore.getState().progress)),
};
