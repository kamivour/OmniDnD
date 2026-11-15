import { useState } from 'react';
import { useNavigate } from 'react-router';
import { sampleFileFor } from '../../data/seed';
import { addCharacter } from '../../engine/commands/management';
import type { Campaign } from '../../engine/schema';
import type { useManagement } from '../commands/useManagement';

type Management = ReturnType<typeof useManagement>;

/** Lets a new player skip the form and open a ready-made character in this campaign. */
export function SampleCharacterOffer({
  campaign,
  run,
  pending,
}: {
  campaign: Campaign;
  run: Management['run'];
  pending: boolean;
}) {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<string[]>([]);
  // A shared campaign syncs to the party; a sample there would show up for everyone.
  if (campaign.shared) return null;
  return (
    <aside
      aria-label="Sample character"
      className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 text-sm"
    >
      <p className="min-w-0 flex-1 text-text-muted">
        Just looking around? Add The Fool, a ready-made level 3 bard, to this campaign.
      </p>
      <button
        type="button"
        disabled={pending}
        className="min-h-11 rounded-btn border border-border px-3 text-accent disabled:opacity-40"
        onClick={() => {
          setErrors([]);
          const id = crypto.randomUUID();
          const result = run(addCharacter, { file: sampleFileFor(campaign, id) }, () => {
            void navigate(`/characters/${id}`);
          });
          if (result.result === 'blocked') setErrors(result.reasons);
        }}
      >
        Try the sample character
      </button>
      {errors.length > 0 && (
        <p role="alert" className="w-full text-text">
          {errors.join(' ')}
        </p>
      )}
    </aside>
  );
}
