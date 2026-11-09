import { useEffect, useRef, useState } from 'react';
import { Tabs } from 'radix-ui';
import { useTourAutostart } from '../tutorial/useTour';
import { registry } from '../../data/registry';
import {
  combatMovement,
  endCombat,
  endTurn,
  nextTurn,
  healthDetails,
  STANDARD_ACTIONS,
  startCombat,
  startTurn,
  takeCombatAction,
  useEconomy,
  useFeature,
  type StandardActionId,
} from '../../engine/commands';
import {
  combatModel,
  combatSpellsForEconomy,
  type CombatFeature,
  type CombatWeapon,
} from '../combat/combat-model';
import { useCommand } from '../commands/command-context';
import { EncounterTracker } from '../combat/EncounterTracker';
import { LiveFeatureDetail, LiveWeaponDetail } from '../combat/LiveCombatDetails';
import { ActionRow } from '../components/ActionRow';
import { AttackCard, FeatureCard, RuleCard } from '../components/cards';
import { OverrideMarker } from '../components/StatChip';
import { CostBadge } from '../components/CostBadge';
import { EconomyBar } from '../components/EconomyBar';
import { HpButtons, HpPanel } from '../components/HpControl';
import { PipRow } from '../components/PipRow';
import { Preview } from '../components/Preview';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { SpellRow } from '../components/SpellRow';
import type { Cost } from '../fixtures/the-fool';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';
import { LiveSpellDetail } from '../spells/LiveSpellDetail';
import { LiveEffects } from '../effects/LiveEffects';
import { CombatItems } from '../inventory/InventoryUse';
import { RecentCharacterLog } from '../log/CharacterLog';
import { SpellCastControls } from '../spells/SpellCastControls';
import type { SpellbookEntry } from '../spells/spellbook-model';
import { parseDice } from '../../engine/calc/dice';
import { RollButton } from '../dice/RollButton';

const ECONOMY_NAME = { A: 'Action', BA: 'Bonus action', R: 'Reaction' };
const actionButton =
  'min-h-14 w-full rounded-btn bg-accent px-3 font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40';

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
  const { state, sheet, events } = useCharacter();
  const { run } = useCommand();
  useTourAutostart('combat');
  const combatStatus = useRef<HTMLDivElement>(null);
  const restoreStatusFocus = useRef(false);
  const castOpener = useRef<HTMLElement | null>(null);
  const spellsTab = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState('actions');
  const [showAllSpells, setShowAllSpells] = useState(false);
  const [casting, setCasting] = useState<{
    spellId: string;
    classId: string;
    opener?: HTMLElement;
  } | null>(null);
  const liveCombat = state.live.combat;
  const model = combatModel(state, sheet, registry);
  const visibleSpells = showAllSpells
    ? model.spells.entries
    : combatSpellsForEconomy(model.spells.entries, state.live, registry);
  const movement = combatMovement({ live: state.live, sheet });
  const health = healthDetails({ live: state.live, sheet });
  const economy = {
    action: !liveCombat?.economy.actionUsed,
    bonus: !liveCombat?.economy.bonusUsed,
    reaction: !liveCombat?.economy.reactionUsed,
  };
  const available = {
    A: economy.action,
    BA: economy.bonus,
    R: economy.reaction,
  };
  const { pin: setDetail } = useDetail();

  useEffect(() => {
    if (restoreStatusFocus.current) {
      restoreStatusFocus.current = false;
      combatStatus.current?.focus();
    }
  }, [events]);

  const spentFor = (cost: Cost): string | undefined => {
    if (cost !== 'A' && cost !== 'BA' && cost !== 'R') return undefined;
    return available[cost] ? undefined : ECONOMY_NAME[cost];
  };

  const spellRow = ({ spell, classId, dc, attack }: SpellbookEntry) => (
    <SpellRow
      key={`${classId}:${spell.id}`}
      spell={spell}
      dc={dc}
      attack={attack}
      castingClass={
        model.spells.classes.length + model.spells.unsupportedClassIds.length > 1
          ? registry.get('class', classId).name
          : undefined
      }
      slots={model.spells.slots}
      spent={spentFor(spell.cost)}
      unavailable={
        spell.level > 0 &&
        !model.spells.slots.some((slot) => slot.level >= spell.level && slot.used < slot.max)
      }
      concentrating={spell.id === state.live.concentration?.spellId}
      onCast={(_selected, _level, opener) => {
        castOpener.current = opener ?? (document.activeElement as HTMLElement);
        setCasting({ spellId: spell.id, classId, opener: castOpener.current });
      }}
      sheetFooter={({ close, trigger }) => (
        <SpellCastControls
          spellId={spell.id}
          classId={classId}
          returnFocusTo={trigger}
          onApplied={close}
        />
      )}
      onPin={() => setDetail(<LiveSpellDetail spellId={spell.id} classId={classId} />)}
    />
  );

  const attackRow = ({ instanceId, attack }: CombatWeapon, reaction = false) => (
    <ActionRow
      key={`${instanceId}:${reaction}`}
      iconId={attack.id}
      name={reaction ? `Opportunity Attack (${attack.name})` : attack.name}
      badges={<CostBadge cost={reaction ? 'R' : 'A'} />}
      meta={
        <span>
          {[
            `${signed(attack.toHit)} to hit`,
            attack.damage === undefined
              ? 'No direct damage'
              : `${attack.damage} ${attack.damageType}`,
            attack.notes,
          ].join(' · ')}
          <OverrideMarker override={attack.toHitOverride} />
          <OverrideMarker override={attack.damageOverride} />
        </span>
      }
      auxiliaryAction={
        <span className="flex items-center gap-1">
          <RollButton
            label={`${attack.name} to hit`}
            spec={{ kind: 'd20', bonus: attack.toHit }}
            text="Hit"
          />
          {attack.damage !== undefined && parseDice(attack.damage) && (
            <RollButton
              label={`${attack.name} damage`}
              spec={{ kind: 'dice', expression: attack.damage }}
              text="Dmg"
            />
          )}
        </span>
      }
      actionLabel="Attack"
      disabled={!liveCombat}
      onAction={(event) => {
        event.currentTarget.focus();
        run(
          takeCombatAction,
          { action: 'weapon-attack', instanceId, ...(reaction ? { reaction: true } : {}) },
          combatStatus.current ?? undefined,
        );
      }}
      unavailable={!liveCombat}
      spent={spentFor(reaction ? 'R' : 'A')}
      onPin={() => setDetail(<LiveWeaponDetail instanceId={instanceId} reaction={reaction} />)}
      preview={{
        title: attack.name,
        content: <AttackCard attack={attack} />,
        sheetFooter: ({ close, trigger }) => (
          <LiveWeaponDetail
            instanceId={instanceId}
            reaction={reaction}
            showCard={false}
            onApplied={close}
            returnFocusTo={trigger}
          />
        ),
      }}
    />
  );

  const featureRow = ({ feature, meta, remainingUses, unavailableReason }: CombatFeature) => (
    <ActionRow
      key={feature.id}
      iconId={feature.id}
      name={feature.name}
      badges={<CostBadge cost={feature.cost} />}
      meta={
        <span>
          {meta}
          <OverrideMarker override={feature.override} />
          <OverrideMarker override={feature.dieOverride} />
        </span>
      }
      actionLabel="Use"
      disabled={!!unavailableReason}
      onAction={(event) => {
        const opener = event.currentTarget;
        const preview = opener.closest('li')?.querySelector<HTMLButtonElement>('button');
        opener.focus();
        run(
          useFeature,
          { featureId: feature.id },
          preview ?? combatStatus.current ?? undefined,
          () => {
            requestAnimationFrame(() => {
              if (!opener.matches(':disabled')) return;
              const target =
                preview?.isConnected && preview.getClientRects().length && !preview.disabled
                  ? preview
                  : combatStatus.current;
              if (target?.isConnected && target.getClientRects().length) target.focus();
            });
          },
        );
      }}
      spent={spentFor(feature.cost)}
      unavailable={!!unavailableReason}
      onPin={() => setDetail(<LiveFeatureDetail featureId={feature.id} />)}
      preview={{
        title: feature.name,
        content: <FeatureCard feature={feature} remainingUses={remainingUses} />,
        sheetFooter: ({ close, trigger }) => (
          <LiveFeatureDetail
            featureId={feature.id}
            showCard={false}
            onApplied={close}
            returnFocusTo={trigger}
          />
        ),
      }}
    />
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
            data-tour="combat-status"
            className="min-w-0 flex-1"
          >
            {liveCombat ? (
              <>
                <p className="font-display text-base text-text">
                  Round {Math.max(1, liveCombat.round)}
                </p>
                <p className="text-sm text-accent">
                  {state.live.encounter
                    ? 'The tracker runs the turns'
                    : liveCombat.round === 0
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
              <OverrideMarker override={sheet.initiative.override} />
            </p>
          </div>
          {liveCombat && state.live.encounter ? (
            <button
              type="button"
              onClick={() => run(nextTurn, null, combatStatus.current ?? undefined)}
              className="min-h-14 rounded-btn bg-accent px-4 font-semibold text-bg sm:min-h-11"
            >
              Next turn
            </button>
          ) : liveCombat ? (
            <button
              type="button"
              onClick={() =>
                run(
                  liveCombat.turnActive ? endTurn : startTurn,
                  null,
                  combatStatus.current ?? undefined,
                )
              }
              className="min-h-14 rounded-btn bg-accent px-4 font-semibold text-bg sm:min-h-11"
            >
              {liveCombat.turnActive ? 'End Turn' : 'Start Turn'}
            </button>
          ) : (
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
          {liveCombat && (
            <button
              type="button"
              onClick={() =>
                run(endCombat, null, combatStatus.current ?? undefined, () => {
                  restoreStatusFocus.current = true;
                })
              }
              title="Advance the final round by 6 seconds and leave combat"
              className="min-h-11 min-w-11 rounded-btn border border-border px-3 text-sm text-text-muted hover:text-text"
            >
              End combat
            </button>
          )}
        </section>

        {liveCombat && <EncounterTracker />}

        {liveCombat && (
          <section aria-label="Turn economy" data-tour="combat-economy">
            <EconomyBar
              economy={economy}
              movement={{
                left: movement.remaining,
                max: movement.maximum,
              }}
              onToggle={(slot) =>
                run(
                  useEconomy,
                  { kind: slot, release: !economy[slot] },
                  combatStatus.current ?? undefined,
                )
              }
              onMove={(delta) =>
                run(
                  useEconomy,
                  { kind: 'movement', feet: -delta },
                  combatStatus.current ?? undefined,
                )
              }
            />
          </section>
        )}

        <div className="@min-[900px]:hidden">
          <HpButtons />
        </div>

        <Tabs.Root value={tab} onValueChange={setTab} className="flex flex-col gap-3">
          <Tabs.List
            aria-label="Combat options"
            data-tour="combat-options"
            className="grid grid-cols-5 rounded-card border border-border bg-surface p-1"
          >
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.value}
                ref={t.value === 'spells' ? spellsTab : undefined}
                value={t.value}
                className="min-h-11 rounded-btn text-sm text-text-muted data-[state=active]:bg-surface-2 data-[state=active]:font-semibold data-[state=active]:text-accent"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="actions" className="flex flex-col gap-3">
            {!economy.action && <SpentNote what="Action" />}
            {!liveCombat && (
              <p className="text-xs text-text-muted">
                Start combat to use weapon and standard actions. Spells and features can be used
                outside combat.
              </p>
            )}
            <p className="text-xs text-text-muted">
              Resolve attack rolls, targets and damage at the table.
            </p>
            <SectionLabel as="h3">Weapons</SectionLabel>
            <ul className="flex flex-col gap-2">
              {model.weapons.map((weapon) => attackRow(weapon))}
            </ul>
            {model.weapons.length === 0 && (
              <p className="text-sm text-text-muted">No weapons equipped.</p>
            )}
            <SectionLabel as="h3">Standard actions</SectionLabel>
            <ul className="flex flex-wrap gap-2">
              {STANDARD_ACTIONS.map((rule) => (
                <li key={rule.id}>
                  <Preview
                    title={rule.name}
                    content={<RuleCard name={rule.name} lines={rule.lines} />}
                    onPin={() => setDetail(<LiveStandardActionDetail actionId={rule.id} />)}
                    sheetFooter={({ close, trigger }) => (
                      <LiveStandardActionDetail
                        actionId={rule.id}
                        showCard={false}
                        onApplied={close}
                        returnFocusTo={trigger}
                      />
                    )}
                  >
                    {({ ref, props }) => (
                      <button
                        ref={ref}
                        type="button"
                        {...props}
                        className="hover-lift min-h-11 rounded-btn border border-border bg-surface px-3 py-1 text-sm text-text"
                      >
                        {rule.name}
                        {!economy.action && (
                          <span className="block text-xs text-text-muted"> (Action used)</span>
                        )}
                      </button>
                    )}
                  </Preview>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setTab('spells');
                    spellsTab.current?.focus();
                  }}
                  className="min-h-11 rounded-btn border border-border bg-surface px-3 text-sm text-accent"
                >
                  Cast a Spell
                </button>
              </li>
            </ul>
            <SectionLabel as="h3">Action spells</SectionLabel>
            <ul className="flex flex-col gap-2">
              {model.spells.entries.filter(({ spell }) => spell.cost === 'A').map(spellRow)}
            </ul>
            {!model.spells.entries.some(({ spell }) => spell.cost === 'A') && (
              <p className="text-sm text-text-muted">No action spells selected.</p>
            )}
            {model.features.some(({ feature }) => feature.cost === 'A') && (
              <>
                <SectionLabel as="h3">Action features</SectionLabel>
                <ul className="flex flex-col gap-2">
                  {model.features.filter(({ feature }) => feature.cost === 'A').map(featureRow)}
                </ul>
              </>
            )}
          </Tabs.Content>

          <Tabs.Content value="spells" className="flex flex-col gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={showAllSpells}
                onChange={(event) => setShowAllSpells(event.target.checked)}
                className="size-4 accent-(--omni-accent)"
              />
              Show all spells
            </label>
            {model.spells.classes.map((castingClass) => (
              <p key={castingClass.classId} className="text-xs text-text-muted">
                {castingClass.name} · Save DC {castingClass.dc} · Attack{' '}
                {signed(castingClass.attack)}
                {' · '}
                {castingClass.cantrips}
                {castingClass.cantripLimit === undefined ? '' : ` / ${castingClass.cantripLimit}`}
                {' cantrips · '}
                {castingClass.known}
                {castingClass.knownLimit === undefined ? '' : ` / ${castingClass.knownLimit}`}
                {castingClass.mode === 'spellbook' ? ' in spellbook' : ' known'}
                {(castingClass.mode === 'prepared' || castingClass.mode === 'spellbook') &&
                  ` · ${castingClass.prepared}${castingClass.preparedLimit === undefined ? '' : ` / ${castingClass.preparedLimit}`} prepared`}
              </p>
            ))}
            {model.spells.unsupportedClassIds.length > 0 && (
              <p role="note" className="text-xs text-warn">
                Retained spells for{' '}
                {model.spells.unsupportedClassIds
                  .map((id) => registry.get('class', id).name)
                  .join(', ')}{' '}
                have unavailable casting stats. Review their class association in Spellbook.
              </p>
            )}
            {model.spells.entries.length === 0 && (
              <p className="text-sm text-text-muted">No spells selected yet.</p>
            )}
            {model.spells.entries.length > 0 && visibleSpells.length === 0 && (
              <p className="text-sm text-text-muted">
                No spells match your current economy. Show all spells to review exceptions.
              </p>
            )}
            {model.spells.levels.map((level) => {
              const slot = model.spells.slots.find((s) => s.level === level);
              const group = visibleSpells.filter(({ spell }) => spell.level === level);
              if (group.length === 0 && !slot) return null;
              return (
                <section
                  key={level}
                  aria-label={level === 0 ? 'Cantrips' : `Level ${level}`}
                  className="flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <SectionLabel as="h3">
                      {level === 0 ? 'Cantrips' : `Level ${level}`}
                    </SectionLabel>
                    {slot && (
                      <PipRow
                        label={`Level ${level} spell slots`}
                        max={slot.max}
                        used={slot.used}
                        showLabel={false}
                        size="sm"
                      />
                    )}
                  </div>
                  <ul className="flex flex-col gap-2">{group.map(spellRow)}</ul>
                </section>
              );
            })}
          </Tabs.Content>

          <Tabs.Content value="bonus" className="flex flex-col gap-3">
            {!economy.bonus && <SpentNote what="Bonus action" />}
            <ul className="flex flex-col gap-2">
              {model.spells.entries.filter(({ spell }) => spell.cost === 'BA').map(spellRow)}
              {model.features.filter(({ feature }) => feature.cost === 'BA').map(featureRow)}
            </ul>
            {!model.spells.entries.some(({ spell }) => spell.cost === 'BA') &&
              !model.features.some(({ feature }) => feature.cost === 'BA') && (
                <p className="text-sm text-text-muted">
                  No bonus-action spells or features selected.
                </p>
              )}
          </Tabs.Content>

          <Tabs.Content value="react" className="flex flex-col gap-3">
            {!economy.reaction && <SpentNote what="Reaction" />}
            <ul className="flex flex-col gap-2">
              {model.weapons
                .filter((weapon) => weapon.type === 'melee')
                .map((weapon) => attackRow(weapon, true))}
              {model.spells.entries.filter(({ spell }) => spell.cost === 'R').map(spellRow)}
              {model.features.filter(({ feature }) => feature.cost === 'R').map(featureRow)}
              <ActionRow
                iconId="rule.Ready"
                name="Readied action"
                badges={<CostBadge cost="R" />}
                meta={
                  health.status === 'dead'
                    ? 'You are dead. This reaction is unavailable.'
                    : 'Resolve the chosen trigger and response at the table.'
                }
                actionLabel="Use"
                disabled={!liveCombat || health.status === 'dead'}
                spent={spentFor('R')}
                unavailable={!liveCombat}
                onAction={(event) => {
                  event.currentTarget.focus();
                  run(
                    takeCombatAction,
                    { action: 'readied-response' },
                    combatStatus.current ?? undefined,
                  );
                }}
                preview={{
                  title: 'Readied action',
                  content: (
                    <p className="text-sm text-text">
                      Use your reaction for a response you readied. The trigger, response and any
                      held spell are resolved at the table.
                    </p>
                  ),
                }}
              />
            </ul>
            <p className="text-xs text-text-muted">
              A reaction returns at the start of your turn and can be used on another creature's
              turn.
            </p>
          </Tabs.Content>

          <Tabs.Content value="items" className="flex flex-col gap-3">
            {!economy.action && <SpentNote what="Action" />}
            <p className="text-xs text-text-muted">
              Drinking or giving a potion takes your action. Effects other than healing are resolved
              at the table.
            </p>
            <CombatItems />
          </Tabs.Content>
        </Tabs.Root>

        <div className="flex flex-col gap-3 @min-[900px]:hidden">
          <LiveEffects />
        </div>
      </div>

      <aside
        aria-label="Status and log"
        className="hidden min-w-0 flex-col gap-5 @min-[900px]:flex"
      >
        <HpPanel />
        <LiveEffects />
        <RecentCharacterLog />
      </aside>
      <Sheet
        open={casting !== null}
        onOpenChange={(open) => !open && setCasting(null)}
        title={casting ? `Cast ${registry.get('spell', casting.spellId).name}` : 'Cast spell'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (castOpener.current?.isConnected && castOpener.current.getClientRects().length
            ? castOpener.current
            : combatStatus.current
          )?.focus();
        }}
      >
        {casting && (
          <LiveSpellDetail
            key={`${casting.classId}:${casting.spellId}`}
            spellId={casting.spellId}
            classId={casting.classId}
            returnFocusTo={casting.opener}
            onApplied={() => setCasting(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function SpentNote({ what }: { what: string }) {
  return (
    <p className="text-xs text-text-muted">
      {what} used this turn. These actions still work; you will be asked to confirm.
    </p>
  );
}

interface LiveActionProps {
  showCard?: boolean;
  returnFocusTo?: HTMLElement;
  onApplied?: () => void;
}

/** Pinned actions and preview footers re-read combat state instead of retaining stale controls. */
function LiveStandardActionDetail({
  actionId,
  showCard = true,
  returnFocusTo,
  onApplied,
}: LiveActionProps & { actionId: StandardActionId }) {
  const { state } = useCharacter();
  const { run } = useCommand();
  const container = useRef<HTMLDivElement>(null);
  const rule = STANDARD_ACTIONS.find(({ id }) => id === actionId);
  if (!rule) return null;
  return (
    <div ref={container} tabIndex={-1} className="flex flex-col gap-4">
      {showCard && <RuleCard name={rule.name} lines={rule.lines} />}
      {!state.live.combat && (
        <p className="text-sm text-text-muted">Start combat to use this action.</p>
      )}
      <button
        type="button"
        disabled={!state.live.combat}
        className={actionButton}
        onClick={(event) => {
          event.currentTarget.focus();
          run(
            takeCombatAction,
            { action: actionId },
            returnFocusTo ?? container.current ?? undefined,
            onApplied,
          );
        }}
      >
        Take {rule.name}
      </button>
    </div>
  );
}
