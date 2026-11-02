import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { AttackView, FeatureView, SpellView } from '../fixtures/the-fool';
import { schoolIconId, signed, spellLevelLabel } from '../format';
import { SPELL_TYPES } from '../spellTypes';
import { cx } from '../cx';
import { CostBadge, ConcBadge } from './CostBadge';
import { Icon } from './Icon';
import { PipRow } from './PipRow';

/** Preview / detail card frame: icon, title, source, then house-style lines. */
function Card({
  iconId,
  fallbackIconId,
  title,
  source,
  header,
  lines,
  footer,
}: {
  iconId: string;
  fallbackIconId?: string;
  title: string;
  source?: string;
  header: ReactNode;
  lines: readonly string[];
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <Icon id={iconId} fallback={fallbackIconId} size={40} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-text">{title}</h3>
            {source && <span className="text-xs text-text-muted">{source}</span>}
          </div>
          <div className="text-xs text-text-muted">{header}</div>
        </div>
      </div>
      {lines.map((line) => (
        <p key={line} className="text-text">
          {line}
        </p>
      ))}
      {footer}
    </div>
  );
}

export function SpellCard({
  spell,
  dc,
  attack,
  links,
}: {
  spell: SpellView;
  dc?: number;
  attack?: number;
  links?: boolean;
}) {
  const header = (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <span>
          {spellLevelLabel(spell.level)} {spell.school}
        </span>
        <CostBadge cost={spell.cost} />
        <span>· {spell.range}</span>
      </span>
      {/* Own line: as a wrapped tail of the line above it would start with a stray "·". */}
      {spell.save && (
        <span className="mt-0.5 block">
          {spell.save} save {dc === undefined ? '(DC unavailable)' : `DC ${dc}`}
        </span>
      )}
      {spell.attack && (
        <span className="mt-0.5 block">
          {spell.attack === 'melee' ? 'Melee' : 'Ranged'} spell attack{' '}
          {attack === undefined ? 'unavailable' : signed(attack)}
        </span>
      )}
      <span className="mt-0.5 flex items-center gap-1.5">
        {spell.concentration && <ConcBadge />}
        <span>
          {spell.concentration ? 'Conc, ' : ''}
          {spell.duration} · {spell.components}
          {spell.ritual ? ' · Ritual' : ''}
        </span>
      </span>
      <span className="mt-1.5 flex flex-wrap gap-1">
        {spell.tags.map((t) => (
          <span
            key={t}
            className={cx('rounded-btn border px-1.5 text-xs leading-5', SPELL_TYPES[t].chip)}
          >
            {SPELL_TYPES[t].label}
          </span>
        ))}
      </span>
    </>
  );
  return (
    <Card
      iconId={spell.id}
      fallbackIconId={schoolIconId(spell.school)}
      title={spell.name}
      source={spell.source}
      header={header}
      lines={spell.lines}
      footer={links ? <ExternalLinkRow href={spell.url} label="D&D Beyond" /> : undefined}
    />
  );
}

export function AttackCard({ attack }: { attack: AttackView }) {
  return (
    <Card
      iconId={attack.id}
      title={attack.name}
      header={`Weapon attack · ${signed(attack.toHit)} to hit`}
      lines={[`Hit: ${attack.damage} ${damageTypeName(attack.damageType)}.`, attack.notes]}
    />
  );
}

export function FeatureCard({ feature }: { feature: FeatureView }) {
  const uses = feature.uses;
  return (
    <Card
      iconId={feature.id}
      title={feature.name}
      header={
        <span className="flex items-center gap-1.5">
          <CostBadge cost={feature.cost} />
          {uses && (
            <span>
              {uses.max - uses.used} / {uses.max} · {uses.die} · {uses.recharge}
            </span>
          )}
        </span>
      }
      lines={feature.lines}
      footer={uses && <PipRow label="Uses" max={uses.max} used={uses.used} tone="accent" />}
    />
  );
}

/** Tracked resource (spell slots, Bardic Inspiration, Hit Dice): what it is and how it refills. */
export function ResourceCard({
  title,
  max,
  used,
  lines,
}: {
  title: string;
  max: number;
  used: number;
  lines: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="font-semibold text-text">{title}</h3>
        <p className="text-xs text-text-muted">
          {max - used} of {max} left
        </p>
      </div>
      {lines.map((line) => (
        <p key={line} className="text-text">
          {line}
        </p>
      ))}
    </div>
  );
}

/** Standard actions (Dash, Dodge, ...): name + own-words summary. */
export function RuleCard({ name, lines }: { name: string; lines: readonly string[] }) {
  return <Card iconId={`rule.${name}`} title={name} header="Action" lines={lines} />;
}

function ExternalLinkRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-1 self-start text-xs text-accent hover:underline"
    >
      {label}
      <ExternalLink size={14} aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function damageTypeName(code: string): string {
  return { P: 'piercing', S: 'slashing', B: 'bludgeoning' }[code] ?? code;
}
