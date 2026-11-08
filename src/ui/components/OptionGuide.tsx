import { guidanceFor } from '../../data/guidance';
import type { Difficulty, Guidance } from '../../engine/schema';

const DIFFICULTY: Record<Difficulty, string> = {
  easy: 'Easy to play',
  medium: 'Medium',
  hard: 'Harder to play',
};

/** Pitch, difficulty, strengths and weaknesses for one option. */
export function GuidanceCard({ name, guidance }: { name: string; guidance: Guidance }) {
  return (
    <article
      aria-label={`${name} guide`}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 text-sm"
    >
      <header className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="font-semibold text-text">{name}</h3>
        {guidance.difficulty && (
          <span className="text-xs text-text-muted">{DIFFICULTY[guidance.difficulty]}</span>
        )}
        {guidance.mainAbilities && (
          <span className="text-xs text-text-muted">
            Best at {guidance.mainAbilities.join(', ')}
          </span>
        )}
      </header>
      <p className="text-text">{guidance.pitch}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <section aria-label="Strengths">
          <p className="text-xs font-semibold text-text-muted">Strengths</p>
          <ul className="list-disc pl-5 text-text">
            {guidance.strengths.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <section aria-label="Weaknesses">
          <p className="text-xs font-semibold text-text-muted">Weaknesses</p>
          <ul className="list-disc pl-5 text-text">
            {guidance.weaknesses.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

/**
 * Beginner help under a Select: the chosen option's card, and a list to compare every option
 * and pick from. Renders nothing when there is no guidance to show.
 */
export function OptionGuide({
  noun,
  options,
  value,
  onChange,
}: {
  noun: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const chosen = options.find((option) => option.id === value);
  const chosenGuidance = guidanceFor(value);
  const rows = options.flatMap((option) => {
    const guidance = guidanceFor(option.id);
    return guidance ? [{ option, guidance }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      {chosen && chosenGuidance && <GuidanceCard name={chosen.name} guidance={chosenGuidance} />}
      <details className="rounded-card border border-border bg-surface p-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-accent">Compare {noun}</summary>
        <ul className="flex flex-col">
          {rows.map(({ option, guidance }) => (
            <li key={option.id} className="border-t border-border first:border-0">
              <button
                type="button"
                aria-pressed={option.id === value}
                onClick={() => onChange(option.id)}
                className="flex min-h-11 w-full flex-col items-start gap-0.5 py-2 text-left"
              >
                <span className={option.id === value ? 'font-semibold text-accent' : 'text-text'}>
                  {option.name}
                  {guidance.difficulty && (
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      {DIFFICULTY[guidance.difficulty]}
                    </span>
                  )}
                </span>
                <span className="text-xs text-text-muted">{guidance.pitch}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
