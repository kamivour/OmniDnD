import { CHAPTERS } from '../tutorial/steps';
import { tour } from '../tutorial/store';
import { useTourProgress } from '../tutorial/useTour';

const button =
  'inline-flex min-h-11 items-center justify-center rounded-btn border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-40';

/** Replay the guided tour or turn off the short tips. Stored on this device only. */
export function TutorialSection() {
  const progress = useTourProgress();
  return (
    <section
      aria-labelledby="settings-tutorial-title"
      id="settings-tutorial"
      className="flex flex-col gap-3"
    >
      <h2 id="settings-tutorial-title" className="text-base font-semibold">
        Tutorial
      </h2>
      <label className="flex min-h-11 items-center gap-3 rounded-card border border-border bg-surface p-3">
        <input
          type="checkbox"
          checked={progress.tipsOn}
          onChange={(event) => tour.setTips(event.target.checked)}
          className="size-4 accent-(--omni-accent)"
        />
        Show screen tips
      </label>
      <p className="text-sm text-text-muted">
        Short tips appear the first time you open a screen. Stored on this device only.
      </p>
      <div className="flex flex-wrap gap-2">
        {CHAPTERS.map((chapter) => (
          <button
            key={chapter.id}
            type="button"
            onClick={() => tour.start(chapter.id)}
            className={button}
          >
            Replay: {chapter.title}
          </button>
        ))}
        <button
          type="button"
          disabled={progress.done.length === 0}
          onClick={() => tour.resetTips()}
          className={button}
        >
          Reset tips
        </button>
      </div>
    </section>
  );
}
