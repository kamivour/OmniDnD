import { useId, useState } from 'react';
import { registry } from '../../data/registry';
import {
  castSpell,
  previewSpellHealing,
  spellCastDetails,
  type CastSpellPayload,
} from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { CastFooter } from '../components/CastFooter';
import { Field, inputClass } from '../components/fields';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { spellbookModel } from './spellbook-model';

/** One casting flow for row actions, mobile previews, and pinned details. */
export function SpellCastControls({
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
  const { run } = useCommand();
  const context = { ...state, sheet, registry };
  const model = spellbookModel(state, sheet, registry);
  const entry = model.entries.find((item) => item.spell.id === spellId && item.classId === classId);
  const definition = registry.get('spell', spellId);
  const base = spellCastDetails(context, { spellId, classId });
  const [applyToMe, setApplyToMe] = useState(false);
  const [roll, setRoll] = useState<{ context: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rollId = useId();
  const automaticSelf = definition.effect?.target === 'self';
  const selfHealing = !!definition.heal && (applyToMe || automaticSelf);
  const canChooseSelf =
    !automaticSelf && (!!definition.heal || definition.effect?.target === 'any');
  if (!entry) return <p className="text-sm text-text-muted">This spell is no longer selected.</p>;

  return (
    <CastFooter
      spell={entry.spell}
      slots={model.slots}
      allowRitual={base.ritualEligible && !state.live.combat}
      upcastText={base.upcastText}
      renderChoices={({ level, ritual }) => {
        const options = {
          spellId,
          classId,
          ...(level > 0 && !ritual ? { slotLevel: level } : {}),
          ...(ritual ? { ritual: true } : {}),
        };
        const details = spellCastDetails(context, options);
        const rollContext = `${level}:${ritual}`;
        const value = roll?.context === rollContext ? roll.value : '';
        const healing =
          selfHealing && value.trim()
            ? previewSpellHealing(context, options, Number(value))
            : undefined;
        return (
          <div className="flex flex-col gap-3 text-sm" onChange={() => setError(null)}>
            {details.damage && (
              <p>
                Damage dice: {details.damage.dice}
                {details.damage.modifier ? ` ${signed(details.damage.modifier)}` : ''}{' '}
                {details.damage.type}.
              </p>
            )}
            {definition.ritual && !base.ritualEligible && (
              <p className="text-xs text-text-muted">{base.ritualReason}</p>
            )}
            {definition.ritual && base.ritualEligible && state.live.combat && (
              <p className="text-xs text-text-muted">
                Ritual casting is not offered during combat.
              </p>
            )}
            {automaticSelf && (
              <p className="text-xs text-text-muted">This spell's effect applies to you.</p>
            )}
            {canChooseSelf && (
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={applyToMe}
                  disabled={!!definition.heal && details.healing?.modifier === undefined}
                  onChange={(event) => setApplyToMe(event.target.checked)}
                  className="size-4 accent-(--omni-accent)"
                />
                Apply to me
              </label>
            )}
            {canChooseSelf && (
              <p className="text-xs text-text-muted">
                Check only when the effect or healing applies to you. Other targets are handled at
                the table.
              </p>
            )}
            {definition.heal && details.healing?.modifier === undefined && (
              <p className="text-xs text-warn">
                Self-healing cannot be calculated for this casting class.
              </p>
            )}
            {selfHealing && details.healing && (
              <>
                <p>
                  Healing dice: {details.healing.dice}.{' '}
                  {definition.heal?.addCastingMod ? 'Casting' : 'Healing'} modifier{' '}
                  {details.healing.modifier === undefined
                    ? 'unavailable'
                    : signed(details.healing.modifier)}
                  .
                </p>
                <Field
                  label="Healing dice total"
                  htmlFor={rollId}
                  hint={`Enter your dice total, ${details.healing.minRoll}–${details.healing.maxRoll}, before the modifier.`}
                >
                  <input
                    id={rollId}
                    type="number"
                    inputMode="numeric"
                    min={details.healing.minRoll}
                    max={details.healing.maxRoll}
                    value={value}
                    onChange={(event) =>
                      setRoll({ context: rollContext, value: event.target.value })
                    }
                    className={inputClass}
                  />
                </Field>
                {healing && (
                  <p role="status" aria-label="Healing preview">
                    Healing: {healing.amount} HP. Your HP: {healing.before} → {healing.after}.
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="text-warn">
                {error}
              </p>
            )}
          </div>
        );
      }}
      onCast={(level, ritual = false) => {
        setError(null);
        const payload: CastSpellPayload = {
          spellId,
          classId,
          ...(entry.spell.level > 0 && !ritual ? { slotLevel: level } : {}),
          ...(ritual ? { ritual: true } : {}),
          ...(applyToMe && definition.effect?.target === 'any' ? { onSelf: true } : {}),
          ...(selfHealing
            ? {
                healRoll:
                  roll?.context === `${level}:${ritual}` && roll.value.trim()
                    ? Number(roll.value)
                    : Number.NaN,
              }
            : {}),
        };
        const result = run(castSpell, payload, returnFocusTo, () => {
          setRoll(null);
          setError(null);
          onApplied?.();
        });
        if (result.result === 'blocked') setError(result.reasons.join(' · '));
      }}
    />
  );
}
