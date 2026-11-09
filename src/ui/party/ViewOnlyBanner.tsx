import { Copy } from 'lucide-react';
import { useNavigate } from 'react-router';
import { duplicateCharacter } from '../../engine/commands/management';
import { useManagement } from '../commands/useManagement';

/** Shown on another player's character: nothing here changes it, but anyone can copy it. */
export function ViewOnlyBanner({
  characterId,
  characterName,
  ownerName,
}: {
  characterId: string;
  characterName: string;
  ownerName: string;
}) {
  const navigate = useNavigate();
  const { run, pending, confirmation } = useManagement();
  const copy = () => {
    const id = crypto.randomUUID();
    run(duplicateCharacter, { sourceId: characterId, id, name: `${characterName} (copy)` }, () =>
      navigate(`/characters/${encodeURIComponent(id)}`),
    );
  };
  return (
    <div
      role="note"
      aria-label="View only"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 text-sm"
    >
      <p className="min-w-0 flex-1 text-text-muted">
        View only. This is {ownerName || 'another player'}&apos;s character.
      </p>
      <button
        type="button"
        onClick={copy}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-border px-3 hover:bg-surface-2 disabled:opacity-40"
      >
        <Copy size={16} aria-hidden /> Duplicate to play
      </button>
      {confirmation}
    </div>
  );
}
