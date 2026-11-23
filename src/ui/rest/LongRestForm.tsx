import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { artificerLevel } from '../../engine/calc/infusions';
import { ELIXIR_DETAILS, ELIXIR_RESULTS, elixirRestLimit } from '../../engine/calc/elixirs';
import { completeLongRest, wizardRestCantrips, type LongRestChoices } from '../../engine/commands';
import { restDurations } from '../../engine/calc/rests';
import { formatDuration } from '../../engine/clock';
import { characterStore } from '../../state/character-store';
import { useCommand, type CommandFocusTarget } from '../commands/command-context';
import { useCharacter } from '../hooks/useCharacter';
import { preparedRestClassIds, previewLongRest, restChanges } from './rest-model';
import { RestPreview } from './RestPreview';
import { DedicatedWeaponSelect } from './DedicatedWeaponSelect';
import { ArcaneArmorRestSelect } from './ArcaneArmorRestSelect';

export function LongRestForm({
  onClose,
  onApplied,
  returnFocusTo,
}: {
  onClose: () => void;
  onApplied: (preparedClassId?: string, infusions?: boolean) => void;
  returnFocusTo?: CommandFocusTarget;
}) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const automation = useStore(characterStore, (store) => store.automation);
  const preparedClasses = preparedRestClassIds(state, registry);
  const durations = restDurations(state.campaign);
  const [reviewPrepared, setReviewPrepared] = useState(true);
  const [cantripOut, setCantripOut] = useState('');
  const [cantripIn, setCantripIn] = useState('');
  const [dedicatedWeaponId, setDedicatedWeaponId] = useState('');
  const [arcaneArmorModel, setArcaneArmorModel] = useState<LongRestChoices['arcaneArmorModel']>();
  const [elixirRolls, setElixirRolls] = useState<Record<number, string>>({});
  const container = useRef<HTMLDivElement>(null);
  const formulas = wizardRestCantrips({ ...state, sheet, registry });
  const elixirs = elixirRestLimit(sheet.features);
  const recordedRolls = Array.from({ length: elixirs }, (_, index) => elixirRolls[index])
    .filter(Boolean)
    .map(Number);
  const choices: LongRestChoices | null =
    cantripOut || dedicatedWeaponId || arcaneArmorModel || recordedRolls.length
      ? {
          ...(cantripOut ? { cantripSwap: { remove: cantripOut, add: cantripIn } } : {}),
          ...(dedicatedWeaponId ? { dedicatedWeaponId } : {}),
          ...(arcaneArmorModel ? { arcaneArmorModel } : {}),
          ...(recordedRolls.length ? { elixirRolls: recordedRolls } : {}),
        }
      : null;
  const preview = previewLongRest(state, registry, automation, choices);
  const changes = preview.result === 'ok' ? restChanges(state, preview.next, registry) : [];
  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-text-muted">
        Review recovery before applying a completed {formatDuration(durations.long)} rest. Sleep,
        interruptions, food and drink are resolved at the table.
      </p>
      <p className="text-sm text-text-muted">
        Recover up to half your total Hit Dice, rounded down (minimum one), largest spent dice
        first.
      </p>
      {durations.variant === 'epic' && (
        <p className="text-sm text-text-muted">
          Epic rests change duration only. Spell slots recover normally; extra spell-recovery limits
          are a separate DM choice. The 24-hour rest reminder still applies.
        </p>
      )}
      {formulas && formulas.known.length > 0 && formulas.available.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-text">Cantrip Formulas</legend>
          <label className="grid gap-1 text-sm text-text">
            Wizard cantrip to replace
            <select
              value={cantripOut}
              onChange={(event) => {
                setCantripOut(event.target.value);
                setCantripIn('');
              }}
              className="min-w-0 min-h-11 rounded-btn border border-border bg-surface px-2 text-text"
            >
              <option value="">Keep all cantrips</option>
              {formulas.known.map((id) => (
                <option key={id} value={id}>
                  {registry.get('spell', id).name}
                </option>
              ))}
            </select>
          </label>
          {cantripOut && (
            <label className="grid gap-1 text-sm text-text">
              New Wizard cantrip
              <select
                value={cantripIn}
                onChange={(event) => setCantripIn(event.target.value)}
                className="min-w-0 min-h-11 rounded-btn border border-border bg-surface px-2 text-text"
              >
                <option value="">Choose a cantrip</option>
                {formulas.available.map((id) => (
                  <option key={id} value={id}>
                    {registry.get('spell', id).name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}
      <DedicatedWeaponSelect
        state={state}
        sheet={sheet}
        value={dedicatedWeaponId}
        onChange={setDedicatedWeaponId}
      />
      <ArcaneArmorRestSelect
        armor={sheet.arcaneArmor}
        value={arcaneArmorModel}
        onChange={setArcaneArmorModel}
      />
      {elixirs > 0 && (
        <fieldset className="grid gap-2">
          <legend className="font-semibold text-text">Experimental Elixirs</legend>
          <p className="text-sm text-text-muted">
            Roll a d6 for each elixir you make. Unused elixirs from the previous rest expire.
          </p>
          {Array.from({ length: elixirs }, (_, index) => (
            <label className="grid gap-1 text-sm text-text" key={index}>
              Elixir roll {index + 1}
              <select
                className="min-h-11 min-w-0 rounded-btn border border-border bg-surface px-2 text-text"
                value={elixirRolls[index] ?? ''}
                onChange={(event) =>
                  setElixirRolls({ ...elixirRolls, [index]: event.target.value })
                }
              >
                <option value="">Skip this elixir</option>
                {ELIXIR_RESULTS.map((result, index) => (
                  <option key={result} value={index + 1}>
                    {index + 1} · {ELIXIR_DETAILS[result].name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      <RestPreview
        duration={formatDuration(durations.long)}
        result={preview}
        changes={changes}
        warnings={preview.warnings}
      />
      {preparedClasses.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={reviewPrepared}
            onChange={(event) => setReviewPrepared(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Review prepared spells after resting
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-btn border border-border text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={preview.result !== 'ok'}
          onClick={(event) => {
            event.currentTarget.focus();
            run(completeLongRest, choices, returnFocusTo ?? container.current ?? undefined, () =>
              onApplied(
                reviewPrepared ? preparedClasses[0] : undefined,
                artificerLevel(state.build) >= 2,
              ),
            );
          }}
          className="min-h-14 rounded-btn bg-accent px-2 font-semibold text-bg disabled:opacity-40"
        >
          Apply Long Rest
        </button>
      </div>
    </div>
  );
}
