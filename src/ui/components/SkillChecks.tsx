import type { Sheet } from '../../engine/calc/sheet';
import { SKILLS, SKILL_ABILITY } from '../../engine/rules2014';
import { signed, skillName } from '../format';
import { RollButton } from '../dice/RollButton';
import { StatChip } from './StatChip';

type Marker = 'Expertise' | 'Proficient' | 'Jack of All Trades';

/** A short visible symbol per training level; the word stays in the row for screen readers. */
const MARKERS: { marker: Marker; symbol: string }[] = [
  { marker: 'Proficient', symbol: '●' },
  { marker: 'Expertise', symbol: '◆' },
  { marker: 'Jack of All Trades', symbol: '◐' },
];

function skillMarker(stat: Sheet['skills'][keyof Sheet['skills']]): Marker | undefined {
  if (stat.proficiency === 'expertise') return 'Expertise';
  if (stat.proficiency === 'proficient') return 'Proficient';
  return stat.parts.some(({ label }) => label === 'Jack of All Trades')
    ? 'Jack of All Trades'
    : undefined;
}

/** Shared calculated checks, one compact row per skill; the optional roller never applies a result. */
export function SkillList({ sheet }: { sheet: Sheet }) {
  const rows = SKILLS.map((skill) => ({
    skill,
    stat: sheet.skills[skill],
    marker: skillMarker(sheet.skills[skill]),
  }));
  const used = MARKERS.filter(({ marker }) => rows.some((row) => row.marker === marker));
  return (
    <div className="@container flex min-w-0 flex-col gap-2">
      {used.length > 0 && (
        <p aria-hidden className="px-2 text-xs text-text-muted">
          {used.map(({ marker, symbol }) => `${symbol} ${marker}`).join(' · ')}
        </p>
      )}
      <ul className="grid min-w-0 grid-cols-1 gap-x-4 @min-[34rem]:grid-cols-2">
        {rows.map(({ skill, stat, marker }) => (
          <li
            key={skill}
            className="flex min-w-0 items-center gap-1 border-b border-border last:border-b-0 @min-[34rem]:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
          >
            <span
              title={marker ?? 'Untrained'}
              aria-hidden
              className="w-4 shrink-0 text-center text-xs text-accent"
            >
              {MARKERS.find((entry) => entry.marker === marker)?.symbol ?? ''}
            </span>
            {marker && <span className="sr-only">{marker}</span>}
            <StatChip
              label={`${skillName(skill)} · ${SKILL_ABILITY[skill]}`}
              value={signed(stat.value)}
              stat={stat}
              breakdownLabel={skillName(skill)}
              className="min-w-0 flex-1"
            />
            <RollButton
              label={`${skillName(skill)} check`}
              spec={{ kind: 'd20', bonus: stat.value }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PassiveList({ sheet }: { sheet: Sheet }) {
  return (['perception', 'investigation', 'insight'] as const).map((skill) => (
    <StatChip
      key={skill}
      label={`Passive ${skillName(skill)}`}
      value={sheet.passives[skill].value}
      stat={sheet.passives[skill]}
      className="w-full"
    />
  ));
}
