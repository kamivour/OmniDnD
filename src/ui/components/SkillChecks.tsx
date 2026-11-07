import type { Sheet } from '../../engine/calc/sheet';
import { SKILLS, SKILL_ABILITY } from '../../engine/rules2014';
import { signed } from '../format';
import { RollButton } from '../dice/RollButton';
import { StatChip } from './StatChip';

const titleCase = (value: string) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const skillName = (value: string) =>
  value === 'sleight-of-hand' ? 'Sleight of Hand' : titleCase(value);

/** Shared calculated checks; the optional roller never applies a result. */
export function SkillList({ sheet }: { sheet: Sheet }) {
  return (
    <ul className="flex min-w-0 flex-col divide-y divide-border">
      {SKILLS.map((skill) => {
        const stat = sheet.skills[skill];
        const marker =
          stat.proficiency === 'expertise'
            ? 'Expertise'
            : stat.proficiency === 'proficient'
              ? 'Proficient'
              : stat.parts.some(({ label }) => label === 'Jack of All Trades')
                ? 'Jack of All Trades'
                : 'Untrained';
        return (
          <li key={skill} className="flex min-w-0 flex-col py-1">
            <div className="flex items-center gap-2">
              <StatChip
                label={skillName(skill)}
                value={signed(stat.value)}
                stat={stat}
                breakdownLabel={skillName(skill)}
                className="w-full"
              />
              <RollButton
                label={`${skillName(skill)} check`}
                spec={{ kind: 'd20', bonus: stat.value }}
              />
            </div>
            <span className="px-2 pb-1 text-xs text-text-muted">
              {SKILL_ABILITY[skill]} · {marker}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function PassiveList({ sheet }: { sheet: Sheet }) {
  return (['perception', 'investigation', 'insight'] as const).map((skill) => (
    <StatChip
      key={skill}
      label={`Passive ${titleCase(skill)}`}
      value={sheet.passives[skill].value}
      stat={sheet.passives[skill]}
      className="w-full"
    />
  ));
}
