import { Copy, Eye } from 'lucide-react';
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
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
    >
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-text-muted">
        <span className="inline-flex items-center gap-1 rounded-btn border border-border px-2 py-0.5 text-xs font-medium text-accent">
          <Eye size={13} aria-hidden /> View only
        </span>
        <span className="wrap-anywhere">{ownerName || 'Another player'}</span>
      </p>
      <button
        type="button"
        onClick={copy}
        disabled={pending}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-btn px-2 text-xs text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
      >
        <Copy size={16} aria-hidden /> Duplicate to play
      </button>
      {confirmation}
    </div>
  );
}
