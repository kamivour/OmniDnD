import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { registry, registryFor } from '../../data/registry';
import { ABILITIES } from '../../engine/calc/abilities';
import { SKILLS, SKILL_ABILITY } from '../../engine/rules2014';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';

const titleCase = (value: string) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="break-inside-avoid border border-border p-2">
      <h2 className="mb-1 text-xs font-bold tracking-wide text-accent uppercase">{label}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p className="flex justify-between gap-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

/** A paper copy of the sheet: light colours whatever the theme, every number from the engine. */
export function PrintScreen() {
  const { characterId, state, sheet } = useCharacter();
  const { build, live } = state;
  const reg = registryFor(build);
  const race = registry.get('race', build.raceId);
  const classes = build.classes
    .map((entry) => {
      const subclass = entry.subclassId ? registry.get('subclass', entry.subclassId).name : '';
      return `${registry.get('class', entry.classId).name} ${entry.level}${subclass ? ` (${subclass})` : ''}`;
    })
    .join(', ');
  const features = sheet.features.filter(({ def }) => def.origin !== 'race');
  const spellLists = build.spells.map((list) => ({
    classId: list.classId,
    spells: [...new Set([...list.known, ...(list.prepared ?? [])])]
      .map((id) => registry.get('spell', id))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    prepared: new Set(list.prepared ?? []),
  }));
  const slotRows = sheet.slots.max
    .map((max, level) => ({ level, max }))
    .filter(({ level, max }) => level > 0 && max > 0);
  const coins = Object.entries(live.currency).filter(([, amount]) => amount > 0);

  return (
    <div className="print-sheet min-h-screen bg-bg text-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link
            to={`/characters/${characterId}/sheet`}
            className="inline-flex min-h-11 items-center rounded-btn border border-border px-3 text-sm text-accent"
          >
            Back to sheet
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg"
          >
            Print / Save as PDF
          </button>
        </div>
        <header className="border-b-2 border-border pb-2">
          <h1 className="font-display text-2xl">{build.name}</h1>
          <p className="text-sm text-text-muted">
            {race.name} · {classes} · {registry.get('background', build.backgroundId).name}
            {build.alignment ? ` · ${build.alignment}` : ''}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
          <Block label="Combat">
            <Stat label="Armor class" value={sheet.ac.value} />
            <Stat label="Initiative" value={signed(sheet.initiative.value)} />
            <Stat label="Speed" value={`${sheet.speed.value} ft`} />
            <Stat label="Hit points" value={`${live.hp}/${sheet.maxHp.value}`} />
            <Stat
              label="Hit Dice"
              value={sheet.hitDice.map(({ die, max }) => `${max}${die}`).join(' + ') || '-'}
            />
          </Block>
          <Block label="Abilities">
            {ABILITIES.map((ability) => (
              <Stat
                key={ability}
                label={ability}
                value={`${sheet.abilities[ability].score.value} (${signed(sheet.abilities[ability].mod)})`}
              />
            ))}
          </Block>
          <Block label="Saving throws">
            {ABILITIES.map((ability) => (
              <Stat
                key={ability}
                label={`${ability}${sheet.saves[ability].proficient ? ' *' : ''}`}
                value={signed(sheet.saves[ability].value)}
              />
            ))}
            <Stat label="Proficiency" value={signed(sheet.proficiency)} />
          </Block>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
          <Block label="Skills">
            {SKILLS.map((skill) => {
              const stat = sheet.skills[skill];
              const mark =
                stat.proficiency === 'expertise'
                  ? ' **'
                  : stat.proficiency === 'proficient'
                    ? ' *'
                    : '';
              return (
                <Stat
                  key={skill}
                  label={`${titleCase(skill)} (${SKILL_ABILITY[skill]})${mark}`}
                  value={signed(stat.value)}
                />
              );
            })}
          </Block>
          <div className="flex flex-col gap-3">
            <Block label="Passives">
              {(['perception', 'investigation', 'insight'] as const).map((skill) => (
                <Stat
                  key={skill}
                  label={`Passive ${titleCase(skill)}`}
                  value={sheet.passives[skill].value}
                />
              ))}
            </Block>
            <Block label="Proficiencies">
              <p className="text-sm">
                Armor: {build.proficiencies.armor.map(titleCase).join(', ') || '-'}
              </p>
              <p className="text-sm">
                Weapons:{' '}
                {build.proficiencies.weapons
                  .map((id) => (id.startsWith('item.') ? reg.get('item', id).name : titleCase(id)))
                  .join(', ') || '-'}
              </p>
              <p className="text-sm">
                Tools:{' '}
                {build.proficiencies.tools.map((id) => reg.get('item', id).name).join(', ') || '-'}
              </p>
              <p className="text-sm">
                Languages: {build.proficiencies.languages.join(', ') || '-'}
              </p>
            </Block>
            <Block label="Attacks">
              {sheet.attacks.length === 0 && <p className="text-sm">No equipped weapon attacks.</p>}
              {sheet.attacks.map((attack) => (
                <Stat
                  key={attack.instanceId}
                  label={attack.name}
                  value={`${signed(attack.toHit.value)}${
                    attack.damage
                      ? `, ${attack.damage.dice ?? ''}${attack.damage.bonus ? signed(attack.damage.bonus) : ''} ${attack.damage.type}`
                      : ''
                  }`}
                />
              ))}
            </Block>
          </div>
        </div>

        {sheet.spellcasting.length > 0 && (
          <Block label="Spellcasting">
            {sheet.spellcasting.map((caster) => (
              <Stat
                key={caster.classId}
                label={`${registry.get('class', caster.classId).name} (${caster.ability})`}
                value={`Save DC ${caster.saveDc.value}, attack ${signed(caster.attack.value)}`}
              />
            ))}
            {slotRows.length > 0 && (
              <p className="text-sm">
                Slots: {slotRows.map(({ level, max }) => `L${level} ×${max}`).join(', ')}
              </p>
            )}
            {sheet.slots.pact && (
              <p className="text-sm">
                Pact slots: {sheet.slots.pact.count} at level {sheet.slots.pact.level}
              </p>
            )}
          </Block>
        )}

        <Block label="Inventory">
          {build.items.length === 0 && <p className="text-sm">No items.</p>}
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 print:grid-cols-2">
            {build.items.map((item) => {
              const row = live.items[item.instanceId];
              return (
                <li key={item.instanceId} className="text-sm">
                  {reg.get('item', item.itemId).name}
                  {row && row.qty !== 1 ? ` ×${row.qty}` : ''}
                  {row?.equipped ? ' (equipped)' : ''}
                  {row?.attuned ? ' (attuned)' : ''}
                </li>
              );
            })}
          </ul>
          {coins.length > 0 && (
            <p className="mt-1 text-sm">
              Coins: {coins.map(([unit, amount]) => `${amount} ${unit}`).join(', ')}
            </p>
          )}
        </Block>

        <section aria-label="Features" className="break-before-page">
          <h2 className="mb-2 text-sm font-bold tracking-wide text-accent uppercase">
            Features and traits
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
            {[...sheet.features.filter(({ def }) => def.origin === 'race'), ...features].map(
              ({ def }) => (
                <li key={def.id} className="break-inside-avoid border border-border p-2 text-xs">
                  <h3 className="text-sm font-semibold">{def.name}</h3>
                  <p className="whitespace-pre-line text-text-muted">
                    {def.summary?.effect ?? def.fullText ?? 'No summary recorded.'}
                  </p>
                </li>
              ),
            )}
          </ul>
        </section>

        {spellLists.some((list) => list.spells.length > 0) && (
          <section aria-label="Spell list" className="break-before-page">
            <h2 className="mb-2 text-sm font-bold tracking-wide text-accent uppercase">Spells</h2>
            {spellLists.map((list) => (
              <div key={list.classId} className="mb-3">
                <h3 className="text-sm font-semibold">
                  {registry.get('class', list.classId).name}
                </h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
                  {list.spells.map((spell) => (
                    <li
                      key={spell.id}
                      className="break-inside-avoid border border-border p-2 text-xs"
                    >
                      <h4 className="text-sm font-semibold">
                        {spell.name}{' '}
                        <span className="font-normal text-text-muted">
                          {spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}
                          {list.prepared.has(spell.id) ? ' · prepared' : ''}
                        </span>
                      </h4>
                      <p className="text-text-muted">
                        {spell.summary?.effect ?? 'No summary recorded.'}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
