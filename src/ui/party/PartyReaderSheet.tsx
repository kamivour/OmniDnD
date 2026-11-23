import type { Sheet } from '../../engine/calc/sheet';
import { ABILITIES } from '../../engine/calc/abilities';
import { signed, skillName } from '../format';
import { Icon } from '../components/Icon';
import { RuleCard } from '../components/cards';
import { ReaderRow, ReaderSection } from './ReaderSection';

const damage = (attack: Sheet['attacks'][number]) =>
  attack.damage
    ? `${attack.damage.dice ? `${attack.damage.dice}${attack.damage.bonus ? signed(attack.damage.bonus) : ''}` : attack.damage.bonus} ${attack.damage.type}`
    : undefined;

function Skills({ skills }: { skills: [string, Sheet['skills'][keyof Sheet['skills']]][] }) {
  return (
    <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {skills.map(([name, skill]) => (
        <li key={name} className="flex justify-between gap-2 border-b border-border py-1 text-sm">
          <span>
            {skillName(name)}
            {skill.proficiency !== 'none' && (
              <span className="text-xs text-text-muted"> · {skill.proficiency}</span>
            )}
          </span>
          <span className="shrink-0 font-medium tabular-nums">{signed(skill.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function PartyReaderSheet({ sheet }: { sheet: Sheet }) {
  const skills = Object.entries(sheet.skills);
  const proficiencies = [
    ['Armor', sheet.proficiencies.armor],
    ['Weapons', sheet.proficiencies.weapons],
    ['Tools', sheet.proficiencies.tools],
    ['Languages', sheet.proficiencies.languages],
  ] as const;
  return (
    <ReaderSection
      id="sheet"
      label="Sheet"
      detail={(id) => {
        const attack = sheet.attacks.find(({ instanceId }) => instanceId === id);
        if (!attack) return;
        return {
          title: attack.name,
          body: (
            <RuleCard
              name={attack.name}
              lines={[
                `${signed(attack.toHit.value)} to hit`,
                ...(damage(attack) ? [damage(attack)!] : []),
                ...(attack.range ? [`Range ${attack.range.normal}/${attack.range.long} ft`] : []),
                ...attack.properties,
                ...(attack.useNote ? [attack.useNote] : []),
              ]}
            />
          ),
        };
      }}
    >
      {(open, selected) => (
        <>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            {[
              ['Speed', `${sheet.speed.value} ft`],
              ['Initiative', signed(sheet.initiative.value)],
              ['Proficiency', signed(sheet.proficiency)],
              ['Passive Perception', sheet.passives.perception.value],
              ['Passive Investigation', sheet.passives.investigation.value],
              ['Passive Insight', sheet.passives.insight.value],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-btn bg-surface-2 p-2">
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Abilities and saves</h3>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ABILITIES.map((ability) => (
                <div key={ability} className="rounded-btn border border-border p-2 text-sm">
                  <dt className="text-xs text-text-muted">{ability}</dt>
                  <dd>
                    <strong>{sheet.abilities[ability].score.value}</strong>{' '}
                    <span className="text-text-muted">
                      ({signed(sheet.abilities[ability].mod)})
                    </span>
                  </dd>
                  <dd className="text-xs">
                    Save {signed(sheet.saves[ability].value)}
                    {sheet.saves[ability].proficient && ' · Prof.'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {sheet.attacks.length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Attacks</h3>
              {sheet.attacks.map((attack) => (
                <ReaderRow
                  key={attack.instanceId}
                  id={attack.instanceId}
                  name={attack.name}
                  open={open}
                  selected={selected}
                  icon={
                    <Icon
                      id={attack.itemId}
                      fallback={attack.type === 'melee' ? 'catalog.sword' : 'catalog.bow'}
                      className="text-accent"
                    />
                  }
                  meta={[`${signed(attack.toHit.value)} to hit`, damage(attack)]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </div>
          )}
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">Skills</h3>
            <Skills skills={skills.filter(([, skill]) => skill.proficiency !== 'none')} />
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm text-accent">
                Other skills
              </summary>
              <Skills skills={skills.filter(([, skill]) => skill.proficiency === 'none')} />
            </details>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Proficiencies</h3>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {proficiencies.map(([label, values]) => (
                <div key={label}>
                  <dt className="text-xs text-text-muted">{label}</dt>
                  <dd className="wrap-anywhere">{values.join(', ') || 'None recorded'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </ReaderSection>
  );
}
