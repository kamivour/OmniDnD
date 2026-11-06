import { rollReminders } from '../../engine/calc/conditions';
import { SectionLabel } from '../components/SectionLabel';
import { useCharacter } from '../hooks/useCharacter';
import { reminderGroups } from './roll-reminders-model';

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What your conditions and exhaustion do to rolls. Reminders only: the player rolls. */
export function RollReminders() {
  const { state, sheet } = useCharacter();
  const groups = reminderGroups(rollReminders(sheet.conditions, state.live.exhaustion));
  if (groups.length === 0) return null;
  return (
    <section aria-label="Roll reminders" className="flex min-w-0 flex-col gap-2">
      <SectionLabel>Roll reminders</SectionLabel>
      <dl className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-3">
        {groups.map(({ roll, label, lines, cancelled }) => (
          <div key={roll} className="min-w-0">
            <dt className="text-sm font-semibold text-text">{label}</dt>
            {lines.map(({ text, sources }) => (
              <dd key={text} className="text-sm wrap-anywhere text-text">
                {capital(text)}
                <span className="text-text-muted"> · {sources.join(', ')}</span>
              </dd>
            ))}
            {cancelled && (
              <dd className="text-xs text-text-muted">
                Advantage and disadvantage cancel out: roll normally.
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
