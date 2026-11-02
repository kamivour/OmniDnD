import { useEffect, useRef, type ReactNode } from 'react';
import { Tabs } from 'radix-ui';
import { startCombat } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { ActionRow } from '../components/ActionRow';
import { AttackCard, FeatureCard, RuleCard, SpellCard } from '../components/cards';
import { ConcentrationChip, EffectChip } from '../components/chips';
import { CostBadge } from '../components/CostBadge';
import { CastFooter } from '../components/CastFooter';
import { EconomyBar } from '../components/EconomyBar';
import { HpButtons, HpPanel, type HpKind } from '../components/HpControl';
import { LastLogLine, LogList } from '../components/LogList';
import { PipRow } from '../components/PipRow';
import { Preview } from '../components/Preview';
import { SectionLabel } from '../components/SectionLabel';
import { SpellRow } from '../components/SpellRow';
import { cx } from '../cx';
import {
  attacks,
  features,
  fool,
  items,
  spells,
  standardActions,
  type AttackView,
  type Cost,
  type FeatureView,
  type SpellView,
} from '../fixtures/the-fool';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { signed, spellLevelLabel } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';

const { combat } = fool;
const economy = combat.economy;
const ECONOMY_NAME: Record<Cost, string> = { A: 'Action', BA: 'Bonus action', R: 'Reaction' };
const AVAILABLE: Record<Cost, boolean> = {
  A: economy.action,
  BA: economy.bonus,
  R: economy.reaction,
};

/** Name of the spent economy slot this cost needs, or undefined if it is still free. */
function spentFor(cost: Cost | 'Passive' | 'Rest'): string | undefined {
  if (cost === 'Passive' || cost === 'Rest') return undefined;
  return AVAILABLE[cost] ? undefined : ECONOMY_NAME[cost];
}

const HP_LABEL: Record<HpKind, string> = { damage: 'Damage', heal: 'Heal', temp: 'Temp HP' };

const TABS = [
  { value: 'actions', label: 'Actions' },
  { value: 'spells', label: 'Spells' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'react', label: 'React' },
  { value: 'items', label: 'Items' },
] as const;

/**
 * Frame C (DESIGN.md §8). Tracks your own turn: what action, bonus action, reaction, and
 * movement you still have (no initiative order, D42). Mobile: one column, HP buttons and tabs
 * first. lg: right column with HP panel, pinned detail, concentration, effects, and log.
 */
export function CombatScreen() {
  const act = useFixtureAction();
  const { state, sheet, events } = useCharacter();
  const { run } = useCommand();
  const combatStatus = useRef<HTMLDivElement>(null);
  const restoreStatusFocus = useRef(false);
  const liveCombat = state.live.combat;
  const { pin: setDetail } = useDetail();

  useEffect(() => {
    if (restoreStatusFocus.current) {
      restoreStatusFocus.current = false;
      combatStatus.current?.focus();
    }
  }, [events]);

  const pinSpell = (spell: SpellView) =>
    setDetail(
      <div className="flex flex-col gap-4">
        <SpellCard spell={spell} dc={fool.spellDc} />
        <CastFooter
          key={spell.id}
          spell={spell}
          slots={fool.slots}
          onCast={(level) => castSpell(spell, level)}
        />
      </div>,
    );
  const pinAttack = (attack: AttackView) => setDetail(<AttackCard attack={attack} />);
  const pinFeature = (feature: FeatureView) => setDetail(<FeatureCard feature={feature} />);
  const castSpell = (spell: SpellView, level: number) =>
    act(level > 0 ? `Cast ${spell.name} (L${level} slot)` : `Cast ${spell.name}`);
  const applyHp = (kind: HpKind, amount: number) => act(`${HP_LABEL[kind]} ${amount}`);
  const ruleFooter = (name: string) => (
    <button
      type="button"
      onClick={() => act(name)}
      className="min-h-14 w-full rounded-btn bg-accent font-semibold text-bg"
    >
      Take {name}
    </button>
  );

  const spellRow = (spell: SpellView) => (
    <SpellRow
      key={spell.id}
      spell={spell}
      dc={fool.spellDc}
      slots={fool.slots}
      spent={spentFor(spell.cost)}
      concentrating={spell.id === fool.concentration.id}
      onCast={castSpell}
      onPin={pinSpell}
    />
  );

  const attackRow = (attack: AttackView, label = 'Attack', cost: Cost = 'A') => (
    <ActionRow
      key={`${attack.id}-${cost}`}
      iconId={attack.id}
      name={cost === 'R' ? `Opportunity Attack (${attack.name})` : attack.name}
      badges={<CostBadge cost={cost} />}
      meta={`${signed(attack.toHit)} to hit · ${attack.damage} ${attack.damageType} · ${attack.notes}`}
      actionLabel={label}
      onAction={() => act(`${label}: ${attack.name}`)}
      spent={spentFor(cost)}
      onPin={() => pinAttack(attack)}
      preview={{ title: attack.name, content: <AttackCard attack={attack} /> }}
    />
  );

  const featureRow = (feature: FeatureView) => {
    const uses = feature.uses;
    const meta = uses
      ? `${uses.max - uses.used} / ${uses.max} left · ${uses.die} · ${uses.recharge}`
      : feature.lines[0];
    return (
      <ActionRow
        key={feature.id}
        iconId={feature.id}
        name={feature.name}
        badges={<CostBadge cost={feature.cost} />}
        meta={meta}
        actionLabel="Use"
        onAction={() => act(`Use ${feature.name}`)}
        spent={spentFor(feature.cost)}
        onPin={() => pinFeature(feature)}
        preview={{ title: feature.name, content: <FeatureCard feature={feature} /> }}
      />
    );
  };

  const cantrips = spells.filter((s) => s.level === 0);
  const bonusSpells = spells.filter((s) => s.cost === 'BA');

  const effects = (
    <>
      <section className="flex flex-col gap-2">
        <SectionLabel>Concentration</SectionLabel>
        <ConcentrationChip
          name={fool.concentration.name}
          remaining={fool.concentration.remaining}
          onEnd={() => act(`End concentration: ${fool.concentration.name}`)}
          className="self-start"
        />
      </section>
      <section className="flex flex-col gap-2">
        <SectionLabel>Effects on you</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {fool.effects.length === 0 ? (
            <span className="text-sm text-text-muted">None</span>
          ) : (
            fool.effects.map((e) => <EffectChip key={e.id} name={e.name} remaining={e.remaining} />)
          )}
        </div>
      </section>
    </>
  );

  return (
    <div className="mx-auto grid max-w-screen-2xl gap-4 px-4 py-4 lg:px-6 @min-[900px]:grid-cols-[minmax(0,1fr)_20rem] @min-[1100px]:gap-6 @min-[1100px]:grid-cols-[minmax(0,1fr)_24rem]">
      <h1 className="sr-only">Combat</h1>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3">
          <div
            ref={combatStatus}
            tabIndex={-1}
            role="status"
            aria-label="Combat status"
            className="min-w-0 flex-1"
          >
            {liveCombat ? (
              <>
                <p className="font-display text-base text-text">
                  Round {Math.max(1, liveCombat.round)}
                </p>
                <p className="text-sm text-accent">
                  {liveCombat.round === 0
                    ? 'Before your first turn'
                    : liveCombat.turnActive
                      ? 'Your turn'
                      : 'Waiting for your turn'}
                </p>
              </>
            ) : (
              <p className="font-display text-base text-text">No active combat</p>
            )}
            <p className="text-xs text-text-muted">
              Initiative {signed(sheet.initiative.value)} · reference
            </p>
          </div>
          {!liveCombat && (
            <button
              type="button"
              onClick={() =>
                run(startCombat, null, combatStatus.current ?? undefined, () => {
                  restoreStatusFocus.current = true;
                })
              }
              className="min-h-11 rounded-btn bg-accent px-4 font-semibold text-bg"
            >
              Start combat
            </button>
          )}
        </section>

        <section aria-label="Action preview" className="flex flex-col gap-3">
          <p role="note" className="text-xs text-text-muted">
            Action preview. Use the HUD and Spellbook for saved changes.
          </p>
          <EconomyBar
            economy={economy}
            movement={{ left: fool.speed - combat.movementUsed, max: fool.speed }}
            onToggle={(slot) => act(`Toggle ${slot}`)}
            onMove={(delta) =>
              act(delta < 0 ? `Move ${-delta} ft` : `Undo ${delta} ft of movement`)
            }
          />
        </section>

        <div className="@min-[900px]:hidden">
          <HpButtons onApply={applyHp} />
        </div>

        <Tabs.Root defaultValue="actions" className="flex flex-col gap-3">
          <Tabs.List
            aria-label="Combat options"
            className="grid grid-cols-5 rounded-card border border-border bg-surface p-1"
          >
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="min-h-11 rounded-btn text-sm text-text-muted data-[state=active]:bg-surface-2 data-[state=active]:font-semibold data-[state=active]:text-accent"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="actions" className="flex flex-col gap-3">
            {!economy.action && <SpentNote what="Action" />}
            <ul className="flex flex-col gap-2">
              {attacks.map((a) => attackRow(a))}
              {cantrips.map(spellRow)}
            </ul>
            <SectionLabel as="h3">Standard actions</SectionLabel>
            <ul className="flex flex-wrap gap-2">
              {standardActions.map((rule) => (
                <li key={rule.name}>
                  <Preview
                    title={rule.name}
                    content={<RuleCard name={rule.name} lines={rule.lines} />}
                    onPin={() =>
                      setDetail(
                        <div className="flex flex-col gap-4">
                          <RuleCard name={rule.name} lines={rule.lines} />
                          {ruleFooter(rule.name)}
                        </div>,
                      )
                    }
                    sheetFooter={ruleFooter(rule.name)}
                  >
                    {({ ref, props }) => (
                      <button
                        ref={ref}
                        type="button"
                        {...props}
                        className={cx(
                          'hover-lift min-h-11 rounded-btn border border-border bg-surface px-3 text-sm text-text',
                          !economy.action && 'opacity-40',
                        )}
                      >
                        {rule.name}
                        {!economy.action && <span className="sr-only"> (Action used)</span>}
                      </button>
                    )}
                  </Preview>
                </li>
              ))}
            </ul>
          </Tabs.Content>

          <Tabs.Content value="spells" className="flex flex-col gap-4">
            {!economy.action && <SpentNote what="Action" />}
            {[0, ...fool.slots.map((s) => s.level)].map((level) => {
              const slot = fool.slots.find((s) => s.level === level);
              return (
                <section key={level} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <SectionLabel as="h3">
                      {level === 0 ? 'Cantrips' : `Level ${level}`}
                    </SectionLabel>
                    {slot && (
                      <PipRow
                        label={`${spellLevelLabel(level)} slots`}
                        max={slot.max}
                        used={slot.used}
                        showLabel={false}
                        size="sm"
                      />
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">
                    {spells.filter((s) => s.level === level).map(spellRow)}
                  </ul>
                </section>
              );
            })}
          </Tabs.Content>

          <Tabs.Content value="bonus" className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {bonusSpells.map(spellRow)}
              {features.filter((f) => f.cost === 'BA').map(featureRow)}
            </ul>
            <RuleNote>
              Cast a bonus-action spell this turn? Any other spell you cast this turn must be a
              cantrip with a casting time of 1 action.
            </RuleNote>
          </Tabs.Content>

          <Tabs.Content value="react" className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {attacks.slice(0, 1).map((a) => attackRow(a, 'Attack', 'R'))}
              {features.filter((f) => f.cost === 'R').map(featureRow)}
            </ul>
            <RuleNote>
              One reaction per round. It comes back at the start of your turn and works on other
              creatures&apos; turns.
            </RuleNote>
          </Tabs.Content>

          <Tabs.Content value="items" className="flex flex-col gap-3">
            {!economy.action && <SpentNote what="Action" />}
            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <ActionRow
                  key={item.id}
                  iconId={item.id}
                  name={item.name}
                  meta={`×${item.qty}`}
                  actionLabel="Use"
                  onAction={() => act(`Use ${item.name}`)}
                  spent={spentFor('A')}
                  preview={{
                    title: item.name,
                    content: <RuleCard name={item.name} lines={item.lines} />,
                  }}
                />
              ))}
            </ul>
          </Tabs.Content>
        </Tabs.Root>

        <div className="flex flex-col gap-3 @min-[900px]:hidden">
          {effects}
          <LastLogLine entries={fool.log} onUndo={() => act('Undo')} />
        </div>
      </div>

      <aside
        aria-label="Status and log"
        className="hidden min-w-0 flex-col gap-5 @min-[900px]:flex"
      >
        <HpPanel hp={fool.hp} onApply={applyHp} />
        {effects}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Log</SectionLabel>
            <button
              type="button"
              onClick={() => act('Undo')}
              className="min-h-11 rounded-btn px-2 text-sm text-accent"
            >
              Undo last
            </button>
          </div>
          <LogList entries={fool.log} />
        </section>
      </aside>
    </div>
  );
}

function SpentNote({ what }: { what: string }) {
  return (
    <p className="text-xs text-text-muted">
      {what} used this turn. Dimmed buttons still work; you will be asked to confirm.
    </p>
  );
}

function RuleNote({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-border pl-3 text-xs text-text-muted">{children}</p>;
}
