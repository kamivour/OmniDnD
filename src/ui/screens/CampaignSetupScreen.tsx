import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Lock } from 'lucide-react';
import { createCampaign } from '../../engine/commands/management';
import { campaignMethodConflicts, updateCampaign } from '../../engine/commands/campaigns';
import { SCHEMA_VERSION, type Campaign } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { useCampaign } from '../hooks/useCampaign';
import { useManagement } from '../commands/useManagement';
import { ChoiceGroup, Field, inputClass } from '../components/fields';
import {
  ABILITY_OPTIONS,
  HP_FLOOR_OPTIONS,
  HP_OPTIONS,
  LEVELING_OPTIONS,
} from '../campaignOptions';
import { PlaceholderScreen } from './PlaceholderScreen';

/** Phase 1 rules are saved through management commands; old character choices are retained. */
export function CampaignSetupScreen() {
  const { campaignId } = useParams();
  const saved = useCampaign();
  if (campaignId && !saved) return <PlaceholderScreen title="Campaign not found" />;
  return <CampaignForm key={saved?.id ?? 'new'} existing={saved} />;
}

function CampaignForm({ existing }: { existing?: Campaign }) {
  const navigate = useNavigate();
  const { run, confirmation, pending } = useManagement();
  const records = useStore(characterStore, (state) => state.characters);
  const [base] = useState<Campaign>(
    () =>
      existing ?? {
        id: crypto.randomUUID(),
        schemaVersion: SCHEMA_VERSION,
        name: '',
        ruleset: '5e-2014',
        leveling: 'xp',
        hpMethod: 'average',
        hpLevelFloor: 'none',
        abilityMethod: 'standard-array',
        sources: ['PHB'],
        optionalRules: {},
      },
  );
  const [name, setName] = useState(base.name);
  const [leveling, setLeveling] = useState(base.leveling);
  const [hpMethod, setHpMethod] = useState(base.hpMethod);
  const [hpLevelFloor, setHpLevelFloor] = useState(base.hpLevelFloor);
  const [abilityMethod, setAbilityMethod] = useState(base.abilityMethod);
  const changes = { name: name.trim(), leveling, hpMethod, hpLevelFloor, abilityMethod };
  const proposal = { ...base, ...changes };
  const characters = Object.values(records).filter((record) => record.build.campaignId === base.id);
  const conflicts = characters.flatMap((record) => {
    const notes = campaignMethodConflicts(proposal, record.build);
    return notes.length > 0 ? [{ name: record.build.name, id: record.build.id, notes }] : [];
  });

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const done = () => navigate('/');
          if (existing) run(updateCampaign, { campaignId: base.id, changes }, done);
          else run(createCampaign, { campaign: proposal }, done);
        }}
        className="mx-auto flex max-w-3xl flex-col gap-6"
      >
        <header>
          <h1 className="font-display text-xl">
            {existing ? 'Campaign settings' : 'New campaign'}
          </h1>
          {existing && (
            <p className="text-xs text-text-muted">
              {existing.name} · {characters.length} character{characters.length === 1 ? '' : 's'}
            </p>
          )}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="campaign-name">
            <input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Campaign #274"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Ruleset" htmlFor="campaign-ruleset" hint="Only 2014 rules are supported.">
            <span
              id="campaign-ruleset"
              className="flex min-h-11 items-center gap-2 rounded-btn border border-border bg-bg px-3 text-text-muted"
            >
              <Lock size={14} aria-hidden />
              D&amp;D 5e (2014)
            </span>
          </Field>
        </div>
        <ChoiceGroup
          legend="Leveling"
          name="leveling"
          options={LEVELING_OPTIONS}
          value={leveling}
          onChange={setLeveling}
        />
        <ChoiceGroup
          legend="Hit points per level"
          name="hp"
          options={HP_OPTIONS}
          value={hpMethod}
          onChange={setHpMethod}
        />
        <ChoiceGroup
          legend="Low HP rolls (negative CON)"
          name="hp-floor"
          options={HP_FLOOR_OPTIONS}
          value={hpLevelFloor}
          onChange={setHpLevelFloor}
        />
        <ChoiceGroup
          legend="Ability scores"
          name="abilities"
          options={ABILITY_OPTIONS}
          value={abilityMethod}
          onChange={setAbilityMethod}
        />

        <section aria-labelledby="campaign-sources" className="flex flex-col gap-2">
          <h2 id="campaign-sources" className="text-sm font-semibold">
            Sources
          </h2>
          <ul className="flex flex-wrap gap-2">
            {base.sources.map((source) => (
              <li
                key={source}
                className="rounded-btn border border-border bg-surface px-3 py-1 text-sm"
              >
                {source}
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">
            Adding books and optional rules comes in milestone M11.
          </p>
        </section>

        {existing && (
          <section
            aria-labelledby="campaign-existing"
            className="rounded-card border border-border bg-surface p-3 text-sm"
          >
            <h2 id="campaign-existing" className="mb-2 font-semibold">
              Existing character values
            </h2>
            <p className="text-xs text-text-muted">
              Saved HP rolls, ability scores, XP and current resources are kept. New character and
              level entries use the new methods. Earlier HP levels keep their original low-roll
              floor.
            </p>
            {conflicts.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-3">
                {conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    <p className="font-semibold">{conflict.name}</p>
                    <ul className="list-disc pl-5 text-xs text-warn">
                      {conflict.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-text-muted">
                Existing entries match the selected methods.
              </p>
            )}
          </section>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-btn px-4 text-sm text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {existing ? 'Save' : 'Create campaign'}
          </button>
        </div>
      </form>
      {confirmation}
    </>
  );
}
