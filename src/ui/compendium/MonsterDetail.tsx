import { useContext, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Swords } from 'lucide-react';
import { useStore } from 'zustand';
import { addCombatant } from '../../engine/commands/encounter';
import { SOURCE_NAMES } from '../../engine/calc/campaign-rules';
import type { CreatureDef } from '../../engine/schema';
import { characterState, characterStore } from '../../state/character-store';
import { useMonsterPack } from '../../state/monster-pack';
import { CommandContext } from '../commands/command-context';
import { CreatureStatblock } from '../reference/CreatureStatblock';
import { cx } from '../cx';

/** One monster: book tags, the stat block, notes to check and the pack's lore (M50). */
export function MonsterDetail({
  creature,
  action,
  titleInSheet = false,
}: {
  creature: CreatureDef;
  /** Shown under the header, e.g. "Add to encounter" inside a character. */
  action?: ReactNode;
  titleInSheet?: boolean;
}) {
  const lore = useMonsterPack((state) => state.lore);
  const families = (creature.loreIds ?? []).flatMap((id) => lore.get(id) ?? []);
  return (
    <article aria-label={creature.name} className="flex min-w-0 flex-col gap-4 text-sm">
      <header className={cx('flex min-w-0 flex-col items-start gap-1.5', !titleInSheet && 'pr-7')}>
        {!titleInSheet && <h2 className="font-display text-lg wrap-anywhere">{creature.name}</h2>}
        {creature.books ? (
          <ul aria-label="Books" className="flex flex-wrap gap-1.5 text-xs">
            {creature.books.map((book) => (
              <li
                key={`${book.source}-${book.page}`}
                title={SOURCE_NAMES[book.source]}
                className="rounded-btn border border-border px-2 py-0.5"
              >
                {book.source} p. {book.page}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">{SOURCE_NAMES[creature.source]}</p>
        )}
        <p className="text-xs text-text-muted">
          {creature.srd ? 'SRD 5.1' : 'From your monster pack'}
        </p>
      </header>
      {action}
      {creature.review?.length ? (
        <section
          aria-label="Check against the book"
          className="flex flex-col gap-1 rounded-card border border-warn bg-surface p-3"
        >
          <h3 className="font-semibold text-warn">Check against the book</h3>
          <p className="text-text-muted">
            The pack could not confirm these parts. Compare them with the printed page.
          </p>
          <ul className="list-disc pl-5">
            {creature.review.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <CreatureStatblock creature={creature} />
      {families.length > 0 && (
        <section aria-label="Lore" className="flex flex-col gap-2">
          <h3 className="font-semibold">Lore</h3>
          {families.map((family) => (
            <details key={family.id} className="rounded-card border border-border px-3 py-2">
              <summary className="min-h-9 cursor-pointer py-1 font-medium">
                {family.title ?? creature.name}{' '}
                <span className="font-normal text-text-muted">
                  · {family.source} p. {family.page}
                </span>
              </summary>
              <div className="flex flex-col gap-2 pb-1">
                {family.sections.map((section, index) => (
                  <div key={index}>
                    {section.title && <h4 className="font-semibold">{section.title}</h4>}
                    <p className="whitespace-pre-line text-text-muted">{section.text}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}
    </article>
  );
}

/**
 * Adds one copy of the monster to the character's open fight with average hit points.
 * Hidden when no fight is running; more copies and rolled hit points stay on the Combat screen.
 */
export function AddToEncounter({
  characterId,
  creatureId,
}: {
  characterId: string;
  creatureId: string;
}) {
  const commands = useContext(CommandContext);
  const fighting = useStore(
    characterStore,
    (s) => characterState(s, characterId)?.live.encounter !== undefined,
  );
  const [added, setAdded] = useState<string>();
  if (!commands || !fighting) return null;
  const add = (side: 'enemy' | 'ally') =>
    commands.run(addCombatant, { kind: 'creature', creatureId, side }, undefined, () =>
      setAdded(side === 'enemy' ? 'Added as an enemy.' : 'Added as an ally.'),
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => add('enemy')}
        className="inline-flex min-h-11 items-center gap-2 rounded-btn border border-border px-3 text-sm font-semibold hover:bg-surface-2"
      >
        <Swords size={16} aria-hidden /> Add to encounter
      </button>
      <button
        type="button"
        onClick={() => add('ally')}
        className="inline-flex min-h-11 items-center rounded-btn border border-border px-3 text-sm hover:bg-surface-2"
      >
        Add as ally
      </button>
      {added && (
        <p role="status" className="text-xs text-text-muted">
          {added}{' '}
          <Link
            to={`/characters/${encodeURIComponent(characterId)}/combat`}
            className="text-accent underline"
          >
            Open Combat
          </Link>
        </p>
      )}
    </div>
  );
}
