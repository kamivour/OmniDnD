import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { registry } from '../../data/registry';
import { companionStats } from '../../engine/calc/companions';
import { turnOrder } from '../../engine/calc/encounter';
import { searchRules } from '../../engine/calc/rules-search';
import {
  addCombatant,
  damageCombatant,
  endEncounter,
  healCombatant,
  nextTurn,
  removeCombatant,
  setCombatantTempHp,
  setCompanionWithOwner,
  setDefeated,
  setInitiative,
  startEncounter,
  toggleCombatantCondition,
} from '../../engine/commands';
import { CONDITIONS } from '../../engine/rules2014';
import type { Combatant } from '../../engine/schema';
import { parseWhole } from '../companions/companion-form';
import { CompanionGlyph } from '../companions/CompanionGlyph';
import { useCommand } from '../commands/command-context';
import { Field, inputClass } from '../components/fields';
import { HpBar } from '../components/HpBar';
import { Sheet } from '../components/Sheet';
import { cx } from '../cx';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { CreatureStatblock } from '../reference/CreatureStatblock';
import { crText } from '../reference/creature-format';

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-btn bg-surface-2 px-3 text-sm font-semibold text-text hover:bg-surface disabled:opacity-40';

const SIDE_LABEL = { you: 'You', companion: 'Companion', ally: 'Ally', enemy: 'Enemy' } as const;
const SIDE_TONE = {
  you: 'text-accent',
  companion: 'text-heal',
  ally: 'text-heal',
  enemy: 'text-danger',
} as const;

/**
 * The ally/enemy tracker (M15, D141). Everything here is entered by the player: rolls, damage,
 * defeated marks. The tracker shows warnings and never decides what happens.
 */
export function EncounterTracker() {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const encounter = state.live.encounter;

  if (!encounter) {
    return (
      <section
        aria-label="Encounter tracker"
        className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-text">Encounter tracker</h2>
          <p className="text-xs text-text-muted">
            Track the initiative order with your companions, allies and enemies.
          </p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg"
          onClick={() => run(startEncounter, {})}
        >
          Start tracker
        </button>
      </section>
    );
  }

  const order = turnOrder(encounter);
  const waiting = encounter.combatants.filter((entry) => entry.initiative === undefined);
  const rows = [...order, ...waiting];

  const stats = (entry: Combatant) => {
    if (entry.side === 'you')
      return {
        hp: state.live.hp,
        max: sheet.maxHp.value,
        tempHp: state.live.tempHp,
        ac: sheet.ac.value,
        conditions: state.live.conditions,
      };
    if (entry.side === 'companion') {
      const companion = state.build.companions?.find((item) => item.id === entry.companionId);
      const live = state.live.companions?.[entry.companionId!];
      if (!companion || !live) return undefined;
      const computed = companionStats(companion, { build: state.build, sheet });
      return {
        hp: live.hp,
        max: computed.maxHp,
        tempHp: live.tempHp,
        ac: computed.ac,
        conditions: live.conditions,
      };
    }
    return {
      hp: entry.hp!,
      max: entry.maxHp!,
      tempHp: entry.tempHp!,
      ac: entry.ac!,
      conditions: entry.conditions,
    };
  };

  const missingCompanions = (state.build.companions ?? []).filter(
    (companion) =>
      state.live.companions?.[companion.id]?.status === 'active' &&
      !encounter.combatants.some((entry) => entry.companionId === companion.id),
  );

  return (
    <section
      aria-label="Encounter tracker"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1" role="status" aria-label="Encounter status">
          <h2 className="text-base font-semibold text-text">
            Round {Math.max(1, encounter.round)}
          </h2>
          <p className="text-sm text-accent">
            {encounter.currentId
              ? `${encounter.combatants.find((entry) => entry.id === encounter.currentId)?.name}'s turn`
              : 'Enter initiative, then start'}
          </p>
        </div>
        <button
          type="button"
          className="min-h-14 rounded-btn bg-accent px-4 font-semibold text-bg sm:min-h-11"
          onClick={() => run(nextTurn, null)}
        >
          {encounter.currentId ? 'Next turn' : 'Start first turn'}
        </button>
      </div>

      <ol className="flex flex-col gap-2">
        {rows.map((entry) => {
          const s = stats(entry);
          const companion =
            entry.side === 'companion'
              ? state.build.companions?.find((item) => item.id === entry.companionId)
              : undefined;
          const current = entry.id === encounter.currentId;
          const expanded = open === entry.id;
          const atZero =
            entry.side === 'ally' || entry.side === 'enemy' ? entry.hp === 0 : s?.hp === 0;
          return (
            <li
              key={entry.id}
              aria-current={current ? 'step' : undefined}
              className={cx(
                'rounded-card border bg-bg p-2',
                current ? 'border-accent' : 'border-border',
                entry.defeated && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-2">
                <label className="flex w-16 shrink-0 flex-col text-xs text-text-muted">
                  <span>
                    Init {entry.initiative ?? '–'}
                    <span className="sr-only"> for {entry.name}</span>
                  </span>
                  <InitiativeInput
                    entry={entry}
                    onRoll={(roll) => run(setInitiative, { id: entry.id, roll })}
                    onClear={() => run(setInitiative, { id: entry.id, clear: true })}
                  />
                </label>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'Hide' : 'Show'} ${entry.name} details`}
                  onClick={() => setOpen(expanded ? null : entry.id)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col text-left"
                >
                  <span className="flex items-center gap-2">
                    {companion && (
                      <CompanionGlyph
                        companion={companion}
                        size={16}
                        className="shrink-0 text-accent"
                      />
                    )}
                    <span className="truncate font-semibold text-text">{entry.name}</span>
                    <span className={cx('text-xs', SIDE_TONE[entry.side])}>
                      {SIDE_LABEL[entry.side]}
                    </span>
                    {entry.defeated && <span className="text-xs text-text-muted">Defeated</span>}
                  </span>
                  {s && (
                    <span className="text-xs text-text-muted">
                      AC {s.ac} · HP {s.hp}/{s.max}
                      {s.tempHp > 0 ? ` (+${s.tempHp})` : ''}
                      {s.conditions.length > 0 ? ` · ${s.conditions.join(', ')}` : ''}
                    </span>
                  )}
                  {s && <HpBar current={s.hp} max={s.max} className="mt-1" />}
                </button>
                {expanded ? (
                  <ChevronUp size={18} aria-hidden />
                ) : (
                  <ChevronDown size={18} aria-hidden />
                )}
              </div>
              {atZero && !entry.defeated && (
                <p className="mt-1 text-xs text-warn">
                  {entry.name} is at 0 HP. Mark it defeated when the table agrees.
                </p>
              )}
              {entry.side === 'you' && state.live.concentration && (
                <p className="mt-1 text-xs text-warn">
                  Concentrating: damage you take needs a Constitution save.
                </p>
              )}
              {expanded && <Details entry={entry} onClose={() => setOpen(null)} />}
            </li>
          );
        })}
      </ol>

      {waiting.length > 0 && (
        <p className="text-xs text-text-muted">
          Without an initiative yet: {waiting.map((entry) => entry.name).join(', ')}. They are
          skipped until you enter a roll.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> Add combatant
        </button>
        {missingCompanions.map((companion) => (
          <button
            key={companion.id}
            type="button"
            className={buttonClass}
            onClick={() => run(addCombatant, { kind: 'companion', companionId: companion.id })}
          >
            <CompanionGlyph companion={companion} size={16} /> Add {companion.name}
          </button>
        ))}
        <button
          type="button"
          className={cx(buttonClass, 'text-text-muted')}
          title="Close the tracker; combat keeps going"
          onClick={() => run(endEncounter, null)}
        >
          Close tracker
        </button>
      </div>

      <AddCombatantSheet open={adding} onOpenChange={setAdding} />
    </section>
  );
}

function InitiativeInput({
  entry,
  onRoll,
  onClear,
}: {
  entry: Combatant;
  onRoll: (roll: number) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <input
      inputMode="numeric"
      aria-label={`d20 roll for ${entry.name} (${signed(entry.initiativeBonus)} added)`}
      placeholder="d20"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        const roll = parseWhole(text);
        if (text.trim() === '') onClear();
        else if (roll !== null && roll >= -30 && roll <= 60) onRoll(roll);
        else return;
        setText('');
      }}
      onBlur={() => {
        const roll = parseWhole(text);
        if (roll !== null && roll >= -30 && roll <= 60) {
          onRoll(roll);
          setText('');
        }
      }}
      className="min-h-9 w-full rounded-btn border border-border bg-surface px-2 text-sm text-text"
    />
  );
}

function Details({ entry, onClose }: { entry: Combatant; onClose: () => void }) {
  const { run } = useCommand();
  const [amount, setAmount] = useState('');
  const value = parseWhole(amount);
  const valid = value !== null && value >= 0;
  const own = entry.side === 'ally' || entry.side === 'enemy';
  const creature = entry.creatureId ? registry.get('creature', entry.creatureId) : undefined;
  const clear = () => setAmount('');

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2">
      {own ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Amount" htmlFor={`amt-${entry.id}`} className="w-24">
              <input
                id={`amt-${entry.id}`}
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
              aria-label={`Damage ${entry.name}`}
              onClick={() =>
                run(damageCombatant, { id: entry.id, amount: value! }, undefined, clear)
              }
            >
              Damage
            </button>
            <button
              type="button"
              disabled={!valid}
              className={buttonClass}
              aria-label={`Heal ${entry.name}`}
              onClick={() => run(healCombatant, { id: entry.id, amount: value! }, undefined, clear)}
            >
              Heal
            </button>
            <button
              type="button"
              disabled={!valid}
              className={buttonClass}
              aria-label={`Set temp HP for ${entry.name}`}
              onClick={() =>
                run(setCombatantTempHp, { id: entry.id, amount: value! }, undefined, clear)
              }
            >
              Temp HP
            </button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm text-text-muted">
              Conditions{entry.conditions.length > 0 ? ` (${entry.conditions.length})` : ''}
            </summary>
            <ul className="mt-1 flex flex-wrap gap-1">
              {CONDITIONS.map((condition) => {
                const on = entry.conditions.includes(condition);
                return (
                  <li key={condition}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${condition} on ${entry.name}`}
                      onClick={() => run(toggleCombatantCondition, { id: entry.id, condition })}
                      className={cx(
                        'min-h-9 rounded-btn border px-2 text-xs',
                        on
                          ? 'border-accent bg-surface-2 text-accent'
                          : 'border-border text-text-muted',
                      )}
                    >
                      {condition}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-xs text-text-muted">
          {entry.side === 'you'
            ? 'Your HP and conditions are on the Combat panel and the Dashboard.'
            : 'Companion HP and conditions are on the Companions screen.'}
        </p>
      )}

      {entry.side === 'companion' && (
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={entry.withOwner === true}
            onChange={(event) =>
              run(setCompanionWithOwner, { id: entry.id, withOwner: event.target.checked })
            }
          />
          Acts on my turn
        </label>
      )}

      {creature && (
        <details>
          <summary className="cursor-pointer text-sm text-text-muted">
            Statblock · CR {crText(creature.cr)}
          </summary>
          <CreatureStatblock creature={creature} />
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {entry.side !== 'you' && (
          <button
            type="button"
            className={buttonClass}
            aria-pressed={entry.defeated}
            aria-label={`${entry.defeated ? 'Bring back' : 'Mark defeated'} ${entry.name}`}
            onClick={() => run(setDefeated, { id: entry.id, defeated: !entry.defeated })}
          >
            {entry.defeated ? 'Back in the fight' : 'Defeated'}
          </button>
        )}
        {entry.side !== 'you' && (
          <button
            type="button"
            className={cx(buttonClass, 'text-danger')}
            aria-label={`Remove ${entry.name}`}
            onClick={() => run(removeCombatant, { id: entry.id }, undefined, onClose)}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function AddCombatantSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run } = useCommand();
  const [mode, setMode] = useState<'creature' | 'custom'>('creature');
  const [side, setSide] = useState<'enemy' | 'ally'>('enemy');
  const [query, setQuery] = useState('');
  const [count, setCount] = useState('1');
  const [hpText, setHpText] = useState('');
  const [name, setName] = useState('');
  const [ac, setAc] = useState('');
  const [hp, setHp] = useState('');
  const [bonus, setBonus] = useState('0');

  const hits = query.trim()
    ? searchRules(registry, query)
        .filter((hit) => hit.kind === 'creature')
        .slice(0, 8)
    : [];
  const amount = parseWhole(count);
  const countOk = amount !== null && amount >= 1 && amount <= 20;
  // One HP per creature; blank means the statblock average.
  const hpList = hpText
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseWhole);
  const hpOk =
    hpList.length === 0 || (hpList.length === amount && hpList.every((x) => x !== null && x >= 1));

  const done = () => {
    onOpenChange(false);
    setQuery('');
    setCount('1');
    setHpText('');
    setName('');
    setAc('');
    setHp('');
    setBonus('0');
  };

  const customOk =
    name.trim() !== '' &&
    parseWhole(ac) !== null &&
    parseWhole(hp) !== null &&
    parseWhole(bonus) !== null &&
    countOk;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add combatant"
      description="From the creature list, or type one in."
    >
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Side" className="flex gap-2">
          {(['enemy', 'ally'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={side === value}
              onClick={() => setSide(value)}
              className={cx(buttonClass, 'flex-1', side === value && 'ring-2 ring-accent')}
            >
              {value === 'enemy' ? 'Enemy' : 'Ally'}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Source" className="flex gap-2">
          {(['creature', 'custom'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cx(buttonClass, 'flex-1', mode === value && 'ring-2 ring-accent')}
            >
              {value === 'creature' ? 'Creature list' : 'Quick custom'}
            </button>
          ))}
        </div>

        {mode === 'creature' ? (
          <>
            <Field label="Search creatures" htmlFor="add-creature-search">
              <input
                id="add-creature-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="flex gap-2">
              <Field label="How many" htmlFor="add-count" className="w-24">
                <input
                  id="add-count"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Rolled HP (optional)"
                htmlFor="add-hp-list"
                hint="One number per creature, or leave blank for the average."
                className="min-w-0 flex-1"
              >
                <input
                  id="add-hp-list"
                  value={hpText}
                  onChange={(event) => setHpText(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <ul className="flex flex-col gap-1">
              {hits.map((hit) => {
                const creature = registry.get('creature', hit.id);
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      disabled={!countOk || !hpOk}
                      aria-label={`Add ${creature.name}`}
                      onClick={() =>
                        run(
                          addCombatant,
                          {
                            kind: 'creature',
                            creatureId: hit.id,
                            side,
                            count: amount!,
                            ...(hpList.length > 0 ? { hp: hpList as number[] } : {}),
                          },
                          undefined,
                          done,
                        )
                      }
                      className="flex min-h-11 w-full items-center justify-between rounded-btn border border-border px-3 text-left text-sm disabled:opacity-40"
                    >
                      <span className="text-text">{creature.name}</span>
                      <span className="text-xs text-text-muted">
                        CR {crText(creature.cr)} · AC {creature.ac} · HP {creature.hp}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <Field label="Name" htmlFor="add-name">
              <input
                id="add-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-4 gap-2">
              <Field label="AC" htmlFor="add-ac">
                <input
                  id="add-ac"
                  inputMode="numeric"
                  value={ac}
                  onChange={(event) => setAc(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="HP" htmlFor="add-hp">
                <input
                  id="add-hp"
                  inputMode="numeric"
                  value={hp}
                  onChange={(event) => setHp(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Init bonus" htmlFor="add-bonus">
                <input
                  id="add-bonus"
                  inputMode="numeric"
                  value={bonus}
                  onChange={(event) => setBonus(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="How many" htmlFor="add-count-custom">
                <input
                  id="add-count-custom"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <button
              type="button"
              disabled={!customOk}
              className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg disabled:opacity-40"
              onClick={() =>
                run(
                  addCombatant,
                  {
                    kind: 'custom',
                    name: name.trim(),
                    side,
                    ac: parseWhole(ac)!,
                    hp: parseWhole(hp)!,
                    initiativeBonus: parseWhole(bonus)!,
                    count: amount!,
                  },
                  undefined,
                  done,
                )
              }
            >
              Add
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
