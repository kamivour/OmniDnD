import { physicalNumbers } from '../../engine/calc/physical';
import type { Sheet } from '../../engine/calc/sheet';
import type { Stat } from '../../engine/calc/stat';
import type { ActiveEffect } from '../../engine/schema';
import { StatChip } from './StatChip';

function feet(stat: Stat) {
  return `${stat.value} ft`;
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = seconds / 60;
  return `${minutes} min`;
}

/** Jump, lift, breath, food and climb numbers with engine breakdowns. */
export function BodyNumbers({ sheet, effects }: { sheet: Sheet; effects: ActiveEffect[] }) {
  const n = physicalNumbers(
    sheet,
    effects.map((effect) => effect.sourceId),
  );
  const chip = 'rounded-card border border-border bg-surface-2';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="grid min-w-0 grid-cols-1 gap-2 @min-[480px]:grid-cols-2">
        <li>
          <StatChip
            className={chip}
            label="Long jump (run)"
            value={feet(n.longJumpRunning)}
            stat={n.longJumpRunning}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Long jump (stand)"
            value={feet(n.longJumpStanding)}
            stat={n.longJumpStanding}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="High jump (run)"
            value={feet(n.highJumpRunning)}
            stat={n.highJumpRunning}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="High jump (stand)"
            value={feet(n.highJumpStanding)}
            stat={n.highJumpStanding}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Push, drag, lift"
            value={`${n.pushDragLift.value} lb`}
            stat={n.pushDragLift}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Hold breath"
            value={duration(n.holdBreathSeconds.value)}
            stat={n.holdBreathSeconds}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Choking rounds"
            value={n.chokingRounds.value}
            stat={n.chokingRounds}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Days without food"
            value={n.daysWithoutFood.value}
            stat={n.daysWithoutFood}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Climb speed"
            value={feet(n.climbSpeed)}
            stat={n.climbSpeed}
          />
        </li>
        <li>
          <StatChip
            className={chip}
            label="Swim speed"
            value={feet(n.swimSpeed)}
            stat={n.swimSpeed}
          />
        </li>
      </ul>
      <p className="text-sm text-text-muted">
        A running jump needs a {n.runUpFeet} ft run-up. Each foot jumped costs a foot of movement.
      </p>
      {n.reminders.map((note) => (
        <p key={note} role="note" className="text-sm text-text-muted">
          {note}
        </p>
      ))}
    </div>
  );
}
