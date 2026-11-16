import { useId, useState } from 'react';
import { registry } from '../../data/registry';
import {
  castSpell,
  previewSpellHealing,
  spellCastDetails,
  type CastSpellPayload,
} from '../../engine/commands';
import { materialCover } from '../../engine/calc/focus';
import { useCommand } from '../commands/command-context';
import { Related } from '../find/Related';
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
  const entryFeat = entry?.feat;
  // Feat and racial-trait spells carry the feature id in `classId`.
  const via = entryFeat ? { featureId: classId } : { classId };
  const base = spellCastDetails(context, { spellId, ...via });
  const carried = state.build.items
    .filter((item) => (state.live.items[item.instanceId]?.qty ?? 0) > 0)
    .map((item) => item.itemId);
  const material = materialCover(definition, entryFeat?.classId ?? classId, carried, registry);
  const slots = entryFeat && !entryFeat.slots ? [] : model.slots;
  const free = entryFeat?.free
    ? {
        label:
          entryFeat.free === 'will'
            ? 'At will'
            : entryFeat.free === 'short'
              ? '1/short rest'
              : '1/long rest',
        left: entryFeat.freeLeft,
        level: entryFeat.castLevel ?? definition.level,
      }
    : undefined;
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
      slots={slots}
      free={free}
      allowRitual={base.ritualEligible && !state.live.combat}
      upcastText={base.upcastText}
      renderChoices={({ level, ritual, free: freeCast }) => {
        const options = {
          spellId,
          ...via,
          ...(level > 0 && !ritual ? { slotLevel: level } : {}),
          ...(ritual ? { ritual: true } : {}),
        };
        const details = spellCastDetails(context, options);
        const rollContext = `${level}:${ritual}:${freeCast}`;
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
                {details.damage.affinity &&
                  ` ${details.damage.affinity.name}: ${signed(details.damage.affinity.bonus)} to one damage roll.`}
                {details.damage.bonuses?.map(
                  (bonus) => ` ${bonus.name}: ${signed(bonus.bonus)} to one damage roll.`,
                )}
                {details.damage.adept &&
                  ` ${details.damage.adept}: ignores resistance; count 1s on the dice as 2s.`}
              </p>
            )}
            {entryFeat && (
              <p className="text-xs text-text-muted">
                From {entryFeat.name}
                {entryFeat.slots || definition.level === 0
                  ? ''
                  : '. Spell slots cannot be used for this spell'}
                .
              </p>
            )}
            {!entryFeat && definition.ritual && !base.ritualEligible && (
              <p className="text-xs text-text-muted">{base.ritualReason}</p>
            )}
            {definition.ritual && base.ritualEligible && state.live.combat && (
              <p className="text-xs text-text-muted">
                Ritual casting is not offered during combat.
              </p>
            )}
            {material.note && (
              <p
                role="note"
                data-material={material.status}
                className={
                  material.status === 'covered' ? 'text-xs text-text-muted' : 'text-xs text-warn'
                }
              >
                {material.note}
              </p>
            )}
            {material.note && (
              <Related items={[{ label: 'Focus and gear in Inventory', path: 'inventory' }]} />
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
      onCast={(level, ritual = false, freeCast = false) => {
        setError(null);
        const payload: CastSpellPayload = {
          spellId,
          ...via,
          ...(freeCast ? { free: true } : {}),
          ...(entry.spell.level > 0 && !ritual && !freeCast ? { slotLevel: level } : {}),
          ...(ritual ? { ritual: true } : {}),
          ...(applyToMe && definition.effect?.target === 'any' ? { onSelf: true } : {}),
          ...(selfHealing
            ? {
                healRoll:
                  roll?.context === `${level}:${ritual}:${freeCast}` && roll.value.trim()
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
