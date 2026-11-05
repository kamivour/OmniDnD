import { useRef, useState, type ReactNode } from 'react';
import { registry } from '../../data/registry';
import { ABILITIES } from '../../engine/calc/abilities';
import { sheetBreakdowns } from '../../engine/calc/sheet-breakdowns';
import { setInspiration } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { SectionLabel } from '../components/SectionLabel';
import { PassiveList, SkillList } from '../components/SkillChecks';
import { OverrideMarker, StatChip } from '../components/StatChip';
import { signed } from '../format';
import { DeathSaveTracker } from '../health/DeathSaveTracker';
import { useCharacter } from '../hooks/useCharacter';
import { SheetBuildEditor } from '../sheet/SheetBuildEditor';
import { SheetOverrideEditor } from '../sheet/SheetOverrideEditor';
import { LevelUpControl } from '../level/LevelUpControl';

const titleCase = (value: string) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const card = 'flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3';

function ReferenceList({ label, entries }: { label: string; entries: string[] }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-1 wrap-anywhere text-sm text-text">
        {entries.length ? entries.join(' · ') : 'Not recorded'}
      </dd>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={card}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

/** Saved choices and engine-derived values, with explicit logged edits and noted overrides. */
export function CharacterSheetScreen() {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const { build, live, campaign } = state;
  const breakdowns = sheetBreakdowns(state, sheet, registry);
  const race = registry.get('race', build.raceId);
  const subrace = build.subraceId ? registry.get('race', build.subraceId) : undefined;
  const classes = build.classes.map((entry) => ({
    ...entry,
    name: registry.get('class', entry.classId).name,
    subclass: entry.subclassId ? registry.get('subclass', entry.subclassId).name : undefined,
  }));
  const defenses = sheet.features.flatMap(({ def }) =>
    def.defenses ? [{ name: def.name, ...def.defenses }] : [],
  );
  const racialTraits = sheet.features.filter(({ def }) => def.origin === 'race');
  const itemName = (id: string) => registry.get('item', id).name;
  const attackDamage = (dice: string | undefined, bonus: number) =>
    dice ? `${dice}${bonus ? signed(bonus) : ''}` : String(bonus);
  const closeEdit = () => {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };
  if (editing)
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4 lg:px-6">
        <h1 className="font-display text-xl text-text">Edit character</h1>
        <p className="text-sm text-text-muted">
          Save build choices together below. Apply a computed override separately with a note.
        </p>
        <details className="min-w-0 rounded-card border border-border bg-surface p-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">
            Computed overrides
          </summary>
          <div className="pt-3">
            <SheetOverrideEditor />
          </div>
        </details>
        <SheetBuildEditor onDone={closeEdit} />
      </div>
    );
  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl text-text">Character sheet</h1>
          <button
            ref={editButton}
            type="button"
            aria-label="Edit character"
            onClick={() => setEditing(true)}
            className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent"
          >
            Edit
          </button>
        </div>
        <Section label="Identity">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="wrap-anywhere font-display text-xl text-text">{build.name}</h2>
              <p className="mt-1 wrap-anywhere text-sm text-text-muted">
                {race.name}
                {subrace && subrace.id !== race.id ? ` · ${subrace.name}` : ''}
              </p>
            </div>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-btn px-2 text-sm text-text">
              <input
                type="checkbox"
                checked={live.inspiration ?? false}
                onChange={(event) => {
                  const control = event.currentTarget;
                  control.focus();
                  run(setInspiration, { inspired: control.checked }, control);
                }}
                className="size-5 accent-accent"
              />
              Inspiration
            </label>
          </div>
          <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <ReferenceList
              label="Classes"
              entries={classes.map(
                ({ name, level, subclass }) =>
                  `${name} ${level}${subclass ? ` · ${subclass}` : ''}`,
              )}
            />
            <ReferenceList
              label="Background"
              entries={[registry.get('background', build.backgroundId).name]}
            />
            <ReferenceList label="Alignment" entries={build.alignment ? [build.alignment] : []} />
            {campaign.leveling === 'xp' && (
              <div className="min-w-0 text-sm text-text">
                <dt className="text-xs text-text-muted">XP</dt>
                <dd className="mt-1">{build.xp ?? 'Not tracked'}</dd>
                {breakdowns.nextLevelXp ? (
                  <dd>
                    <StatChip
                      label="Next level at"
                      value={breakdowns.nextLevelXp.value}
                      stat={breakdowns.nextLevelXp}
                      breakdownLabel="Next level XP"
                    />
                  </dd>
                ) : (
                  <dd className="mt-1 text-text-muted">Maximum recorded level</dd>
                )}
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Level" value={sheet.level} stat={breakdowns.level} />
            <StatChip
              label="Proficiency bonus"
              value={signed(sheet.proficiency)}
              stat={breakdowns.proficiency}
            />
          </div>
        </Section>
        <LevelUpControl />
        <Section label="Abilities">
          <ul className="grid min-w-0 grid-cols-2 gap-2 @min-[640px]:grid-cols-3">
            {ABILITIES.map((ability) => (
              <li
                key={ability}
                className="flex min-w-0 flex-col rounded-card border border-border p-2"
              >
                <h3 className="px-2 text-sm font-semibold text-accent">{ability}</h3>
                <StatChip
                  label="Score"
                  value={sheet.abilities[ability].score.value}
                  stat={sheet.abilities[ability].score}
                  breakdownLabel={`${ability} score`}
                />
                <StatChip
                  label="Modifier"
                  value={signed(sheet.abilities[ability].mod)}
                  stat={breakdowns.modifiers[ability]}
                  breakdownLabel={`${ability} modifier`}
                />
                <StatChip
                  label="Save"
                  value={signed(sheet.saves[ability].value)}
                  stat={sheet.saves[ability]}
                  breakdownLabel={`${ability} save`}
                />
                {sheet.saves[ability].proficient && (
                  <p className="px-2 text-xs text-text-muted">Proficient</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
        <div className="grid min-w-0 items-start gap-4 @min-[800px]:grid-cols-2">
          <Section label="Skills">
            <SkillList sheet={sheet} />
          </Section>
          <div className="flex min-w-0 flex-col gap-4">
            <Section label="Passives">
              <PassiveList sheet={sheet} />
            </Section>
            <Section label="Proficiencies">
              <dl className="flex min-w-0 flex-col gap-3">
                <ReferenceList label="Armor" entries={build.proficiencies.armor.map(titleCase)} />
                <ReferenceList
                  label="Weapons"
                  entries={build.proficiencies.weapons.map((id) =>
                    id.startsWith('item.') ? itemName(id) : titleCase(id),
                  )}
                />
                <ReferenceList
                  label="Tools"
                  entries={build.proficiencies.tools.map(
                    (id) =>
                      `${itemName(id)}${build.proficiencies.expertise.includes(id) ? ' (Expertise)' : ''}`,
                  )}
                />
                <ReferenceList label="Languages" entries={build.proficiencies.languages} />
              </dl>
            </Section>
            <Section label="Senses and defenses">
              {breakdowns.darkvision ? (
                <StatChip
                  label="Darkvision"
                  value={`${sheet.darkvision} ft`}
                  stat={breakdowns.darkvision}
                  className="w-full"
                />
              ) : (
                <p className="text-sm text-text-muted">Darkvision: Not recorded</p>
              )}
              <dl className="flex min-w-0 flex-col gap-3">
                <ReferenceList
                  label="Damage resistances"
                  entries={defenses.flatMap((defense) =>
                    (defense.resistances ?? []).map(
                      (type) => `${titleCase(type)} (${defense.name})`,
                    ),
                  )}
                />
                <ReferenceList
                  label="Damage immunities"
                  entries={defenses.flatMap((defense) =>
                    (defense.immunities ?? []).map(
                      (type) => `${titleCase(type)} (${defense.name})`,
                    ),
                  )}
                />
                <ReferenceList
                  label="Damage vulnerabilities"
                  entries={defenses.flatMap((defense) =>
                    (defense.vulnerabilities ?? []).map(
                      (type) => `${titleCase(type)} (${defense.name})`,
                    ),
                  )}
                />
                <ReferenceList
                  label="Saving throw advantages"
                  entries={defenses.flatMap((defense) =>
                    (defense.saveAdvantages ?? []).map(
                      (type) => `Saves against ${type} (${defense.name})`,
                    ),
                  )}
                />
                <ReferenceList
                  label="Other immunities"
                  entries={defenses
                    .filter((defense) => defense.magicalSleepImmunity)
                    .map((defense) => `Magical sleep (${defense.name})`)}
                />
              </dl>
              <p className="text-xs text-text-muted">
                Recorded traits only. Review racial traits and active conditions for conditional
                defenses.
              </p>
              <details className="min-w-0 text-sm">
                <summary className="flex min-h-11 cursor-pointer items-center text-accent">
                  Racial traits and active conditions
                </summary>
                <ul className="flex min-w-0 flex-col gap-3 pt-2">
                  {racialTraits.map(({ def }) => (
                    <li key={def.id} className="wrap-anywhere">
                      <h3 className="font-semibold text-text">{def.name}</h3>
                      <p className="whitespace-pre-line text-text-muted">
                        {def.summary?.effect ?? def.fullText ?? 'No summary recorded.'}
                      </p>
                    </li>
                  ))}
                  {sheet.conditions.map((condition) => {
                    const def = registry.get('condition', `condition.${condition}`);
                    return (
                      <li key={condition} className="wrap-anywhere">
                        <h3 className="font-semibold text-text">{def.name}</h3>
                        <p className="whitespace-pre-line text-text-muted">
                          {def.summary?.effect ?? def.fullText ?? 'No summary recorded.'}
                        </p>
                      </li>
                    );
                  })}
                  {racialTraits.length === 0 && sheet.conditions.length === 0 && (
                    <li className="text-text-muted">No traits or active conditions recorded.</li>
                  )}
                </ul>
              </details>
            </Section>
          </div>
        </div>
        <Section label="Combat statistics">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 @min-[900px]:grid-cols-3">
            <p className="flex min-h-11 items-center justify-between gap-2 px-2 text-sm text-text">
              <span>HP</span>
              <strong>
                {live.hp}/{sheet.maxHp.value}
                <OverrideMarker override={sheet.maxHp.override} />
              </strong>
            </p>
            <StatChip label="Maximum HP" value={sheet.maxHp.value} stat={sheet.maxHp} />
            <p className="flex min-h-11 items-center justify-between gap-2 px-2 text-sm text-text">
              <span>Temp HP</span>
              <strong>{live.tempHp}</strong>
            </p>
            <StatChip label="Armor class" value={sheet.ac.value} stat={sheet.ac} />
            <StatChip
              label="Initiative"
              value={signed(sheet.initiative.value)}
              stat={sheet.initiative}
            />
            <StatChip label="Speed" value={`${sheet.speed.value} ft`} stat={sheet.speed} />
            <StatChip
              label="Carrying capacity"
              value={`${sheet.carryingCapacity} lb`}
              stat={breakdowns.carryingCapacity}
            />
            {breakdowns.hitDice.map(({ die, max, remaining }) => (
              <div key={die} className="flex min-w-0 flex-col">
                <StatChip
                  label="Hit Dice"
                  value={`${max.value}${die}`}
                  stat={max}
                  breakdownLabel={`${die} Hit Dice maximum`}
                />
                <StatChip
                  label={`${die} remaining`}
                  value={`${remaining.value}/${max.value}`}
                  stat={remaining}
                  breakdownLabel={`${die} Hit Dice remaining`}
                />
              </div>
            ))}
          </div>
          <p className="px-2 text-sm text-text-muted">
            Death saves: {live.deathSaves.success} successes · {live.deathSaves.fail} failures
          </p>
          <DeathSaveTracker />
          <h3 className="text-sm font-semibold text-text">Equipped weapon attacks</h3>
          {sheet.attacks.length ? (
            <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
              {sheet.attacks.map((attack) => {
                const damage = breakdowns.attacks.find(
                  ({ instanceId }) => instanceId === attack.instanceId,
                )?.damageBonus;
                return (
                  <li
                    key={attack.instanceId}
                    className="flex min-w-0 flex-col rounded-card border border-border p-2"
                  >
                    <h4 className="px-2 text-sm font-semibold text-text">{attack.name}</h4>
                    <StatChip
                      label="To hit"
                      value={signed(attack.toHit.value)}
                      stat={attack.toHit}
                      breakdownLabel={`${attack.name} attack`}
                    />
                    {attack.damage && damage ? (
                      <StatChip
                        label={attack.damage.type}
                        value={attackDamage(attack.damage.dice, attack.damage.bonus)}
                        stat={damage}
                        breakdownLabel={`${attack.name} damage`}
                      />
                    ) : (
                      <p className="px-2 text-sm text-text-muted">No damage roll</p>
                    )}
                    <p className="px-2 text-xs text-text-muted">
                      {[
                        titleCase(attack.type),
                        attack.proficient ? 'Proficient' : 'Not proficient',
                        ...attack.properties,
                        ...(attack.range
                          ? [`Range ${attack.range.normal}/${attack.range.long} ft`]
                          : []),
                        ...(attack.versatile
                          ? [
                              `Versatile ${attackDamage(attack.versatile, attack.damage?.bonus ?? 0)}`,
                            ]
                          : []),
                      ].join(' · ')}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No equipped weapon attacks.</p>
          )}
        </Section>
        <Section label="Spellcasting">
          {sheet.spellcasting.length ? (
            sheet.spellcasting.map((caster) => (
              <div key={caster.classId} className="flex min-w-0 flex-col gap-1">
                <h3 className="text-sm font-semibold text-text">
                  {registry.get('class', caster.classId).name} · {caster.ability}
                </h3>
                <StatChip
                  label="Spell save DC"
                  value={caster.saveDc.value}
                  stat={caster.saveDc}
                  breakdownLabel={`${registry.get('class', caster.classId).name} spell save DC`}
                />
                <StatChip
                  label="Spell attack"
                  value={signed(caster.attack.value)}
                  stat={caster.attack}
                  breakdownLabel={`${registry.get('class', caster.classId).name} spell attack`}
                />
              </div>
            ))
          ) : (
            <p className="text-sm text-text-muted">No spellcasting class.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
