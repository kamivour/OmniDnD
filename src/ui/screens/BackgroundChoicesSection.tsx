import { registry } from '../../data/registry';
import { LANGUAGES, toolGroupOptions, toolSlots } from '../../engine/calc/background-choices';
import { SKILLS } from '../../engine/rules2014';
import type { BackgroundDef, ItemDef } from '../../engine/schema';
import type { BackgroundPicks } from './background-picks';
import { Field, inputClass } from '../components/fields';

const skillName = (skill: string) =>
  skill.replace(/-/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

/** Extra skills, languages and tools the chosen background lets the player pick. */
export function BackgroundChoicesSection({
  background,
  picks,
  taken,
  onChange,
}: {
  background: BackgroundDef;
  picks: BackgroundPicks;
  /** Skills and languages the character already has. */
  taken: { skills: string[]; languages: string[] };
  onChange: (picks: BackgroundPicks) => void;
}) {
  const items = [...registry.entries.values()].filter(
    (entry): entry is ItemDef => entry.kind === 'item',
  );
  const slots = toolSlots(background);
  const set = (key: keyof BackgroundPicks, count: number, index: number, value: string) => {
    const next = Array.from({ length: count }, (_, i) => picks[key][i] ?? '');
    next[index] = value;
    onChange({ ...picks, [key]: next });
  };
  const slotSelect = (
    key: keyof BackgroundPicks,
    count: number,
    index: number,
    label: string,
    options: { id: string; name: string }[],
  ) => {
    const value = picks[key][index] ?? '';
    const used = picks[key].filter((v, i) => i !== index && v !== '');
    return (
      <Field key={`${key}-${index}`} label={label} htmlFor={`nc-bg-${key}-${index}`}>
        <select
          id={`nc-bg-${key}-${index}`}
          value={value}
          onChange={(event) => set(key, count, index, event.target.value)}
          className={inputClass}
        >
          <option value="">Choose…</option>
          {options
            .filter((o) => o.id === value || !used.includes(o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      </Field>
    );
  };
  const skillCount = background.skillChoices ?? 0;
  const languageCount = background.languageChoices ?? 0;
  return (
    <fieldset className="grid gap-3 rounded-card border border-border bg-surface p-3">
      <legend className="px-1 text-sm font-semibold text-text">Background choices</legend>
      <p className="text-sm text-text-muted">
        Pick now, or leave blank and add them on the character sheet later.
      </p>
      {Array.from({ length: skillCount }, (_, i) =>
        slotSelect(
          'skills',
          skillCount,
          i,
          skillCount > 1 ? `Skill ${i + 1}` : 'Skill',
          SKILLS.filter((s) => !taken.skills.includes(s)).map((s) => ({
            id: s,
            name: skillName(s),
          })),
        ),
      )}
      {Array.from({ length: languageCount }, (_, i) =>
        slotSelect(
          'languages',
          languageCount,
          i,
          languageCount > 1 ? `Language ${i + 1}` : 'Language',
          LANGUAGES.filter((l) => !taken.languages.includes(l)).map((l) => ({ id: l, name: l })),
        ),
      )}
      {slots.map((group, i) =>
        slotSelect(
          'tools',
          slots.length,
          i,
          slots.length > 1 ? `Tool ${i + 1}` : 'Tool',
          toolGroupOptions(group, items)
            .filter((id) => registry.entries.has(id))
            .map((id) => ({ id, name: registry.entries.get(id)!.name })),
        ),
      )}
    </fieldset>
  );
}
