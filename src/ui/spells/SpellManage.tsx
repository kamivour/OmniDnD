import { useEffect, useId, useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { changeSpellSelection, setSpellTags, spellSelectionDetails } from '../../engine/commands';
import type { SpellDef } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { useCharacterHistory } from '../log/useCharacterHistory';
import { overridePath } from '../../engine/calc/value-overrides';
import { OverrideMarker } from '../components/StatChip';
import { SpellInfoName } from './SpellInfoName';
import { SPELL_TYPE_ORDER, SPELL_TYPES, type SpellType } from '../spellTypes';

type SelectionList = 'known' | 'prepared';
interface Replacement {
  classId: string;
  list: SelectionList;
  spellId: string;
}

const secondaryButton =
  'min-h-11 rounded-btn border border-border px-3 text-sm text-text hover:border-accent disabled:cursor-not-allowed disabled:opacity-40';

function spellDefinition(id: string): SpellDef | undefined {
  const definition = registry.entries.get(id);
  return definition?.kind === 'spell' ? definition : undefined;
}

function spellName(id: string): string {
  return spellDefinition(id)?.name ?? id;
}

function spellMeta(id: string): string {
  const spell = spellDefinition(id);
  return spell
    ? `${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} · ${spell.school} · ${spell.source}`
    : 'Reference unavailable';
}

function sortSpells(ids: string[]): string[] {
  return [...ids].sort(
    (a, b) =>
      (spellDefinition(a)?.level ?? 10) - (spellDefinition(b)?.level ?? 10) ||
      spellName(a).localeCompare(spellName(b)),
  );
}

function matchesSearch(id: string, query: string): boolean {
  const spell = spellDefinition(id);
  return `${spellName(id)} ${spell?.school ?? ''} ${spell?.source ?? ''}`
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

/** Between-session spell choices. Every saved change uses the shared engine commands. */
export function SpellManage({
  onClose,
  initialClassId,
}: {
  onClose: () => void;
  initialClassId?: string;
}) {
  const { state, sheet, events } = useCharacter();
  const { run } = useCommand();
  const { target, undo, pending, confirmation } = useCharacterHistory();
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const replacementOpener = useRef<HTMLElement | null>(null);
  const tagsOpener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const classInputId = useId();
  const searchInputId = useId();
  const classIds = [
    ...new Set([
      ...state.build.classes
        .filter(({ classId }) => {
          const definition = registry.entries.get(classId);
          return definition?.kind === 'class' && definition.spellcasting;
        })
        .map(({ classId }) => classId),
      ...state.build.spells
        .filter(({ known, prepared }) => known.length > 0 || (prepared?.length ?? 0) > 0)
        .map(({ classId }) => classId),
    ]),
  ];
  const [chosenClass, setChosenClass] = useState(
    initialClassId && classIds.includes(initialClassId) ? initialClassId : (classIds[0] ?? ''),
  );
  const classId = classIds.includes(chosenClass) ? chosenClass : (classIds[0] ?? '');
  const details = classId
    ? spellSelectionDetails({ ...state, sheet, registry }, classId)
    : undefined;
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState<Replacement | null>(null);
  const [tagSpellId, setTagSpellId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedTagIds = sortSpells([
    ...new Set(
      state.build.spells.flatMap(({ known, prepared }) => [...known, ...(prepared ?? [])]),
    ),
  ]);

  useEffect(() => {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      container.current?.focus();
    }
  }, [events]);

  const remove = (list: SelectionList, spellId: string) => {
    setError(null);
    const result = run(
      changeSpellSelection,
      { classId, list, action: 'remove', spellId },
      container.current ?? undefined,
      () => {
        restoreFocus.current = true;
      },
    );
    if (result.result === 'blocked') setError(result.reasons.join(' · '));
  };
  const toggle = (list: SelectionList, spellId: string, checked: boolean) => {
    setError(null);
    const result = run(
      changeSpellSelection,
      { classId, list, action: checked ? 'add' : 'remove', spellId },
      container.current ?? undefined,
    );
    if (result.result === 'blocked') setError(result.reasons.join(' · '));
  };
  const beginReplacement = (list: SelectionList, spellId: string, opener: HTMLElement) => {
    replacementOpener.current = opener;
    setReplacement({ classId, list, spellId });
    setQuery('');
    setError(null);
    searchInput.current?.focus();
  };
  const cancelReplacement = () => {
    setReplacement(null);
    setError(null);
    // The selected-spell controls mount again after leaving the chooser.
    restoreFocus.current = true;
    requestAnimationFrame(() => {
      const opener = replacementOpener.current;
      (opener?.isConnected ? opener : container.current)?.focus();
      restoreFocus.current = false;
    });
  };
  const replace = (replacementId: string) => {
    if (!replacement) return;
    setError(null);
    const result = run(
      changeSpellSelection,
      { ...replacement, action: 'replace', replacementId },
      container.current ?? undefined,
      () => {
        setReplacement(null);
        setQuery('');
        restoreFocus.current = true;
      },
    );
    if (result.result === 'blocked') setError(result.reasons.join(' · '));
  };

  const candidateIds = (list: SelectionList, spellId: string) => {
    if (!details) return [];
    return list === 'prepared'
      ? details.candidates.prepared
      : spellDefinition(spellId)?.level === 0
        ? details.candidates.cantrips
        : details.candidates.known;
  };
  const replacementCandidates = replacement
    ? candidateIds(replacement.list, replacement.spellId).filter(
        (id) =>
          !details?.selection[replacement.list].includes(id) &&
          (spellDefinition(id)?.level === 0) ===
            (spellDefinition(replacement.spellId)?.level === 0),
      )
    : [];

  const renderSelected = (title: string, list: SelectionList, ids: string[]) =>
    ids.length > 0 && (
      <section aria-label={title} className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <ul className="flex flex-col gap-2">
          {sortSpells(ids).map((id) => {
            const candidates = candidateIds(list, id);
            const outsideList = !candidates.includes(id);
            const canReplace = candidates.some(
              (candidate) =>
                !details?.selection[list].includes(candidate) &&
                (spellDefinition(candidate)?.level === 0) === (spellDefinition(id)?.level === 0),
            );
            return (
              <li key={id} className="min-w-0 rounded-card border border-border bg-surface p-3">
                <p className="break-words font-semibold text-text">{spellName(id)}</p>
                <p className="text-xs text-text-muted">{spellMeta(id)}</p>
                {outsideList && (
                  <p className="mt-1 text-xs text-warn">
                    Outside the available list. Retained until you choose to change it.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Remove ${list} ${spellName(id)}`}
                    className={secondaryButton}
                    onClick={() => remove(list, id)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    aria-label={`Replace ${list} ${spellName(id)}`}
                    className={secondaryButton}
                    disabled={!canReplace}
                    onClick={(event) => beginReplacement(list, id, event.currentTarget)}
                  >
                    Replace
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );

  const renderCandidates = (title: string, list: SelectionList, ids: string[]) => {
    const visible = sortSpells(ids).filter((id) => matchesSearch(id, query));
    if (ids.length === 0) return null;
    return (
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold text-text">{title}</legend>
        {visible.length === 0 ? (
          <p className="text-xs text-text-muted">No matching spells.</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {visible.map((id) => (
              <li key={id} className="flex min-w-0 items-start gap-1 py-1 pr-3">
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={`${list === 'prepared' ? 'Prepare' : 'Know'} ${spellName(id)}`}
                    checked={details?.selection[list].includes(id) ?? false}
                    onChange={(event) => toggle(list, id, event.target.checked)}
                    className="size-4 accent-(--omni-accent)"
                  />
                </label>
                <span className="flex min-w-0 flex-col">
                  <SpellInfoName spellId={id} registry={registry} className="text-sm text-text" />
                  <span className="-mt-2 block pb-1 text-xs text-text-muted">{spellMeta(id)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
    );
  };

  return (
    <div ref={container} tabIndex={-1} className="flex max-h-[65dvh] min-w-0 flex-col gap-3">
      {details ? (
        <>
          <Field label="Casting class" htmlFor={classInputId}>
            <select
              id={classInputId}
              value={classId}
              className={inputClass}
              onChange={(event) => {
                setChosenClass(event.target.value);
                setReplacement(null);
                setQuery('');
                setError(null);
              }}
            >
              {classIds.map((id) => {
                const owned = state.build.classes.some((entry) => entry.classId === id);
                return (
                  <option key={id} value={id}>
                    {registry.entries.get(id)?.name ?? id}
                    {owned ? '' : ' (retained selections)'}
                  </option>
                );
              })}
            </select>
          </Field>
          <div aria-label="Spell selection counts" className="flex flex-wrap gap-x-4 gap-y-1">
            <Count
              label="cantrips"
              count={details.cantrips.count}
              limit={details.cantrips.limit}
              override={
                sheet.values[overridePath('spellcasting', classId, 'cantripsKnown')]?.stat.override
              }
            />
            {(details.mode === 'known' ||
              details.mode === 'spellbook' ||
              details.known.count > 0) && (
              <Count
                label={details.mode === 'spellbook' ? 'in spellbook' : 'known'}
                count={details.known.count}
                limit={details.known.limit}
                override={
                  sheet.values[overridePath('spellcasting', classId, 'spellsKnown')]?.stat.override
                }
              />
            )}
            {(details.mode === 'prepared' ||
              details.mode === 'spellbook' ||
              details.prepared.ids.length > 0) && (
              <Count
                label="prepared"
                count={details.prepared.count}
                limit={details.prepared.limit}
                override={
                  sheet.values[overridePath('spellcasting', classId, 'preparedLimit')]?.stat
                    .override
                }
              />
            )}
          </div>
          <Field label="Search available spells" htmlFor={searchInputId}>
            <input
              ref={searchInput}
              id={searchInputId}
              type="search"
              value={query}
              placeholder="Name, school, or source"
              className={inputClass}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {error && (
              <p role="alert" className="text-sm text-warn">
                {error}
              </p>
            )}
            {details.mode !== 'unsupported' && (
              <p className="text-xs text-text-muted">
                {details.name} level {details.classLevel} · Spells through level{' '}
                {details.maxSpellLevel}. Base limits are guidance; confirm feature or DM exceptions
                in the warning.
              </p>
            )}
            {details.warnings.length > 0 && (
              <ul
                aria-label="Spell selection warnings"
                className="list-disc space-y-1 pl-5 text-xs text-warn"
              >
                {details.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {replacement ? (
              <section aria-label="Choose replacement" className="flex flex-col gap-3">
                <h3 className="break-words text-sm font-semibold text-text">
                  Replace {replacement.list} {spellName(replacement.spellId)}
                </h3>
                <p className="text-xs text-text-muted">
                  Choose one replacement. Both changes are saved together and can be undone
                  together.
                </p>
                <button type="button" className={secondaryButton} onClick={cancelReplacement}>
                  Cancel replacement
                </button>
                <ul className="flex flex-col gap-2">
                  {sortSpells(replacementCandidates)
                    .filter((id) => matchesSearch(id, query))
                    .map((id) => (
                      <li key={id} className="min-w-0">
                        <button
                          type="button"
                          aria-label={`Choose ${spellName(id)}`}
                          className={`${secondaryButton} w-full p-3 text-left`}
                          onClick={() => replace(id)}
                        >
                          <span className="block break-words">Choose {spellName(id)}</span>
                          <span className="block text-xs text-text-muted">{spellMeta(id)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
                {!replacementCandidates.some((id) => matchesSearch(id, query)) && (
                  <p className="text-sm text-text-muted">No matching replacement spells.</p>
                )}
              </section>
            ) : (
              <>
                <section aria-label="Selected spells" className="flex flex-col gap-3">
                  <h2 className="text-base font-semibold text-text">Selected spells</h2>
                  {renderSelected('Cantrips', 'known', details.cantrips.ids)}
                  {renderSelected(
                    details.mode === 'spellbook'
                      ? 'Spellbook'
                      : details.mode === 'prepared'
                        ? 'Retained known spells'
                        : 'Known spells',
                    'known',
                    details.selection.known.filter((id) => !details.cantrips.ids.includes(id)),
                  )}
                  {renderSelected(
                    details.mode === 'known' ? 'Retained prepared spells' : 'Prepared spells',
                    'prepared',
                    details.selection.prepared,
                  )}
                  {details.selection.known.length === 0 &&
                    details.selection.prepared.length === 0 && (
                      <p className="text-sm text-text-muted">No spells selected for this class.</p>
                    )}
                </section>
                <section aria-label="Available spells" className="flex flex-col gap-3">
                  <h2 className="text-base font-semibold text-text">Available spells</h2>
                  {renderCandidates('Cantrips to know', 'known', details.candidates.cantrips)}
                  {renderCandidates(
                    details.mode === 'spellbook' ? 'Add to spellbook' : 'Spells to know',
                    'known',
                    details.candidates.known,
                  )}
                  {renderCandidates('Spells to prepare', 'prepared', details.candidates.prepared)}
                  {Object.values(details.candidates).every((ids) => ids.length === 0) && (
                    <p className="text-sm text-text-muted">
                      No available choices. Existing selections remain saved and can be removed.
                    </p>
                  )}
                </section>
                {selectedTagIds.length > 0 && (
                  <section aria-label="Spell tags" className="flex flex-col gap-2">
                    <h2 className="text-base font-semibold text-text">Spell tags</h2>
                    <p className="text-xs text-text-muted">
                      Tags apply to this character across all casting classes.
                    </p>
                    {selectedTagIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`${secondaryButton} break-words px-3 py-2 text-left`}
                        disabled={!spellDefinition(id)}
                        onClick={(event) => {
                          tagsOpener.current = event.currentTarget;
                          setTagSpellId(id);
                        }}
                      >
                        Edit tags for {spellName(id)}
                      </button>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted">This character has no spellcasting class.</p>
      )}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border pt-3">
        <button
          data-character-dialog-undo=""
          type="button"
          disabled={!target || pending}
          title={
            target
              ? `${target.scope === 'workspace' ? 'Workspace' : 'Character'}: ${target.event.text}`
              : 'No change to undo'
          }
          className={secondaryButton}
          onClick={(event) => {
            const control = event.currentTarget;
            control.focus();
            setError(null);
            undo();
            requestAnimationFrame(() => {
              if (control.matches(':disabled')) container.current?.focus();
            });
          }}
        >
          Undo last command
        </button>
        <button
          type="button"
          className="min-h-11 rounded-btn bg-accent px-3 font-semibold text-bg"
          onClick={onClose}
        >
          Done
        </button>
      </div>
      <Sheet
        open={tagSpellId !== null}
        onOpenChange={(open) => !open && setTagSpellId(null)}
        title={tagSpellId ? `Tags: ${spellName(tagSpellId)}` : 'Spell tags'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = tagsOpener.current;
          (opener?.isConnected && opener.getClientRects().length
            ? opener
            : container.current
          )?.focus();
        }}
      >
        {tagSpellId && <SpellTagEditor spellId={tagSpellId} onClose={() => setTagSpellId(null)} />}
      </Sheet>
      {confirmation}
    </div>
  );
}

function Count({
  label,
  count,
  limit,
  override,
}: {
  label: string;
  count: number;
  limit?: number;
  override?: { note: string };
}) {
  return (
    <p className="text-xs text-text-muted">
      <span className="font-semibold text-text">
        {count}
        {limit === undefined ? '' : ` / ${limit}`}
        <OverrideMarker override={override} />
      </span>{' '}
      {label}
    </p>
  );
}

function SpellTagEditor({ spellId, onClose }: { spellId: string; onClose: () => void }) {
  const { state } = useCharacter();
  const { run } = useCommand();
  const container = useRef<HTMLDivElement>(null);
  const mainTypeId = useId();
  const definition = spellDefinition(spellId);
  const tags = [...new Set(state.build.spellTags?.[spellId] ?? definition?.tags ?? [])];
  const hasOverride = state.build.spellTags?.[spellId] !== undefined;
  const [error, setError] = useState<string | null>(null);
  const saveTags = (next: SpellType[] | null) => {
    setError(null);
    const result = run(setSpellTags, { spellId, tags: next }, container.current ?? undefined);
    if (result.result === 'blocked') setError(result.reasons.join(' · '));
  };
  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-3">
      <p className="text-xs text-text-muted">
        Choose any tags. The main type sets the spell row color. Changes save immediately.
      </p>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 text-sm font-semibold text-text">Types</legend>
        {SPELL_TYPE_ORDER.map((type) => (
          <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={tags.includes(type)}
              className="size-4 accent-(--omni-accent)"
              onChange={(event) =>
                saveTags(
                  event.target.checked ? [...tags, type] : tags.filter((tag) => tag !== type),
                )
              }
            />
            <span className={SPELL_TYPES[type].text}>{SPELL_TYPES[type].label}</span>
          </label>
        ))}
      </fieldset>
      <Field label="Main type" htmlFor={mainTypeId}>
        <select
          id={mainTypeId}
          value={tags[0] ?? ''}
          disabled={tags.length === 0}
          className={inputClass}
          onChange={(event) => {
            const main = event.target.value as SpellType;
            saveTags([main, ...tags.filter((tag) => tag !== main)]);
          }}
        >
          {tags.length === 0 && <option value="">Utility (no tags)</option>}
          {SPELL_TYPE_ORDER.filter((type) => tags.includes(type)).map((type) => (
            <option key={type} value={type}>
              {SPELL_TYPES[type].label}
            </option>
          ))}
        </select>
      </Field>
      {tags.length === 0 && (
        <p className="text-xs text-text-muted">No tags selected. This spell displays as Utility.</p>
      )}
      <p className="text-xs text-text-muted">
        {hasOverride ? 'Using your character’s tag override.' : 'Using the spell’s default tags.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-warn">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={!hasOverride}
          onClick={() => saveTags(null)}
        >
          Reset tags
        </button>
        <button
          type="button"
          className="min-h-11 rounded-btn bg-accent px-3 font-semibold text-bg"
          onClick={onClose}
        >
          Done editing tags
        </button>
      </div>
    </div>
  );
}
