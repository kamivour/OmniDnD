import type { Difficulty, Guidance } from '../../engine/schema';
import { Caution } from './Caution';

const DIFFICULTY: Record<Difficulty, string> = {
  easy: 'Easy to play',
  medium: 'Medium',
  hard: 'Harder to play',
};

/** Pitch, difficulty, strengths and weaknesses for one option. */
export function GuidanceCard({
  name,
  guidance,
  showPitch = true,
}: {
  name: string;
  guidance: Guidance;
  showPitch?: boolean;
}) {
  return (
    <article
      aria-label={`${name} guide`}
      className="@container flex flex-col gap-2 rounded-card border border-border bg-surface p-3 text-sm"
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
      {showPitch && <p className="text-text">{guidance.pitch}</p>}
      <div className="grid gap-2 @min-[30rem]:grid-cols-2">
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
          <Caution>
            <ul className="list-disc pl-4">
              {guidance.weaknesses.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Caution>
        </section>
      </div>
    </article>
  );
}
