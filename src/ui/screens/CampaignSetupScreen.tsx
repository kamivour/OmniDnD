import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useStore } from 'zustand';
import { characterStore } from '../../state/character-store';
import { computeSheet } from '../../engine/calc/sheet';
import { registry } from '../../data/registry';
import { useCampaign } from '../hooks/useCampaign';
import { Lock } from 'lucide-react';
import { ChoiceGroup, Field, inputClass } from '../components/fields';
import {
  ABILITY_OPTIONS,
  HP_FLOOR_OPTIONS,
  HP_OPTIONS,
  LEVELING_OPTIONS,
} from '../campaignOptions';
import { newCampaign, type CampaignView } from '../fixtures/campaigns';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { PlaceholderScreen } from './PlaceholderScreen';

/**
 * Campaign Setup (SPEC §5). Character rules for every character in the campaign (D14).
 * Static frame: choices are local form state; Save only shows a toast.
 */
export function CampaignSetupScreen() {
  const { campaignId } = useParams();
  const saved = useCampaign();
  const records = useStore(characterStore, (state) => state.characters);
  const existing: CampaignView | undefined = saved
    ? {
        ...saved,
        hpFloor: saved.hpLevelFloor,
        abilityMethod:
          saved.abilityMethod === 'standard-array'
            ? 'standard'
            : saved.abilityMethod === 'point-buy'
              ? 'pointBuy'
              : 'rolled',
        characters: Object.values(records)
          .filter((record) => record.build.campaignId === saved.id)
          .map((record) => ({
            id: record.build.id,
            name: record.build.name,
            iconId: `character.${record.build.id}`,
            line: record.build.classes
              .map((entry) => `${registry.get('class', entry.classId).name} ${entry.level}`)
              .join(' / '),
            hp: {
              current: record.live.hp,
              max: computeSheet(
                { campaign: saved, build: record.build, live: record.live },
                registry,
              ).maxHp.value,
            },
          })),
      }
    : undefined;
  if (campaignId && !existing) return <PlaceholderScreen title="Campaign not found" />;
  return <CampaignForm key={campaignId ?? 'new'} campaign={existing ?? newCampaign} />;
}

function CampaignForm({ campaign }: { campaign: typeof newCampaign }) {
  const act = useFixtureAction();
  const isNew = campaign.id === newCampaign.id;
  const [name, setName] = useState(campaign.name);
  const [leveling, setLeveling] = useState(campaign.leveling);
  const [hpMethod, setHpMethod] = useState(campaign.hpMethod);
  const [hpFloor, setHpFloor] = useState(campaign.hpFloor);
  const [abilityMethod, setAbilityMethod] = useState(campaign.abilityMethod);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        act(isNew ? 'Create campaign' : 'Save campaign');
      }}
      className="mx-auto flex max-w-3xl flex-col gap-6"
    >
      <header>
        <h1 className="font-display text-xl text-text">
          {isNew ? 'New campaign' : 'Campaign settings'}
        </h1>
        {!isNew && (
          <p className="text-xs text-text-muted">
            {campaign.name} · {campaign.characters.length} character
            {campaign.characters.length === 1 ? '' : 's'}
          </p>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="campaign-name">
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            <Lock size={14} aria-hidden /> D&amp;D 5e (2014)
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
        value={hpFloor}
        onChange={setHpFloor}
      />
      <ChoiceGroup
        legend="Ability scores"
        name="abilities"
        options={ABILITY_OPTIONS}
        value={abilityMethod}
        onChange={setAbilityMethod}
      />

      <section aria-labelledby="campaign-sources" className="flex flex-col gap-2">
        <h2 id="campaign-sources" className="text-sm font-semibold text-text">
          Sources
        </h2>
        <ul className="flex flex-wrap gap-2">
          {campaign.sources.map((s) => (
            <li
              key={s}
              className="rounded-btn border border-border bg-surface px-3 py-1 text-sm text-text"
            >
              {s}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-muted">
          Adding books and optional rules comes in milestone M11.
        </p>
      </section>

      {!isNew && (
        <p className="rounded-card border border-border bg-surface p-3 text-xs text-text-muted">
          Changing a method never rewrites what is already entered. Existing HP rolls and ability
          scores stay; the new method applies from the next level-up or new character.
        </p>
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
          className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg"
        >
          {isNew ? 'Create campaign' : 'Save'}
        </button>
      </div>
    </form>
  );
}
