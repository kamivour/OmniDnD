import { registry } from '../../data/registry';
import { ABILITIES } from '../../engine/calc/abilities';
import { pendingChoices } from '../../engine/calc/pending-choices';
import type { CharacterState, Sheet } from '../../engine/calc/sheet';

export type OverviewValue = { text: string; sort: number | string };

export interface OverviewColumn {
  id: string;
  label: string;
  /** Shown on first open. */
  initial: boolean;
  value: (state: CharacterState, sheet: Sheet) => OverviewValue;
}

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
const num = (n: number): OverviewValue => ({ text: String(n), sort: n });
const bonus = (n: number): OverviewValue => ({ text: signed(n), sort: n });

/** Every column the DM overview can show. Read only: values come from the computed sheet. */
export const OVERVIEW_COLUMNS: readonly OverviewColumn[] = [
  {
    id: 'hp',
    label: 'HP',
    initial: true,
    value: (s, sheet) => {
      const { live } = s;
      const max = sheet.maxHp.value;
      return {
        text: `${live.hp}/${max}${live.tempHp > 0 ? ` (+${live.tempHp})` : ''}`,
        sort: live.hp,
      };
    },
  },
  { id: 'ac', label: 'AC', initial: true, value: (_s, sheet) => num(sheet.ac.value) },
  {
    id: 'perception',
    label: 'Passive Perception',
    initial: true,
    value: (_s, sheet) => num(sheet.passives.perception.value),
  },
  {
    id: 'insight',
    label: 'Passive Insight',
    initial: true,
    value: (_s, sheet) => num(sheet.passives.insight.value),
  },
  {
    id: 'investigation',
    label: 'Passive Investigation',
    initial: false,
    value: (_s, sheet) => num(sheet.passives.investigation.value),
  },
  {
    id: 'slots',
    label: 'Slots left',
    initial: true,
    value: (s, sheet) => {
      const parts = sheet.slots.max
        .map((max, level) => ({ level, max, left: max - (s.live.slotsUsed[level] ?? 0) }))
        .filter((slot) => slot.level > 0 && slot.max > 0)
        .map((slot) => `L${slot.level} ${slot.left}/${slot.max}`);
      const pact = sheet.slots.pact;
      if (pact)
        parts.push(`Pact L${pact.level} ${pact.count - (s.live.pactSlotsUsed ?? 0)}/${pact.count}`);
      return { text: parts.join(' · ') || '—', sort: parts.length };
    },
  },
  {
    id: 'concentration',
    label: 'Concentrating',
    initial: false,
    value: (s) => {
      const text = s.live.concentration
        ? registry.get('spell', s.live.concentration.spellId).name
        : '—';
      return { text, sort: text.toLowerCase() };
    },
  },
  {
    id: 'conditions',
    label: 'Conditions',
    initial: true,
    value: (s, sheet) => {
      const list = [
        ...sheet.conditions,
        ...(s.live.exhaustion > 0 ? [`exhaustion ${s.live.exhaustion}`] : []),
      ];
      return { text: list.join(', ') || '—', sort: list.length };
    },
  },
  {
    id: 'dc',
    label: 'Spell save DC',
    initial: true,
    value: (_s, sheet) => {
      const dc = sheet.spellcasting[0]?.saveDc.value;
      return dc === undefined ? { text: '—', sort: -1 } : num(dc);
    },
  },
  ...ABILITIES.map((ability): OverviewColumn => ({
    id: `save-${ability}`,
    label: `${ability} save`,
    initial: false,
    value: (_s, sheet) => bonus(sheet.saves[ability].value),
  })),
  {
    id: 'languages',
    label: 'Languages',
    initial: false,
    value: (s) => {
      const text = s.build.proficiencies.languages.join(', ');
      return { text: text || '—', sort: text.toLowerCase() };
    },
  },
  {
    id: 'exhaustion',
    label: 'Exhaustion',
    initial: false,
    value: (s) => num(s.live.exhaustion),
  },
  {
    id: 'death',
    label: 'Death saves',
    initial: false,
    value: (s) => {
      const { success, fail } = s.live.deathSaves;
      return {
        text: success || fail ? `${success} ok / ${fail} fail` : '—',
        sort: fail * 10 + success,
      };
    },
  },
  {
    id: 'inspiration',
    label: 'Inspiration',
    initial: false,
    value: (s) => ({
      text: s.live.inspiration ? 'Yes' : 'No',
      sort: s.live.inspiration ? 1 : 0,
    }),
  },
  {
    id: 'todo',
    label: 'To do',
    initial: false,
    value: (s) => num(pendingChoices(s, registry).filter((item) => !item.optional).length),
  },
];

export const INITIAL_COLUMNS: readonly string[] = OVERVIEW_COLUMNS.filter((c) => c.initial).map(
  (c) => c.id,
);

/** Order rows by one column's sort value; ties keep the name order. */
export function sortRows<T extends { name: string; cells: Record<string, OverviewValue> }>(
  rows: readonly T[],
  columnId: string | null,
  descending: boolean,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  if (!columnId) return [...rows].sort(byName);
  const direction = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a.cells[columnId]?.sort ?? 0;
    const y = b.cells[columnId]?.sort ?? 0;
    const order =
      typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
    return order * direction || byName(a, b);
  });
}

/** One row per character: every column computed once from a single sheet. */
export function overviewCells(state: CharacterState, sheet: Sheet): Record<string, OverviewValue> {
  return Object.fromEntries(
    OVERVIEW_COLUMNS.map((column) => [column.id, column.value(state, sheet)]),
  );
}
