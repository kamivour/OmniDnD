import {
  profileForms,
  profileMinimumLevel,
  resolveCompanion,
} from '../../engine/calc/companion-profiles';
import { companionStats } from '../../engine/calc/companions';
import type { Companion, CompanionProfile } from '../../engine/schema';
import { registry } from '../../data/registry';
import { Field, inputClass } from '../components/fields';
import { useCharacter } from '../hooks/useCharacter';

export function CompanionProfileFields({
  profile,
  onChange,
  companion,
  editing,
}: {
  profile: CompanionProfile;
  onChange: (profile: CompanionProfile) => void;
  companion: Companion;
  editing: boolean;
}) {
  const { state, sheet } = useCharacter();
  const minimum = profileMinimumLevel(profile.family);
  const owner = { build: state.build, sheet };
  const resolved = resolveCompanion({ ...companion, profile }, owner);
  const stats = companionStats(resolved, owner);
  return (
    <section
      aria-label="Companion configuration"
      className="flex flex-col gap-3 rounded-card border border-border p-3"
    >
      <Field label="Form" htmlFor="comp-form">
        <select
          id="comp-form"
          value={profile.form}
          className={inputClass}
          disabled={editing}
          onChange={(event) => onChange({ ...profile, form: event.target.value })}
        >
          <option value="">Choose a form</option>
          {profileForms(profile.family).map((form) => (
            <option key={form}>{form}</option>
          ))}
        </select>
      </Field>
      {minimum !== undefined && (
        <>
          <Field label="Spell slot level" htmlFor="comp-slot-level">
            <select
              id="comp-slot-level"
              value={profile.spellLevel ?? minimum}
              className={inputClass}
              disabled={editing}
              onChange={(event) => onChange({ ...profile, spellLevel: Number(event.target.value) })}
            >
              {Array.from({ length: 10 - minimum }, (_, index) => minimum + index).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Casting class" htmlFor="comp-casting-class">
            <select
              id="comp-casting-class"
              className={inputClass}
              value={profile.castingClassId ?? ''}
              disabled={editing}
              onChange={(event) =>
                onChange({ ...profile, castingClassId: event.target.value || undefined })
              }
            >
              <option value="">
                {sheet.spellcasting.length
                  ? 'Choose the class used to cast'
                  : 'No spellcasting class; attack +0'}
              </option>
              {sheet.spellcasting.map((entry) => (
                <option key={entry.classId} value={entry.classId}>
                  {registry.get('class', entry.classId).name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      {profile.family === 'eldritch-cannon' && (
        <>
          <Field label="Cannon size" htmlFor="comp-cannon-size">
            <select
              id="comp-cannon-size"
              className={inputClass}
              value={profile.size ?? 'Small'}
              disabled={editing}
              onChange={(event) =>
                onChange({ ...profile, size: event.target.value as 'Small' | 'Tiny' })
              }
            >
              <option>Small</option>
              <option>Tiny</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.legs !== false}
              disabled={editing}
              onChange={(event) => onChange({ ...profile, legs: event.target.checked })}
            />
            Has legs (walk and climb 15 ft)
          </label>
        </>
      )}
      <p className="text-xs text-text-muted">
        {editing
          ? 'These choices were made at creation. Dismiss and create another companion to choose a different form or cast level.'
          : 'Choose the form used when it was created. Stats are computed; no numbers to enter.'}
      </p>
      {profile.form && (
        <div className="text-sm text-text" aria-label="Computed companion preview">
          <p>
            {profile.form} · AC {stats.ac} · Max HP {stats.maxHp}
          </p>
          <p>
            {Object.entries(resolved.speed)
              .map(([kind, feet]) => `${kind} ${feet} ft.`)
              .join(' · ') || 'No movement'}
          </p>
          {stats.attacks.map((attack) => (
            <p key={attack.name}>
              {attack.name} {attack.bonus >= 0 ? '+' : ''}
              {attack.bonus} · {attack.damage?.dice}+{attack.damage?.bonus ?? 0}{' '}
              {attack.damage?.type}
            </p>
          ))}
          {resolved.actions?.map((action) => (
            <p key={action.name}>{action.effect}</p>
          ))}
        </div>
      )}
    </section>
  );
}
