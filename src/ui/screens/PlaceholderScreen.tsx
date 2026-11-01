import { Hourglass } from 'lucide-react';

/** Screens from later milestones exist as placeholders only (AGENTS.md). */
export function PlaceholderScreen({
  title,
  milestone,
  phase,
}: {
  title: string;
  milestone?: string;
  phase?: number;
}) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
      <Hourglass size={24} aria-hidden className="text-text-muted" />
      <h1 className="font-display text-lg text-text">{title}</h1>
      <p className="text-text-muted">
        {phase
          ? `Coming in Phase ${phase}.`
          : milestone
            ? `Coming in milestone ${milestone}.`
            : 'Nothing here.'}
      </p>
    </section>
  );
}
