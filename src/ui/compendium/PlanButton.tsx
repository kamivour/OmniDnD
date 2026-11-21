import { useContext } from 'react';
import { Link } from 'react-router';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { useStore } from 'zustand';
import { planEntry, unplanEntry } from '../../engine/commands/journal';
import { characterState, characterStore } from '../../state/character-store';
import { CommandContext } from '../commands/command-context';

/**
 * "Plan this" inside a character: adds the entry to the Journal's plans.
 * Hidden on the standalone compendium, where there is no character to plan for.
 */
export function PlanButton({ characterId, entryId }: { characterId: string; entryId: string }) {
  const commands = useContext(CommandContext);
  const planned = useStore(
    characterStore,
    (s) =>
      characterState(s, characterId)?.build.journal.plans?.some((p) => p.entryId === entryId) ??
      false,
  );
  if (!commands) return null;
  const journal = `/characters/${encodeURIComponent(characterId)}/journal?tab=plans`;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        aria-pressed={planned}
        onClick={() => commands.run(planned ? unplanEntry : planEntry, { entryId })}
        className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-border px-3 text-sm font-semibold hover:bg-surface-2"
      >
        {planned ? (
          <BookmarkCheck size={16} aria-hidden className="text-accent" />
        ) : (
          <BookmarkPlus size={16} aria-hidden />
        )}
        {planned ? 'Planned' : 'Plan this'}
      </button>
      {planned && (
        <Link to={journal} className="text-xs text-accent underline">
          See plans in Journal
        </Link>
      )}
    </div>
  );
}
