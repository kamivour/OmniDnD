import { Moon, Tent } from 'lucide-react';
import { ConcentrationChip } from '../components/chips';
import { HpBar } from '../components/HpBar';
import { Icon } from '../components/Icon';
import { PipRow } from '../components/PipRow';
import { StatChip } from '../components/StatChip';
import { fool } from '../fixtures/the-fool';
import { useFixtureAction } from '../fixtures/useFixtureAction';
import { signed } from '../format';

/** Global HUD (SPEC §4). Mobile: 2 rows max. Values become tappable adjust popovers in M3. */
export function HudBar() {
  const fixtureAction = useFixtureAction();
  const { hp, concentration } = fool;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Icon id={fool.iconId} size={20} className="hidden text-accent sm:block" />
        <p className="min-w-0 truncate">
          <span className="font-display text-base text-text">{fool.name}</span>
          <span className="hidden text-xs text-text-muted sm:inline"> · {fool.classLine}</span>
        </p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-text-muted">HP</span>
          <span className="font-semibold text-text">
            {hp.current}
            <span className="text-text-muted">/{hp.max}</span>
          </span>
          {hp.temp > 0 && <span className="text-xs text-temp">+{hp.temp}</span>}
          <HpBar current={hp.current} max={hp.max} className="w-14 sm:w-28" />
        </div>
        <StatChip label="AC" value={fool.ac} />
        {/* Wrapper, not a class on StatChip: its own inline-flex would beat `hidden`. */}
        <span className="hidden gap-3 sm:flex">
          <StatChip label="Init" value={signed(fool.initiative)} />
          <StatChip label="Spd" value={fool.speed} />
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        {fool.slots.map((s) => (
          <PipRow key={s.level} label={`L${s.level}`} max={s.max} used={s.used} size="sm" />
        ))}
        <PipRow
          label="BI"
          max={fool.bardicInspiration.max}
          used={fool.bardicInspiration.used}
          tone="accent"
          size="sm"
        />
        <ConcentrationChip
          name={concentration.name}
          onEnd={() => fixtureAction('End concentration')}
          className="ml-auto max-w-40"
        />
        <div className="hidden gap-2 lg:flex">
          <button
            type="button"
            onClick={() => fixtureAction('Short Rest')}
            className="hover-lift inline-flex h-8 items-center gap-1.5 rounded-btn border border-border bg-surface px-3 text-xs text-text"
          >
            <Tent size={14} aria-hidden /> Short
          </button>
          <button
            type="button"
            onClick={() => fixtureAction('Long Rest')}
            className="hover-lift inline-flex h-8 items-center gap-1.5 rounded-btn border border-border bg-surface px-3 text-xs text-text"
          >
            <Moon size={14} aria-hidden /> Long
          </button>
        </div>
      </div>
    </header>
  );
}
