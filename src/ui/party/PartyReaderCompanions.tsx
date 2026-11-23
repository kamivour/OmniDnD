import type { CharacterState, Sheet } from '../../engine/calc/sheet';
import type { Registry } from '../../engine/registry';
import { companionStats } from '../../engine/calc/companions';
import { resolveCompanion } from '../../engine/calc/companion-profiles';
import { HOMUNCULUS_INFUSION } from '../../engine/calc/infusions';
import { formatDuration } from '../../engine/clock';
import { CompanionGlyph } from '../companions/CompanionGlyph';
import { HpBar } from '../components/HpBar';
import { RECHARGE_LABEL } from '../features/features-model';
import { signed } from '../format';
import { ReaderRow, ReaderSection } from './ReaderSection';

const actionCost = {
  action: 'Owner action',
  bonus: 'Owner bonus action',
  none: 'No owner action',
} as const;

export function PartyReaderCompanions({
  state,
  sheet,
  references,
}: {
  state: CharacterState;
  sheet: Sheet;
  references: Registry;
}) {
  const owner = { build: state.build, sheet };
  const rows = (state.build.companions ?? []).map((saved) => {
    const companion = resolveCompanion(saved, owner);
    const stats = companionStats(saved, owner);
    const live = state.live.companions?.[companion.id];
    const speed = Object.entries(companion.speed)
      .filter(([, feet]) => feet > 0)
      .map(([mode, feet]) => `${mode} ${feet} ft`)
      .join(' · ');
    const hp = live
      ? `HP ${live.hp}/${stats.maxHp}${live.tempHp > 0 ? ` · +${live.tempHp} temp` : ''}`
      : `Max HP ${stats.maxHp}`;
    return { companion, stats, live, speed, hp };
  });
  const groups = [
    { title: 'Active', rows: rows.filter(({ live }) => live?.status === 'active') },
    { title: 'Other companions', rows: rows.filter(({ live }) => live?.status !== 'active') },
  ];
  return (
    <ReaderSection
      id="companions"
      label="Companions"
      detail={(id) => {
        const row = rows.find(({ companion }) => companion.id === id);
        if (!row) return;
        const { companion, stats, live, speed, hp } = row;
        const source = companion.sourceId && references.entries.get(companion.sourceId)?.name;
        const remaining =
          live?.status === 'active' && live.endsAt !== undefined
            ? Math.max(0, live.endsAt - state.live.clock.seconds)
            : undefined;
        return {
          title: companion.name,
          body: (
            <div className="grid gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <CompanionGlyph companion={companion} size={24} className="shrink-0 text-accent" />
                <p className="min-w-0 wrap-anywhere text-text-muted">
                  {[
                    companion.kind ?? companion.type,
                    companion.profile?.form,
                    companion.profile?.spellLevel && `Slot ${companion.profile.spellLevel}`,
                    live?.status,
                    source,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <p className="font-semibold">
                {hp} · AC {stats.ac}
                {speed && ` · ${speed}`}
              </p>
              {live && <HpBar current={live.hp} max={stats.maxHp} />}
              {remaining !== undefined && (
                <p className="text-text-muted">
                  Expires in {formatDuration(remaining)} on the owner’s game clock.
                </p>
              )}
              {live && live.conditions.length > 0 && (
                <p className="capitalize">{live.conditions.join(' · ')}</p>
              )}
              <dl className="grid grid-cols-3 gap-1.5">
                {Object.entries(stats.abilities).map(([ability, score]) => (
                  <div key={ability} className="rounded-btn bg-surface-2 px-2 py-1">
                    <dt className="text-xs text-text-muted">{ability}</dt>
                    <dd className="font-semibold">{score}</dd>
                  </div>
                ))}
              </dl>
              {stats.attacks.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="font-semibold">Attacks</h3>
                  <ul className="grid gap-1.5">
                    {stats.attacks.map(({ name, bonus, damage, range, note }, index) => (
                      <li key={`${name}:${index}`}>
                        <strong>{name}</strong> · {signed(bonus)} to hit
                        {damage &&
                          ` · ${damage.dice ? `${damage.dice}${damage.bonus ? signed(damage.bonus) : ''}` : damage.bonus} ${damage.type}`}
                        {range && ` · ${range}`}
                        {note && <p className="text-text-muted">{note}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {companion.traits.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="font-semibold">Traits and senses</h3>
                  <ul className="list-disc space-y-1 pl-4">
                    {companion.traits.map((trait, index) => (
                      <li key={index}>{trait}</li>
                    ))}
                  </ul>
                </div>
              )}
              {companion.actions?.length || companion.sourceId === HOMUNCULUS_INFUSION ? (
                <div className="grid gap-1">
                  <h3 className="font-semibold">Actions</h3>
                  {companion.sourceId === HOMUNCULUS_INFUSION && (
                    <p>Command · Owner bonus action</p>
                  )}
                  {companion.actions?.map(({ name, cost, effect }, index) => (
                    <p key={`${name}:${index}`}>
                      <strong>{name}</strong> · {actionCost[cost]} · {effect}
                    </p>
                  ))}
                </div>
              ) : null}
              {companion.uses.length > 0 && (
                <div className="grid gap-1">
                  <h3 className="font-semibold">Limited uses</h3>
                  {companion.uses.map(({ id, name, max, recharge }) => (
                    <p key={id}>
                      {name} ·{' '}
                      {live
                        ? `${Math.max(0, max - (live.usesSpent[id] ?? 0))}/${max} left`
                        : `${max} max`}{' '}
                      · {RECHARGE_LABEL[recharge]}
                    </p>
                  ))}
                </div>
              )}
              {companion.notes && (
                <p className="whitespace-pre-line wrap-anywhere text-text-muted">
                  {companion.notes}
                </p>
              )}
            </div>
          ),
        };
      }}
    >
      {(open, selected) => (
        <>
          {rows.length === 0 && <p className="text-sm text-text-muted">No companions recorded.</p>}
          {groups
            .filter(({ rows }) => rows.length > 0)
            .map(({ title, rows }) => (
              <div key={title} className="grid gap-1.5">
                <h3 className="text-sm font-semibold">{title}</h3>
                {rows.map(({ companion, live, stats, speed, hp }) => (
                  <ReaderRow
                    key={companion.id}
                    id={companion.id}
                    name={companion.name}
                    selected={selected}
                    open={open}
                    icon={
                      <CompanionGlyph
                        companion={companion}
                        size={22}
                        className="shrink-0 text-accent"
                      />
                    }
                    meta={[
                      companion.profile?.form,
                      live?.status ?? 'Status unrecorded',
                      hp,
                      `AC ${stats.ac}`,
                      speed,
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
