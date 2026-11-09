import { Link } from 'react-router';
import { useStore } from 'zustand';
import { registry } from '../../data/registry';
import { computeSheet } from '../../engine/calc/sheet';
import { characterState, characterStore, type CharacterRecord } from '../../state/character-store';
import { membersOf, usePartyState } from '../../state/party-store';
import { CharacterPortrait } from '../components/CharacterPortrait';
import { HpBar } from '../components/HpBar';
import { useCampaign } from '../hooks/useCampaign';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { useTourAutostart } from '../tutorial/useTour';

/** One card per party character: the numbers a table asks for. Read only. */
export function PartyScreen() {
  useTourAutostart('party');
  const campaign = useCampaign();
  const state = useStore(characterStore);
  const { members } = usePartyState();
  if (!campaign) return <PlaceholderScreen title="Campaign not found" />;
  const here = membersOf(members, campaign.id);
  const records = Object.values(state.characters).filter(
    (record) => record.build.campaignId === campaign.id && record.build.playedBy !== 'dm',
  );
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 data-tour="party-header" className="font-display text-xl wrap-anywhere">
          Party · {campaign.name}
        </h1>
        <Link
          to={`/campaigns/${encodeURIComponent(campaign.id)}/settings`}
          className="ml-auto inline-flex min-h-11 items-center text-sm text-accent"
        >
          Members and invites
        </Link>
      </header>
      {records.length === 0 ? (
        <p className="text-text-muted">No characters in the party yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((record, index) => {
            const owner = record.build.partyOwner;
            const left = !!owner && here.length > 0 && !here.some((m) => m.userId === owner.userId);
            return (
              <li key={record.build.id} data-tour={index === 0 ? 'party-card' : undefined}>
                <PartyCard
                  record={record}
                  ownerLabel={owner ? owner.name || 'Player' : 'You'}
                  left={left}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PartyCard({
  record,
  ownerLabel,
  left,
}: {
  record: CharacterRecord;
  ownerLabel: string;
  left: boolean;
}) {
  const state = useStore(characterStore);
  const full = characterState(state, record.build.id);
  if (!full) return null;
  const sheet = computeSheet(full, registry);
  const { live, build } = record;
  const slots = sheet.slots.max
    .map((max, level) => ({ level, max, left: max - (live.slotsUsed[level] ?? 0) }))
    .filter((slot) => slot.level > 0 && slot.max > 0);
  const pact = sheet.slots.pact
    ? { ...sheet.slots.pact, left: sheet.slots.pact.count - (live.pactSlotsUsed ?? 0) }
    : undefined;
  const dc = sheet.spellcasting[0]?.saveDc.value;
  const concentration = live.concentration
    ? registry.get('spell', live.concentration.spellId).name
    : undefined;
  return (
    <article
      aria-label={build.name}
      className="flex h-full flex-col gap-2 rounded-card border border-border bg-surface p-3 text-sm"
    >
      <Link
        to={`/characters/${encodeURIComponent(build.id)}`}
        className="flex items-center gap-3 rounded-btn hover:bg-surface-2"
      >
        <CharacterPortrait
          id={build.id}
          portrait={build.portrait}
          size={40}
          className="text-accent"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base">{build.name}</span>
          <span className="block truncate text-xs text-text-muted">
            {ownerLabel}
            {left ? ' · left the party' : ''} ·{' '}
            {build.classes
              .map((entry) => `${registry.get('class', entry.classId).name} ${entry.level}`)
              .join(' / ')}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <span className="text-text-muted">HP</span>
        <span>
          {live.hp}/{sheet.maxHp.value}
          {live.tempHp > 0 ? ` (+${live.tempHp} temp)` : ''}
        </span>
        <HpBar current={live.hp} max={sheet.maxHp.value} className="min-w-0 flex-1" />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="AC" value={sheet.ac.value} />
        <Stat label="Passive Perception" value={sheet.passives.perception.value} />
        <Stat label="Spell save DC" value={dc ?? '—'} />
      </dl>
      {(slots.length > 0 || pact) && (
        <p className="text-xs text-text-muted">
          Slots left:{' '}
          {[
            ...slots.map((slot) => `L${slot.level} ${slot.left}/${slot.max}`),
            ...(pact ? [`Pact L${pact.level} ${pact.left}/${pact.count}`] : []),
          ].join(' · ')}
        </p>
      )}
      {concentration && <p className="text-xs">Concentrating: {concentration}</p>}
      {(sheet.conditions.length > 0 || live.exhaustion > 0) && (
        <p className="text-xs text-warn capitalize">
          {[
            ...sheet.conditions,
            ...(live.exhaustion > 0 ? [`exhaustion ${live.exhaustion}`] : []),
          ].join(', ')}
        </p>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-btn bg-surface-2 p-1">
      <dt className="text-[0.65rem] leading-tight text-text-muted">{label}</dt>
      <dd className="font-display text-base">{value}</dd>
    </div>
  );
}
