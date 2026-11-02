import type { SpellView } from '../fixtures/the-fool';
import { schoolIconId, signed } from '../format';
import { SPELL_TYPES } from '../spellTypes';
import { ActionRow } from './ActionRow';
import { CastFooter } from './CastFooter';
import { SpellCard } from './cards';
import { ConcBadge, CostBadge } from './CostBadge';
import type { PreviewFooter } from './Preview';

interface SpellRowProps {
  spell: SpellView;
  dc?: number;
  attack?: number;
  castingClass?: string;
  slots: readonly { level: number; max: number; used: number }[];
  /** Economy slot this spell needs is spent ("Action", "Bonus action", ...). */
  spent?: string;
  unavailable?: boolean;
  concentrating?: boolean;
  onCast: (spell: SpellView, level: number, returnFocusTo?: HTMLElement) => void;
  onPin?: (spell: SpellView) => void;
  sheetFooter?: PreviewFooter;
}

/** Spell list row: icon, name, cost, C / Rit, main type, save or range, Cast. Box tinted by main type. */
export function SpellRow({
  spell,
  dc,
  attack,
  castingClass,
  slots,
  spent,
  unavailable,
  concentrating,
  onCast,
  onPin,
  sheetFooter,
}: SpellRowProps) {
  const type = SPELL_TYPES[spell.type];
  const details = [
    spell.save && `${spell.save} ${dc === undefined ? 'save (DC unavailable)' : dc}`,
    spell.attack &&
      (attack === undefined ? 'spell attack unavailable' : `${signed(attack)} spell attack`),
    spell.range,
    spell.duration !== 'Instant' && spell.duration,
  ]
    .filter(Boolean)
    .join(' · ');
  const meta = (
    <>
      {castingClass && `${castingClass} · `}
      <span className={type.text}>{type.label}</span> · {details}
    </>
  );

  return (
    <ActionRow
      iconId={spell.id}
      fallbackIconId={schoolIconId(spell.school)}
      name={spell.name}
      badges={
        <>
          <CostBadge cost={spell.cost} />
          {spell.concentration && <ConcBadge />}
          {spell.ritual && <CostBadge cost="Rit" />}
        </>
      }
      meta={meta}
      actionLabel="Cast"
      onAction={(event) => onCast(spell, spell.level, event.currentTarget)}
      spent={spent}
      unavailable={unavailable}
      tone={type.box}
      concentrating={concentrating}
      onPin={onPin && (() => onPin(spell))}
      preview={{
        title: spell.name,
        content: <SpellCard spell={spell} dc={dc} attack={attack} />,
        sheetFooter: sheetFooter ?? (
          <CastFooter spell={spell} slots={slots} onCast={(level) => onCast(spell, level)} />
        ),
      }}
    />
  );
}
