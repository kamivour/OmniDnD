import { useState } from 'react';
import { Plus } from 'lucide-react';
import { companionStats } from '../../engine/calc/companions';
import {
  addCompanion,
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
import { COMPANION_TYPES, type Companion, type CompanionType } from '../../engine/schema';
import { COMPANION_TEMPLATES } from '../companions/templates';
import { useCommand } from '../commands/command-context';
import { EconomyBar } from '../components/EconomyBar';
import { Field, inputClass } from '../components/fields';
import { HpBar } from '../components/HpBar';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { useEconomy } from '../../engine/commands';

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-btn bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-2 disabled:opacity-40';

export function CompanionsScreen() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [adding, setAdding] = useState(false);

  const companions = state.build.companions ?? [];
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
        <CompanionCard key={companion.id} companion={companion} inCombat={Boolean(combat)} />
      ))}

      <AddSheet open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function CompanionCard({ companion, inCombat }: { companion: Companion; inCombat: boolean }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [amount, setAmount] = useState('');
  const live = state.live.companions?.[companion.id];
  if (!live) return null;
  const stats = companionStats(companion, { build: state.build, sheet });
  const value = Number.parseInt(amount, 10);
  const valid = Number.isInteger(value) && value >= 0;
  const active = live.status === 'active';
  const speed = Object.entries(companion.speed)
    .filter(([, feet]) => feet)
    .map(([kind, feet]) => `${kind} ${feet} ft.`)
    .join(', ');
  const name = companion.name;

  return (
    <section
      aria-label={`Companion: ${name}`}
      className="flex flex-col gap-3 rounded-card bg-surface p-4"
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
              id={`init-${companion.id}`}
              inputMode="numeric"
              defaultValue={live.initiative ?? ''}
              onBlur={(event) => {
                const text = event.target.value.trim();
                const initiative = text === '' ? null : Number.parseInt(text, 10);
                if (initiative !== null && !Number.isInteger(initiative)) return;
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

function AddSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run } = useCommand();
  const [name, setName] = useState('');
  const [type, setType] = useState<CompanionType>('pet');
  const [ac, setAc] = useState('10');
  const [hp, setHp] = useState('1');
  const [walk, setWalk] = useState('30');
  const [template, setTemplate] = useState<Omit<Companion, 'id'> | null>(null);

  const reset = () => {
    setName('');
    setType('pet');
    setAc('10');
    setHp('1');
    setWalk('30');
    setTemplate(null);
  };

  const pick = (label: string) => {
    const chosen = COMPANION_TEMPLATES.find((entry) => entry.label === label)?.companion ?? null;
    setTemplate(chosen);
    if (!chosen) return;
    setName(chosen.name);
    setType(chosen.type);
    setAc(String(chosen.ac));
    setHp(String(chosen.maxHp));
    setWalk(String(chosen.speed.walk ?? 0));
  };

  const acValue = Number.parseInt(ac, 10);
  const hpValue = Number.parseInt(hp, 10);
  const walkValue = Number.parseInt(walk, 10);
  const valid =
    name.trim() !== '' &&
    Number.isInteger(acValue) &&
    Number.isInteger(hpValue) &&
    hpValue >= 1 &&
    Number.isInteger(walkValue) &&
    walkValue >= 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const base: Omit<Companion, 'id'> = template ?? {
      name: '',
      type,
      ac: 10,
      maxHp: 1,
      speed: {},
      abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      attacks: [],
      traits: [],
      uses: [],
    };
    const companion: Companion = {
      ...base,
      id: crypto.randomUUID(),
      name: name.trim(),
      type,
      ac: acValue,
      maxHp: hpValue,
      speed: { ...base.speed, walk: walkValue },
    };
    run(addCompanion, { companion }, undefined, () => {
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add companion"
      description="Start from a template or enter your own."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Template" htmlFor="comp-template">
          <select
            id="comp-template"
            className={inputClass}
            value={COMPANION_TEMPLATES.find((entry) => entry.companion === template)?.label ?? ''}
            onChange={(event) => pick(event.target.value)}
          >
            <option value="">Custom</option>
            {COMPANION_TEMPLATES.map((entry) => (
              <option key={entry.label} value={entry.label}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" htmlFor="comp-name">
          <input
            id="comp-name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Type" htmlFor="comp-type">
          <select
            id="comp-type"
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as CompanionType)}
          >
            {COMPANION_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="AC" htmlFor="comp-ac">
            <input
              id="comp-ac"
              inputMode="numeric"
              className={inputClass}
              value={ac}
              onChange={(event) => setAc(event.target.value)}
            />
          </Field>
          <Field label="Max HP" htmlFor="comp-hp">
            <input
              id="comp-hp"
              inputMode="numeric"
              className={inputClass}
              value={hp}
              onChange={(event) => setHp(event.target.value)}
            />
          </Field>
          <Field label="Speed (ft.)" htmlFor="comp-walk">
            <input
              id="comp-walk"
              inputMode="numeric"
              className={inputClass}
              value={walk}
              onChange={(event) => setWalk(event.target.value)}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
        >
          Add companion
        </button>
      </form>
    </Sheet>
  );
}
