import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Pencil, Plus } from 'lucide-react';
import { companionStats } from '../../engine/calc/companions';
import {
  combatMovement,
  adjustCompanionUse,
  commandCompanion,
  damageCompanion,
  dismissCompanion,
  healCompanion,
  removeCompanion,
  resummonCompanion,
  setCompanionInitiative,
  setCompanionTempHp,
  toggleCompanionCondition,
} from '../../engine/commands';
import { CONDITIONS, type Condition } from '../../engine/rules2014';
import type { Companion } from '../../engine/schema';
import { existingCompanion, linkByKey } from '../companions/companion-links';
import { CompanionEditor } from '../companions/CompanionEditor';
import { parseWhole } from '../companions/companion-form';
import { useCommand } from '../commands/command-context';
import { EconomyBar } from '../components/EconomyBar';
import { Field, inputClass } from '../components/fields';
import { HpBar } from '../components/HpBar';
import { useCharacter } from '../hooks/useCharacter';
import { useEconomy } from '../../engine/commands';

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-btn bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2 disabled:opacity-40';

export function CompanionsScreen() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [params, setParams] = useSearchParams();
  // A Stats button elsewhere sends us here: show the creature it names, or open the add form.
  const [arrival] = useState(() => {
    const link = linkByKey(params.get('from'));
    const existing = link && existingCompanion(link, state.build.companions ?? []);
    return { link, existingId: existing ? existing.id : undefined };
  });
  const [adding, setAdding] = useState(Boolean(arrival.link && !arrival.existingId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const startTemplate = arrival.link?.template;

  const companions = state.build.companions ?? [];
  useEffect(() => {
    if (!arrival.link) return;
    setParams({}, { replace: true });
    if (!arrival.existingId) return;
    requestAnimationFrame(() => {
      const card = document.getElementById(`companion-${arrival.existingId}`);
      card?.scrollIntoView({ block: 'start' });
      card?.focus();
    });
  }, [arrival, setParams]);
  const editing = companions.find((companion) => companion.id === editingId);
  const combat = state.live.combat;
  const movement = combatMovement({ live: state.live, sheet });
  const economy = {
    action: !combat?.economy.actionUsed,
    bonus: !combat?.economy.bonusUsed,
    reaction: !combat?.economy.reactionUsed,
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-text">Companions</h1>
          <p className="text-xs text-text-muted">
            Pets, mounts, familiars and summons. Their HP and conditions are their own.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className={buttonClass}>
          <Plus size={16} aria-hidden className="mr-1" />
          Add companion
        </button>
      </header>

      {combat && (
        <section aria-label="Your turn economy" className="rounded-card bg-surface p-3">
          <p className="mb-2 text-xs text-text-muted">
            Commanding a companion spends from your own turn.
          </p>
          <EconomyBar
            economy={economy}
            movement={{ left: movement.remaining, max: movement.maximum }}
            onToggle={(slot) => run(useEconomy, { kind: slot, release: !economy[slot] })}
            onMove={(delta) => run(useEconomy, { kind: 'movement', feet: -delta })}
          />
        </section>
      )}

      {companions.length === 0 && (
        <p className="rounded-card bg-surface p-4 text-sm text-text-muted">
          No companions yet. Add a pet, mount or summon.
        </p>
      )}

      {companions.map((companion) => (
        <CompanionCard
          key={companion.id}
          companion={companion}
          inCombat={Boolean(combat)}
          onEdit={() => setEditingId(companion.id)}
        />
      ))}

      <CompanionEditor open={adding} onOpenChange={setAdding} initialTemplate={startTemplate} />
      <CompanionEditor
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditingId(null)}
        editing={editing}
      />
    </div>
  );
}

function CompanionCard({
  companion,
  inCombat,
  onEdit,
}: {
  companion: Companion;
  inCombat: boolean;
  onEdit: () => void;
}) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [amount, setAmount] = useState('');
  const live = state.live.companions?.[companion.id];
  if (!live) return null;
  const stats = companionStats(companion, { build: state.build, sheet });
  const value = parseWhole(amount) ?? -1;
  const valid = value >= 0;
  const active = live.status === 'active';
  const speed = Object.entries(companion.speed)
    .filter(([, feet]) => feet)
    .map(([kind, feet]) => `${kind} ${feet} ft.`)
    .join(', ');
  const name = companion.name;

  return (
    <section
      id={`companion-${companion.id}`}
      tabIndex={-1}
      aria-label={`Companion: ${name}`}
      className="flex flex-col gap-3 rounded-card bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-text">{name}</h2>
        <p className="text-xs text-text-muted">
          {companion.type}
          {companion.kind ? ` · ${companion.kind}` : ''} · {live.status}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm text-text">
          <span className="text-text-muted">AC </span>
          {stats.ac}
          <span className="text-text-muted"> · HP </span>
          <span data-testid={`hp-${companion.id}`}>
            {live.hp}/{stats.maxHp}
          </span>
          {live.tempHp > 0 && <span className="text-text-muted"> (+{live.tempHp} temp)</span>}
          {speed && <span className="text-text-muted"> · {speed}</span>}
        </p>
        <HpBar current={live.hp} max={stats.maxHp} />
      </div>

      <p className="text-xs text-text-muted">
        {Object.entries(stats.abilities)
          .map(([ability, score]) => `${ability} ${score}`)
          .join(' · ')}
      </p>

      {stats.attacks.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {stats.attacks.map((attack) => (
            <li key={attack.name} className="text-text">
              <span className="font-semibold">{attack.name}</span> {attack.bonus >= 0 ? '+' : ''}
              {attack.bonus}
              {attack.damage && (
                <>
                  {' '}
                  · {attack.damage.dice ?? ''}
                  {attack.damage.bonus
                    ? `${attack.damage.bonus > 0 ? '+' : ''}${attack.damage.bonus}`
                    : ''}{' '}
                  {attack.damage.type}
                </>
              )}
              {attack.range && <span className="text-text-muted"> · {attack.range}</span>}
              {attack.note && <span className="text-text-muted"> · {attack.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {companion.traits.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-text-muted">
          {companion.traits.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      )}

      {companion.notes && (
        <p className="whitespace-pre-line text-xs text-text-muted">{companion.notes}</p>
      )}

      {companion.uses.map((use) => {
        const left = use.max - (live.usesSpent[use.id] ?? 0);
        return (
          <div key={use.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-text">
              {use.name} {left}/{use.max}
              <span className="text-text-muted"> · {use.recharge}</span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className={buttonClass}
                aria-label={`Use ${use.name} (${name})`}
                onClick={() =>
                  run(adjustCompanionUse, { id: companion.id, useId: use.id, delta: 1 })
                }
              >
                Use
              </button>
              <button
                type="button"
                className={buttonClass}
                aria-label={`Restore ${use.name} (${name})`}
                onClick={() =>
                  run(adjustCompanionUse, { id: companion.id, useId: use.id, delta: -1 })
                }
              >
                Restore
              </button>
            </span>
          </div>
        );
      })}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Amount" htmlFor={`amt-${companion.id}`} className="w-24">
          <input
            id={`amt-${companion.id}`}
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClass}
          />
        </Field>
        <button
          type="button"
          disabled={!valid}
          className={buttonClass}
          aria-label={`Damage ${name}`}
          onClick={() =>
            run(damageCompanion, { id: companion.id, amount: value }, undefined, () =>
              setAmount(''),
            )
          }
        >
          Damage
        </button>
        <button
          type="button"
          disabled={!valid}
          className={buttonClass}
          aria-label={`Heal ${name}`}
          onClick={() =>
            run(healCompanion, { id: companion.id, amount: value }, undefined, () => setAmount(''))
          }
        >
          Heal
        </button>
        <button
          type="button"
          disabled={!valid}
          className={buttonClass}
          aria-label={`Temp HP ${name}`}
          onClick={() =>
            run(setCompanionTempHp, { id: companion.id, amount: value }, undefined, () =>
              setAmount(''),
            )
          }
        >
          Temp HP
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add or clear condition" htmlFor={`cond-${companion.id}`} className="w-48">
          <select
            id={`cond-${companion.id}`}
            className={inputClass}
            value=""
            onChange={(event) => {
              if (event.target.value)
                run(toggleCompanionCondition, {
                  id: companion.id,
                  condition: event.target.value as Condition,
                });
            }}
          >
            <option value="">Choose…</option>
            {CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </Field>
        {live.conditions.map((condition) => (
          <button
            key={condition}
            type="button"
            className={buttonClass}
            aria-label={`Clear ${condition} (${name})`}
            onClick={() => run(toggleCompanionCondition, { id: companion.id, condition })}
          >
            {condition} ✕
          </button>
        ))}
      </div>

      {inCombat && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Initiative" htmlFor={`init-${companion.id}`} className="w-24">
            <input
              // Keyed on the saved value so Undo refreshes the box.
              key={live.initiative ?? 'none'}
              id={`init-${companion.id}`}
              inputMode="numeric"
              defaultValue={live.initiative ?? ''}
              onBlur={(event) => {
                const text = event.target.value.trim();
                const initiative = text === '' ? null : parseWhole(text);
                if (text !== '' && initiative === null) {
                  event.target.value = String(live.initiative ?? '');
                  return;
                }
                if ((initiative ?? undefined) !== live.initiative)
                  run(setCompanionInitiative, { id: companion.id, initiative });
              }}
              className={inputClass}
            />
          </Field>
          {(['action', 'bonus', 'reaction'] as const).map((slot) => (
            <button
              key={slot}
              type="button"
              className={buttonClass}
              aria-label={`Command ${name} (${slot})`}
              onClick={() => run(commandCompanion, { id: companion.id, slot })}
            >
              Command: {slot}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={onEdit}>
          <Pencil size={16} aria-hidden className="mr-1" />
          Edit {name}
        </button>
        {active ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => run(dismissCompanion, { id: companion.id })}
          >
            Dismiss {name}
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass}
            onClick={() => run(resummonCompanion, { id: companion.id })}
          >
            Resummon {name}
          </button>
        )}
        <button
          type="button"
          className={buttonClass}
          onClick={() => run(removeCompanion, { id: companion.id })}
        >
          Remove {name}
        </button>
      </div>
    </section>
  );
}
