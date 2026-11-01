import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { AttackCard, FeatureCard, ResourceCard, SpellCard } from '../components/cards';
import { ConcentrationChip, EffectChip } from '../components/chips';
import { Icon } from '../components/Icon';
import { LastLogLine } from '../components/LogList';
import { PipStepper } from '../components/PipStepper';
import { Preview } from '../components/Preview';
import { SectionLabel } from '../components/SectionLabel';
import { attacks, features, fool, spells } from '../fixtures/the-fool';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { signed } from '../format';
import { useDetail } from '../layout/detail-context';

/** TEST_CHARACTER §4. Hard-coded for the static frame; computed by the engine from M2. */
const PASSIVES = [
  { label: 'Perception', value: 13 },
  { label: 'Investigation', value: 13 },
  { label: 'Insight', value: 13 },
];

interface QuickItem {
  id: string;
  name: string;
  short: string;
  card: ReactNode;
}

function quickAccess(): QuickItem[] {
  const spell = (id: string, short: string): QuickItem[] => {
    const s = spells.find((x) => x.id === id);
    return s
      ? [{ id, name: s.name, short, card: <SpellCard spell={s} dc={fool.spellDc} links /> }]
      : [];
  };
  const feature = (id: string, short: string): QuickItem[] => {
    const f = features.find((x) => x.id === id);
    return f ? [{ id, name: f.name, short, card: <FeatureCard feature={f} /> }] : [];
  };
  const attack = attacks.slice(0, 1).map((a) => ({
    id: a.id,
    name: a.name,
    short: a.name,
    card: <AttackCard attack={a} />,
  }));
  return [
    ...spell('spell.vicious-mockery', 'V. Mockery'),
    ...spell('spell.healing-word', 'Healing Word'),
    ...feature('feature.bard.cutting-words', 'Cutting Words'),
    ...attack,
  ];
}

const QUICK = quickAccess();

interface Resource {
  key: string;
  /** Short row label. */
  label: string;
  /** Full name: card title and accessible name of the pips and buttons. */
  name: string;
  max: number;
  used: number;
  tone: 'magic' | 'accent';
  /** What it is and how it refills (own words). */
  lines: string[];
}

const CON_MOD = fool.abilities.find((a) => a.key === 'CON')?.mod ?? 0;

/** Spell slots, class features, and Hit Dice are separate groups (D37). */
const RESOURCE_GROUPS: { title: string; items: Resource[] }[] = [
  {
    title: 'Spell slots',
    items: fool.slots.map((s) => ({
      key: `L${s.level}`,
      label: `Level ${s.level}`,
      name: `Level ${s.level} spell slots`,
      max: s.max,
      used: s.used,
      tone: 'magic',
      lines: [
        `Your level ${s.level} spell slots. Each one casts a spell of level ${s.level}, or a lower-level spell cast at level ${s.level}.`,
        'Cantrips need no slot. A long rest restores all slots.',
      ],
    })),
  },
  {
    title: 'Features & traits',
    items: [
      {
        key: 'BI',
        label: `Bardic Inspiration (${fool.bardicInspiration.die})`,
        name: 'Bardic Inspiration',
        max: fool.bardicInspiration.max,
        used: fool.bardicInspiration.used,
        tone: 'accent',
        lines: [
          `Bonus action: give a creature within 60 ft that can hear you a ${fool.bardicInspiration.die}. Within 10 minutes it adds the die to one attack roll, ability check, or saving throw.`,
          'Cutting Words spends the same uses.',
          'Uses equal your CHA modifier. A long rest restores all; from Bard 5 a short rest does too.',
        ],
      },
    ],
  },
  {
    title: `Hit Dice (${fool.hitDice.die})`,
    items: [
      {
        key: 'HD',
        label: 'Hit Dice',
        name: 'Hit Dice',
        max: fool.hitDice.max,
        used: fool.hitDice.spent,
        tone: 'accent',
        lines: [
          `Spend during a short rest: roll ${fool.hitDice.die} ${signed(CON_MOD)} (CON) and regain that many HP.`,
          'A long rest gives back up to half your total Hit Dice (at least 1).',
        ],
      },
    ],
  },
];

/**
 * Frame A (DESIGN.md §8). Everything at a glance outside combat.
 * Desktop: resources and effects side by side, pinned detail on the right.
 */
export function DashboardScreen() {
  const act = useFixtureAction();
  const { pin: setDetail } = useDetail();

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 lg:px-6">
      <h1 className="sr-only">Home</h1>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-6 @min-[680px]:grid-cols-2">
          <section aria-label="Resources" className="flex flex-col gap-4">
            {RESOURCE_GROUPS.map((g) => (
              <div key={g.title} className="flex flex-col gap-1">
                <SectionLabel>{g.title}</SectionLabel>
                <ul className="flex flex-col gap-1">
                  {g.items.map((r) => (
                    <ResourceRow
                      key={r.key}
                      resource={r}
                      onPin={setDetail}
                      onUse={() => act(`Use one: ${r.name}`)}
                      onRestore={() => act(`Restore one: ${r.name}`)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <SectionLabel>Concentration</SectionLabel>
              <ConcentrationChip
                name={fool.concentration.name}
                remaining={fool.concentration.remaining}
                onEnd={() => act(`End concentration: ${fool.concentration.name}`)}
                className="self-start"
              />
              <p className="text-xs text-text-muted">{fool.concentration.note}</p>
            </section>
            <section className="flex flex-col gap-2">
              <SectionLabel>Effects on you</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {fool.effects.length === 0 ? (
                  <span className="text-sm text-text-muted">None</span>
                ) : (
                  fool.effects.map((e) => (
                    <EffectChip key={e.id} name={e.name} remaining={e.remaining} />
                  ))
                )}
              </div>
            </section>
            <section className="flex flex-col gap-2">
              <SectionLabel>Conditions</SectionLabel>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-text-muted">None</span>
                <button
                  type="button"
                  onClick={() => act('Add condition')}
                  className="hover-lift inline-flex min-h-11 items-center gap-1 rounded-btn border border-border bg-surface px-3 text-sm text-text"
                >
                  <Plus size={14} aria-hidden /> Add
                </button>
              </div>
            </section>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel>Quick access</SectionLabel>
          <ul className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
            {QUICK.map((q) => (
              <li key={q.id}>
                <Preview title={q.name} content={q.card} onPin={() => setDetail(q.card)}>
                  {({ ref, props }) => (
                    <button
                      ref={ref}
                      type="button"
                      {...props}
                      className="hover-lift group flex min-h-14 w-full items-center gap-2 rounded-card border border-border bg-surface px-3 text-left"
                    >
                      <Icon
                        id={q.id}
                        className="shrink-0 text-text-muted transition-colors duration-(--omni-motion-hover) group-hover:text-accent"
                      />
                      <span className="truncate text-sm text-text">{q.short}</span>
                    </button>
                  )}
                </Preview>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <SectionLabel>Abilities</SectionLabel>
          <ul className="grid grid-cols-3 gap-2 @min-[640px]:grid-cols-6">
            {fool.abilities.map((a) => (
              <li
                key={a.key}
                className="flex flex-col items-center rounded-card border border-border bg-surface py-2"
              >
                <span className="text-xs text-text-muted">{a.key}</span>
                <span className="text-lg font-semibold text-text">{signed(a.mod)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-text-muted">
            Passive{' '}
            {PASSIVES.map((p, i) => (
              <span key={p.label}>
                {i > 0 && ' · '}
                {p.label} <span className="font-semibold text-text">{p.value}</span>
              </span>
            ))}
          </p>
        </section>

        <LastLogLine entries={fool.log} onUndo={() => act('Undo')} />
      </div>
    </div>
  );
}

/** Label opens the description (hover or tap); pips sit between − and + (D37). */
function ResourceRow({
  resource: r,
  onPin,
  onUse,
  onRestore,
}: {
  resource: Resource;
  onPin: (card: ReactNode) => void;
  onUse: () => void;
  onRestore: () => void;
}) {
  const card = <ResourceCard title={r.name} max={r.max} used={r.used} lines={r.lines} />;
  return (
    <li className="flex min-h-11 items-center gap-3">
      <Preview title={r.name} content={card} onPin={() => onPin(card)}>
        {({ ref, props }) => (
          <button
            ref={ref}
            type="button"
            {...props}
            className="min-h-11 min-w-0 flex-1 text-left text-sm text-text underline decoration-text-muted decoration-dotted underline-offset-4"
          >
            {r.label}
          </button>
        )}
      </Preview>
      <PipStepper
        label={r.name}
        max={r.max}
        used={r.used}
        tone={r.tone}
        onUse={onUse}
        onRestore={onRestore}
      />
    </li>
  );
}
