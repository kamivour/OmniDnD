import { useState } from 'react';
import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { MYSTIC_ARCANUM } from '../../engine/calc/feat-spells';
import { spellListsWithGrants } from '../../engine/calc/granted-spells';
import { spellbookModel, type SpellbookEntry, type SpellbookFeat } from '../spells/spellbook-model';
import { SpellCard } from '../components/cards';
import { inputClass } from '../components/fields';
import { Icon } from '../components/Icon';
import { PipRow } from '../components/PipRow';
import { schoolIconId, signed, spellLevelLabel } from '../format';
import { ReaderRow, ReaderSection } from './ReaderSection';

const costNames = { A: 'Action', BA: 'Bonus action', R: 'Reaction' } as const;

function freeLabel(entry: SpellbookEntry, free: SpellbookFeat | undefined) {
  if (!free?.free) return undefined;
  if (free.free === 'will') return 'At will';
  const count = `${free.freeLeft}/${free.freeMax ?? 1}`;
  return entry.classId.startsWith(MYSTIC_ARCANUM)
    ? `Mystic Arcanum ${count} left`
    : `Free casts ${count} · ${free.free} rest`;
}

export function PartyReaderSpells({
  state,
  sheet,
  references,
}: {
  state: CharacterState;
  sheet: Sheet;
  references: Registry;
}) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const model = spellbookModel(state, sheet, references);
  const prepared = new Set(
    spellListsWithGrants(references, state.build).flatMap(({ classId, prepared }) =>
      (prepared ?? []).map((id) => `${classId}:${id}`),
    ),
  );
  const classes = new Map(model.classes.map((entry) => [entry.classId, entry]));
  const entries = model.entries.map((entry) => {
    const { spell, classId, alwaysFrom, feat, classFree } = entry;
    const id = `${classId}:${spell.id}`;
    const source = feat?.name ?? references.entries.get(classId)?.name ?? classId;
    const status =
      spell.level === 0
        ? 'Cantrip'
        : alwaysFrom
          ? `Always prepared · ${alwaysFrom}`
          : prepared.has(id)
            ? 'Prepared'
            : classes.get(classId)?.mode === 'spellbook'
              ? 'In spellbook'
              : undefined;
    return {
      ...entry,
      id,
      source,
      status,
      free: freeLabel(entry, feat ?? classFree),
      active: spell.id === state.live.concentration?.spellId,
    };
  });
  const sources = new Map(entries.map((entry) => [entry.classId, entry.source]));
  const visible = entries.filter(
    (entry) =>
      (!source || source === entry.classId) &&
      entry.spell.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const pact = sheet.slots.pact;
  const pools = [
    ...model.slots.map(({ level, max, used }) => ({ label: `Level ${level}`, max, used })),
    ...(pact
      ? [
          {
            label: `Pact Magic · Level ${pact.level}`,
            max: pact.count,
            used: state.live.pactSlotsUsed ?? 0,
          },
        ]
      : []),
  ];

  return (
    <ReaderSection
      id="spells"
      label="Spells"
      detail={(id) => {
        const entry = entries.find((row) => row.id === id);
        if (!entry) return;
        return {
          title: entry.spell.name,
          body: (
            <div className="grid gap-2">
              <p className="text-sm text-text-muted">
                {[entry.source, entry.status, entry.free, entry.active && 'Concentrating']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <SpellCard spell={entry.spell} dc={entry.dc} attack={entry.attack} />
            </div>
          ),
        };
      }}
    >
      {(open, selected) => (
        <>
          <div className="grid gap-2" aria-label="Spell slots" role="group">
            <h3 className="text-sm font-semibold">Spell slots</h3>
            {pools.length > 0 ? (
              <dl className="grid gap-2 sm:grid-cols-2">
                {pools.map(({ label, max, used }) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-btn bg-surface-2 px-2 py-1.5 text-sm"
                  >
                    <dt className="min-w-0">{label}</dt>
                    <dd className="flex min-w-0 items-center gap-2 tabular-nums">
                      <PipRow label={label} max={max} used={used} showLabel={false} size="sm" />
                      {max <= 12 && (
                        <span className="font-semibold text-magic">
                          {Math.max(0, max - used)}/{max}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-text-muted">No spell slots recorded.</p>
            )}
          </div>
          {model.classes.length > 0 && (
            <ul
              className="flex flex-wrap gap-2 text-xs text-text-muted"
              aria-label="Spellcasting statistics"
            >
              {model.classes.map(({ classId, name, dc, attack }) => (
                <li key={classId} className="rounded-btn border border-border px-2 py-1">
                  {name} · DC {dc} · Attack {signed(attack)}
                </li>
              ))}
            </ul>
          )}
          {entries.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="grid gap-1 text-xs text-text-muted">
                Search spells
                <input
                  type="search"
                  className={inputClass}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {sources.size > 1 && (
                <label className="grid gap-1 text-xs text-text-muted">
                  Casting source
                  <select
                    className={inputClass}
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                  >
                    <option value="">All sources</option>
                    {[...sources].map(([id, name]) => (
                      <option value={id} key={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {visible.length === 0 && (
            <p className="text-sm text-text-muted">
              {entries.length ? 'No spells match your filters.' : 'No spells recorded.'}
            </p>
          )}
          {[...new Set(visible.map(({ spell }) => spell.level))].map((level) => (
            <div key={level} className="grid gap-1.5">
              <h3 className="text-sm font-semibold">
                {level === 0 ? 'Cantrips' : spellLevelLabel(level)}
              </h3>
              {visible
                .filter(({ spell }) => spell.level === level)
                .map(({ id, spell, source, status, free, active }) => (
                  <ReaderRow
                    key={id}
                    id={id}
                    name={spell.name}
                    open={open}
                    selected={selected}
                    icon={
                      <Icon
                        id={spell.id}
                        fallback={schoolIconId(spell.school)}
                        className="text-magic"
                      />
                    }
                    meta={[
                      costNames[spell.cost as keyof typeof costNames] ?? spell.cost,
                      spell.range,
                      sources.size > 1 && source,
                      status,
                      free,
                      active && 'Concentrating',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))}
            </div>
          ))}
        </>
      )}
    </ReaderSection>
  );
}
