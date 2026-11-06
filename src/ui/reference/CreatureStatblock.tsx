import { ABILITIES, abilityModifier } from '../../engine/calc/abilities';
import type { CreatureDef } from '../../engine/schema';
import { crText } from './creature-format';

const signed = (value: number) => (value >= 0 ? `+${value}` : `−${-value}`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function speedText(speed: CreatureDef['speed']) {
  const parts = (['walk', 'fly', 'swim', 'climb', 'burrow'] as const).flatMap((kind) => {
    const feet = speed[kind];
    if (feet === undefined) return [];
    const label = kind === 'walk' ? '' : `${kind} `;
    return [`${label}${feet} ft.${kind === 'fly' && speed.hover ? ' (hover)' : ''}`];
  });
  return parts.join(', ') || '—';
}

function sensesText(senses: CreatureDef['senses']) {
  const parts = (['darkvision', 'blindsight', 'truesight', 'tremorsense'] as const).flatMap(
    (kind) => (senses[kind] ? [`${kind} ${senses[kind]} ft.`] : []),
  );
  return [...parts, `passive Perception ${senses.passivePerception}`].join(', ');
}

function Facts({ creature }: { creature: CreatureDef }) {
  const saves = Object.entries(creature.saves ?? {}).map(
    ([ability, bonus]) => `${ability} ${signed(bonus)}`,
  );
  const skills = Object.entries(creature.skills ?? {}).map(
    ([skill, bonus]) => `${capitalize(skill.replace(/-/g, ' '))} ${signed(bonus)}`,
  );
  const rows: [string, string][] = [
    ['Saves', saves.join(', ')],
    ['Skills', skills.join(', ')],
    ['Vulnerabilities', creature.vulnerabilities.join('; ')],
    ['Resistances', creature.resistances.join('; ')],
    ['Immunities', creature.immunities.join('; ')],
    ['Condition immunities', creature.conditionImmunities.join(', ')],
    ['Senses', sensesText(creature.senses)],
    ['Languages', creature.languages || '—'],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {rows
        .filter(([, value]) => value !== '')
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-muted">{label}</dt>
            <dd className="min-w-0 text-text">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function TextList({ title, rows }: { title: string; rows: CreatureDef['actions'] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.map((row) => (
        <p key={row.name} className="text-sm text-text-muted">
          <span className="font-semibold text-text">
            {row.name}
            {row.usage ? ` (${row.usage})` : ''}.
          </span>{' '}
          <span className="whitespace-pre-line">{row.text}</span>
        </p>
      ))}
    </section>
  );
}

/** A creature's full statblock, from the SRD or a campaign pack. */
export function CreatureStatblock({ creature }: { creature: CreatureDef }) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        {capitalize(creature.size)} {creature.creatureType}, {creature.alignment}
      </p>
      <p className="text-sm text-text">
        <span className="font-semibold">AC {creature.ac}</span>
        {creature.acNote ? ` (${creature.acNote})` : ''} ·{' '}
        <span className="font-semibold">HP {creature.hp}</span> ({creature.hpFormula}) · Speed{' '}
        {speedText(creature.speed)}
      </p>
      <table className="w-full max-w-sm text-center text-sm">
        <thead>
          <tr className="text-text-muted">
            {ABILITIES.map((ability) => (
              <th key={ability} scope="col" className="font-medium">
                {ability}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {ABILITIES.map((ability) => (
              <td key={ability}>
                {creature.abilities[ability]} (
                {signed(abilityModifier(creature.abilities[ability]))})
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <Facts creature={creature} />
      <p className="text-sm text-text">
        <span className="font-semibold">Challenge {crText(creature.cr)}</span> ({creature.xp} XP) ·
        Proficiency {signed(creature.proficiencyBonus)}
      </p>
      <TextList title="Traits" rows={creature.traits} />
      <TextList title="Actions" rows={creature.actions} />
      <TextList title="Reactions" rows={creature.reactions} />
      <TextList title="Legendary actions" rows={creature.legendaryActions} />
    </div>
  );
}
