import { registry } from '../../data/registry';
import { SpellCard } from '../components/cards';
import { useCharacter } from '../hooks/useCharacter';
import { spellbookModel } from './spellbook-model';
import { SpellCastControls } from './SpellCastControls';

/** Shared live details for Spellbook and Combat, including content pinned before a command. */
export function LiveSpellDetail({
  spellId,
  classId,
  returnFocusTo,
  onApplied,
}: {
  spellId: string;
  classId: string;
  returnFocusTo?: HTMLElement;
  onApplied?: () => void;
}) {
  const { state, sheet } = useCharacter();
  const model = spellbookModel(state, sheet, registry);
  const entry = model.entries.find(
    (entry) => entry.spell.id === spellId && entry.classId === classId,
  );
  if (!entry) return <p className="text-sm text-text-muted">This spell is no longer selected.</p>;
  return (
    <div className="flex flex-col gap-4">
      <SpellCard spell={entry.spell} dc={entry.dc} attack={entry.attack} />
      <SpellCastControls
        key={`${classId}:${spellId}`}
        spellId={spellId}
        classId={classId}
        returnFocusTo={returnFocusTo}
        onApplied={onApplied}
      />
    </div>
  );
}
