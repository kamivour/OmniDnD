import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { registry } from '../../data/registry';
import { characterRegistry } from '../../engine/registry';
import { useCharacter } from '../hooks/useCharacter';
import { CharacterPortrait } from '../components/CharacterPortrait';
import { HpBar } from '../components/HpBar';
import { FindLauncher } from '../find/FindLauncher';
import { PARTY_READER_SECTIONS } from '../find/places';
import { ViewOnlyBanner } from './ViewOnlyBanner';
import { PartyReaderSheet } from './PartyReaderSheet';
import { PartyReaderSpells } from './PartyReaderSpells';
import { PartyReaderInventory } from './PartyReaderInventory';
import { PartyReaderFeatures } from './PartyReaderFeatures';
import { PartyReaderCompanions } from './PartyReaderCompanions';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const isOnline = () => navigator.onLine;

export function PartyCharacterView() {
  const { state, sheet } = useCharacter();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const link = useRef<HTMLAnchorElement>(null);
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const { build, live } = state;
  const references = characterRegistry(registry, build);
  const route = params.get('view') ?? pathname.split('/')[3];
  const section = PARTY_READER_SECTIONS.find(({ id }) => id === route) ?? PARTY_READER_SECTIONS[0];
  const base = '/characters/' + encodeURIComponent(build.id);
  const statuses = [
    ...sheet.conditions,
    ...(live.exhaustion > 0 ? [`Exhaustion ${live.exhaustion}`] : []),
    ...(live.concentration
      ? [`Concentrating · ${references.get('spell', live.concentration.spellId).name}`]
      : []),
  ];

  useEffect(() => {
    link.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [section.id]);

  return (
    <main className="mx-auto grid min-w-0 max-w-6xl gap-3 p-3 sm:p-5">
      <div className="flex items-center justify-between">
        <Link
          className="inline-flex min-h-11 items-center gap-1 rounded-btn pr-2 text-sm text-accent hover:bg-surface"
          to={`/campaigns/${encodeURIComponent(build.campaignId)}/party`}
        >
          <ChevronLeft size={18} aria-hidden /> Back to party
        </Link>
        <FindLauncher withCharacter />
      </div>
      <header className="grid min-w-0 gap-2 rounded-card border border-border bg-surface p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <CharacterPortrait
            id={build.id}
            portrait={build.portrait}
            classId={build.classes[0]?.classId}
            size={40}
            className="text-accent"
          />
          <div className="min-w-0">
            <h1 className="font-display text-xl wrap-anywhere">{build.name}</h1>
            <p className="text-xs text-text-muted wrap-anywhere">
              {build.classes
                .map(({ classId, subclassId, level }) =>
                  [
                    references.get('class', classId).name,
                    level,
                    subclassId && `(${references.get('subclass', subclassId).name})`,
                  ]
                    .filter(Boolean)
                    .join(' '),
                )
                .join(' / ')}
            </p>
          </div>
        </div>
        <ViewOnlyBanner
          characterId={build.id}
          characterName={build.name}
          ownerName={build.partyOwner?.name ?? ''}
        />
        {!online && <p className="text-xs text-warn">Offline · cached copy</p>}
        <div className="flex min-w-0 items-center gap-2 border-t border-border pt-2 text-sm">
          <span className="font-semibold">
            HP {live.hp}/{sheet.maxHp.value}
          </span>
          {live.tempHp > 0 && <span className="text-xs text-temp">+{live.tempHp} temp</span>}
          <HpBar current={live.hp} max={sheet.maxHp.value} className="min-w-6 flex-1" />
          <span className="font-semibold">AC {sheet.ac.value}</span>
          <span className="hidden text-text-muted sm:inline">
            Passive Perception {sheet.passives.perception.value}
          </span>
        </div>
        {statuses.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {statuses.map((status) => (
              <li
                key={status}
                className="rounded-btn bg-surface-2 px-2 py-0.5 text-xs text-text capitalize wrap-anywhere"
              >
                {status}
              </li>
            ))}
          </ul>
        )}
      </header>
      <nav
        aria-label="Character viewing sections"
        className="flex min-w-0 gap-1 overflow-x-auto rounded-card border border-border bg-surface p-1"
      >
        {PARTY_READER_SECTIONS.map(({ id, label }) => (
          <Link
            key={id}
            ref={section.id === id ? link : undefined}
            to={`${base}?view=${id}`}
            aria-current={section.id === id ? 'page' : undefined}
            className="inline-flex min-h-11 shrink-0 items-center rounded-btn px-3 text-sm text-text-muted hover:bg-surface-2 hover:text-text aria-[current=page]:bg-surface-2 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
          >
            {label}
          </Link>
        ))}
      </nav>
      {section.id === 'sheet' && <PartyReaderSheet key={build.id} sheet={sheet} />}
      {section.id === 'spells' && (
        <PartyReaderSpells key={build.id} state={state} sheet={sheet} references={references} />
      )}
      {section.id === 'inventory' && (
        <PartyReaderInventory key={build.id} state={state} references={references} />
      )}
      {section.id === 'features' && (
        <PartyReaderFeatures key={build.id} state={state} sheet={sheet} references={references} />
      )}
      {section.id === 'companions' && (
        <PartyReaderCompanions key={build.id} state={state} sheet={sheet} references={references} />
      )}
    </main>
  );
}
