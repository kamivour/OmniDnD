import { useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { setQuickAccessFavorite } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { LiveFeatureDetail, LiveWeaponDetail } from '../combat/LiveCombatDetails';
import { combatModel } from '../combat/combat-model';
import { AttackCard, FeatureCard, SpellCard } from '../components/cards';
import { Icon } from '../components/Icon';
import { Preview } from '../components/Preview';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';
import { LiveSpellDetail } from '../spells/LiveSpellDetail';
import { SpellCastControls } from '../spells/SpellCastControls';
import { dashboardFavoriteChoices, dashboardQuickAccess } from './dashboard-model';

/** Every preview and pinned action resolves the saved favorite again after commands. */
export function LiveQuickDetail({
  quickKey,
  returnFocusTo,
  onApplied,
  mode = 'detail',
}: {
  quickKey: string;
  returnFocusTo?: HTMLElement;
  onApplied?: () => void;
  mode?: 'preview' | 'controls' | 'detail';
}) {
  const { state, sheet } = useCharacter();
  const entry = dashboardQuickAccess(state, sheet, registry).find(({ key }) => key === quickKey);
  if (!entry)
    return <p className="text-sm text-text-muted">This favorite is no longer available.</p>;
  const model = combatModel(state, sheet, registry);
  if (entry.kind === 'spell') {
    if (mode === 'controls')
      return (
        <SpellCastControls
          spellId={entry.id}
          classId={entry.classId}
          returnFocusTo={returnFocusTo}
          onApplied={onApplied}
        />
      );
    if (mode === 'preview') {
      const spell = model.spells.entries.find(
        ({ spell, classId }) => spell.id === entry.id && classId === entry.classId,
      );
      return spell ? <SpellCard spell={spell.spell} dc={spell.dc} attack={spell.attack} /> : null;
    }
    return (
      <LiveSpellDetail
        spellId={entry.id}
        classId={entry.classId}
        returnFocusTo={returnFocusTo}
        onApplied={onApplied}
      />
    );
  }
  if (entry.kind === 'feature' && entry.actionable) {
    if (mode === 'preview') {
      const feature = model.features.find(({ feature }) => feature.id === entry.featureId);
      return feature ? (
        <FeatureCard feature={feature.feature} remainingUses={feature.remainingUses} />
      ) : null;
    }
    return (
      <LiveFeatureDetail
        featureId={entry.featureId}
        showCard={mode !== 'controls'}
        returnFocusTo={returnFocusTo}
        onApplied={onApplied}
      />
    );
  }
  if (entry.kind === 'weapon') {
    if (mode === 'preview') {
      const weapon = model.weapons.find(({ instanceId }) => instanceId === entry.instanceId);
      return weapon ? <AttackCard attack={weapon.attack} /> : null;
    }
    return (
      <LiveWeaponDetail
        instanceId={entry.instanceId}
        showCard={mode !== 'controls'}
        returnFocusTo={returnFocusTo}
        onApplied={onApplied}
      />
    );
  }
  if (mode === 'controls') return null;
  const definition = registry.entries.get(entry.id);
  const text = definition?.summary?.effect ?? definition?.fullText?.split(/\n\s*\n/)[0];
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-text">{entry.name}</h3>
      {text && <p className="text-sm text-text">{text}</p>}
      {entry.kind === 'unavailable' ? (
        <p className="text-sm text-text-muted">{entry.reason}</p>
      ) : entry.kind === 'item' ? (
        <p className="text-sm text-text-muted">Manage quantity and equipped gear in Inventory.</p>
      ) : (
        <p className="text-sm text-text-muted">
          This feature is a reference here. Resolve its passive or special timing at the table.
        </p>
      )}
    </div>
  );
}

export function DashboardQuickAccess() {
  const { state, sheet } = useCharacter();
  const { pin } = useDetail();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const entries = dashboardQuickAccess(state, sheet, registry);
  return (
    <section aria-label="Quick access" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Quick access</SectionLabel>
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-btn px-2 text-sm text-accent"
        >
          Manage quick access
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted">
          No favorites yet. Choose shortcuts here or star spells in Spellbook.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
          {entries.map((entry) => (
            <li key={entry.key} className="min-w-0">
              <Preview
                title={entry.name}
                content={<LiveQuickDetail quickKey={entry.key} mode="preview" />}
                onPin={() => pin(<LiveQuickDetail quickKey={entry.key} />)}
                sheetFooter={({ close, trigger }) => (
                  <LiveQuickDetail
                    quickKey={entry.key}
                    mode="controls"
                    returnFocusTo={trigger}
                    onApplied={close}
                  />
                )}
              >
                {({ ref, props }) => (
                  <button
                    ref={ref}
                    type="button"
                    {...props}
                    className="hover-lift group flex min-h-14 w-full items-center gap-2 rounded-card border border-border bg-surface px-3 text-left"
                  >
                    <Icon id={entry.id} className="shrink-0 text-text-muted" />
                    <span className="min-w-0 wrap-anywhere text-sm text-text">{entry.name}</span>
                  </button>
                )}
              </Preview>
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Manage quick access"
        description="Choose favorite spells, features, and items. Each change is saved and undoable."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        {open && <QuickAccessChoices onClose={() => setOpen(false)} />}
      </Sheet>
    </section>
  );
}

function QuickAccessChoices({ onClose }: { onClose: () => void }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [query, setQuery] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const choices = dashboardFavoriteChoices(state, sheet, registry).filter(({ name }) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div ref={container} tabIndex={-1} className="flex flex-col gap-3">
      <label className="text-sm text-text">
        Find quick access
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-btn border border-border bg-surface px-3"
        />
      </label>
      <ul className="flex flex-col gap-2">
        {choices.map((choice) => (
          <li key={choice.id}>
            <label className="flex min-h-11 items-start gap-2 py-2 text-sm text-text">
              <input
                type="checkbox"
                aria-label={choice.name}
                checked={state.build.favorites.includes(choice.id)}
                onChange={(event) => {
                  const control = event.currentTarget;
                  run(
                    setQuickAccessFavorite,
                    { refId: choice.id, favorite: control.checked },
                    container.current ?? undefined,
                    () =>
                      requestAnimationFrame(() => {
                        if (!control.isConnected) container.current?.focus();
                      }),
                  );
                }}
                className="mt-1 size-4 shrink-0 accent-(--omni-accent)"
              />
              <span className="min-w-0 wrap-anywhere">
                {choice.name}
                {choice.note && (
                  <span className="block text-xs text-text-muted">{choice.note}</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {choices.length === 0 && <p className="text-sm text-text-muted">No matching choices.</p>}
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 rounded-btn bg-accent font-semibold text-bg"
      >
        Done
      </button>
    </div>
  );
}
