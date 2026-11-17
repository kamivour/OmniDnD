import { useState } from 'react';
import { Link } from 'react-router';
import { registry } from '../../data/registry';
import { ABILITIES } from '../../engine/calc/abilities';
import { characterRegistry } from '../../engine/registry';
import { spellListsWithGrants } from '../../engine/calc/granted-spells';
import { featSpellSources } from '../../engine/calc/feat-spells';
import { useCharacter } from '../hooks/useCharacter';
import { ViewOnlyBanner } from './ViewOnlyBanner';

/** A separate reader: no command providers, resource controls, editors or private journal. */
export function PartyCharacterView() {
  const { state, sheet } = useCharacter();
  const [tab, setTab] = useState('Sheet');
  const { build, live } = state;
  const references = characterRegistry(registry, build);
  const tabs = ['Sheet', 'Spells', 'Equipment', 'Features', 'Companions'];
  return (
    <main className="mx-auto flex min-w-0 max-w-5xl flex-col gap-4 p-4">
      <Link
        className="inline-flex min-h-11 items-center text-accent"
        to={`/campaigns/${encodeURIComponent(build.campaignId)}/party`}
      >
        Back to party
      </Link>
      <ViewOnlyBanner
        characterId={build.id}
        characterName={build.name}
        ownerName={build.partyOwner?.name ?? 'your'}
      />
      <header>
        <h1 className="font-display text-xl wrap-anywhere">{build.name}</h1>
        <p className="text-sm text-text-muted">
          {build.classes
            .map((x) => `${references.get('class', x.classId).name} ${x.level}`)
            .join(' / ')}{' '}
          · Cached while offline; updates when connected.
        </p>
      </header>
      <dl className="grid grid-cols-3 gap-3 rounded-card border border-border bg-surface p-3 text-sm">
        {[
          ['HP', `${live.hp}/${sheet.maxHp.value}`],
          ['Temporary HP', live.tempHp],
          ['AC', sheet.ac.value],
          ['Speed', `${sheet.speed.value} ft`],
          ['Initiative', sheet.initiative.value],
          ['Proficiency', sheet.proficiency],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        Conditions:{' '}
        {[...sheet.conditions, ...(live.exhaustion ? [`exhaustion ${live.exhaustion}`] : [])].join(
          ', ',
        ) || 'None'}
      </p>
      <nav aria-label="Character viewing sections" className="flex flex-wrap gap-2">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
            className="min-h-11 rounded-btn border border-border px-3 text-sm aria-pressed:text-accent"
          >
            {name}
          </button>
        ))}
      </nav>
      <section
        aria-label={tab}
        className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4 text-sm"
      >
        <h2 className="text-base font-semibold">{tab}</h2>
        {tab === 'Sheet' && (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ABILITIES.map((ability) => (
                <div key={ability}>
                  <dt>
                    {ability} {sheet.abilities[ability].score.value}
                  </dt>
                  <dd>
                    Save {sheet.saves[ability].value >= 0 ? '+' : ''}
                    {sheet.saves[ability].value}
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(sheet.skills).map(([name, skill]) => (
                <li key={name} className="capitalize">
                  {name.replaceAll('-', ' ')}: {skill.value >= 0 ? '+' : ''}
                  {skill.value} · {skill.proficiency}
                </li>
              ))}
            </ul>
            <p>Languages: {sheet.proficiencies.languages.join(', ') || 'None recorded'}</p>
          </>
        )}
        {tab === 'Spells' && (
          <>
            {spellListsWithGrants(references, build).map((entry) => (
              <div key={entry.classId}>
                <h3 className="font-semibold">{references.get('class', entry.classId).name}</h3>
                <ul>
                  {[...new Set([...entry.known, ...(entry.prepared ?? [])])].map((id) => (
                    <li key={id}>
                      {references.get('spell', id).name}
                      {entry.prepared?.includes(id) ? ' · prepared' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {featSpellSources({ registry: references, build, sheet }).map((source) => (
              <div key={source.featureId}>
                <h3 className="font-semibold">{source.name}</h3>
                <ul>
                  {source.spells.map((spell) => (
                    <li key={spell.spellId}>{references.get('spell', spell.spellId).name}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p>
              Slots remaining:{' '}
              {sheet.slots.max
                .flatMap((max, level) =>
                  max && level
                    ? [`L${level}: ${Math.max(0, max - (live.slotsUsed[level] ?? 0))}/${max}`]
                    : [],
                )
                .join(' · ') || 'None'}
            </p>
          </>
        )}
        {tab === 'Equipment' && (
          <ul className="space-y-2">
            {build.items.map((item) => (
              <li key={item.instanceId} className="wrap-anywhere">
                {references.get('item', item.itemId).name} ×{live.items[item.instanceId]?.qty ?? 0}
                {live.items[item.instanceId]?.equipped ? ' · equipped' : ''}
                {live.items[item.instanceId]?.attuned ? ' · attuned' : ''}
              </li>
            ))}
          </ul>
        )}
        {tab === 'Features' &&
          sheet.features.map(({ def }) => (
            <details key={def.id}>
              <summary className="min-h-11 cursor-pointer">{def.name}</summary>
              <p>{def.summary?.effect ?? 'See the rule source for details.'}</p>
            </details>
          ))}
        {tab === 'Companions' && (
          <ul>
            {build.companions?.map((companion) => (
              <li key={companion.id}>{companion.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
