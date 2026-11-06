import { ABILITIES, type Ability } from '../../engine/calc/abilities';
import type { DamageType } from '../../engine/rules2014';
import {
  CompanionSchema,
  type Companion,
  type CompanionType,
  type OwnerNumber,
} from '../../engine/schema';

/**
 * Form model for adding or editing a companion. Numbers are kept as typed text and parsed
 * strictly on save. A number worked out from the owner stays as-is until the player
 * replaces it with a plain number.
 */
export type NumberInput = string | Exclude<OwnerNumber, number>;

export const SPEED_KINDS = ['walk', 'fly', 'swim', 'climb', 'burrow'] as const;
export type SpeedKind = (typeof SPEED_KINDS)[number];
type Recharge = Companion['uses'][number]['recharge'];

export interface AttackInput {
  name: string;
  bonus: NumberInput;
  dice: string;
  damageBonus: NumberInput;
  type: DamageType | '';
  range: string;
  note: string;
}

export interface UseInput {
  id: string;
  name: string;
  max: string;
  recharge: Recharge;
}

export interface CompanionForm {
  name: string;
  type: CompanionType;
  kind: string;
  ac: NumberInput;
  maxHp: NumberInput;
  speed: Record<SpeedKind, string>;
  abilities: Record<Ability, string>;
  attacks: AttackInput[];
  /** One trait per line. */
  traits: string;
  uses: UseInput[];
  notes: string;
}

const numberText = (value: OwnerNumber | undefined): NumberInput =>
  value === undefined ? '' : typeof value === 'number' ? String(value) : value;

/** Whole numbers only: "12" and "-1" pass, "12abc" and "1.5" do not. */
export function parseWhole(text: string): number | null {
  const trimmed = text.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : null;
}

export function emptyForm(): CompanionForm {
  return {
    name: '',
    type: 'pet',
    kind: '',
    ac: '10',
    maxHp: '1',
    speed: { walk: '30', fly: '', swim: '', climb: '', burrow: '' },
    abilities: { STR: '10', DEX: '10', CON: '10', INT: '10', WIS: '10', CHA: '10' },
    attacks: [],
    traits: '',
    uses: [],
    notes: '',
  };
}

export function emptyAttack(): AttackInput {
  return { name: '', bonus: '0', dice: '', damageBonus: '', type: '', range: '', note: '' };
}

export function toForm(companion: Omit<Companion, 'id'>): CompanionForm {
  const speed = Object.fromEntries(
    SPEED_KINDS.map((kind) => [kind, companion.speed[kind]?.toString() ?? '']),
  ) as Record<SpeedKind, string>;
  const abilities = Object.fromEntries(
    ABILITIES.map((ability) => [ability, String(companion.abilities[ability] ?? 10)]),
  ) as Record<Ability, string>;
  return {
    name: companion.name,
    type: companion.type,
    kind: companion.kind ?? '',
    ac: numberText(companion.ac),
    maxHp: numberText(companion.maxHp),
    speed,
    abilities,
    attacks: companion.attacks.map((attack) => ({
      name: attack.name,
      bonus: numberText(attack.bonus),
      dice: attack.damage?.dice ?? '',
      damageBonus: numberText(attack.damage?.bonus),
      type: attack.damage?.type ?? '',
      range: attack.range ?? '',
      note: attack.note ?? '',
    })),
    traits: companion.traits.join('\n'),
    uses: companion.uses.map((use) => ({
      id: use.id,
      name: use.name,
      max: String(use.max),
      recharge: use.recharge,
    })),
    notes: companion.notes ?? '',
  };
}

const optionalText = (text: string) => (text.trim() === '' ? undefined : text.trim());

function ownerNumber(input: NumberInput): OwnerNumber | null {
  return typeof input === 'string' ? parseWhole(input) : input;
}

/**
 * Builds the companion from the form, keeping fields the form does not show (icon, limit,
 * duration, source) from `base`. Returns an error message for the first problem found.
 */
export function fromForm(
  form: CompanionForm,
  id: string,
  base?: Partial<Companion>,
): { companion: Companion } | { error: string } {
  if (form.name.trim() === '') return { error: 'Enter a name.' };
  const ac = ownerNumber(form.ac);
  if (ac === null) return { error: 'AC must be a whole number.' };
  const maxHp = ownerNumber(form.maxHp);
  if (maxHp === null || (typeof maxHp === 'number' && maxHp < 1))
    return { error: 'Max HP must be a whole number of at least 1.' };

  const speed: Companion['speed'] = {};
  for (const kind of SPEED_KINDS) {
    const text = form.speed[kind];
    if (text.trim() === '') continue;
    const feet = parseWhole(text);
    if (feet === null || feet < 0) return { error: `Speed (${kind}) must be 0 or more.` };
    speed[kind] = feet;
  }

  const abilities = {} as Record<Ability, number>;
  for (const ability of ABILITIES) {
    const score = parseWhole(form.abilities[ability]);
    if (score === null || score < 1 || score > 30)
      return { error: `${ability} must be from 1 to 30.` };
    abilities[ability] = score;
  }

  const attacks: Companion['attacks'] = [];
  for (const attack of form.attacks) {
    const name = attack.name.trim();
    if (name === '') return { error: 'Each attack needs a name.' };
    const bonus = ownerNumber(attack.bonus);
    if (bonus === null) return { error: `${name}: attack bonus must be a whole number.` };
    const dice = attack.dice.trim();
    const hasDamageBonus =
      typeof attack.damageBonus !== 'string' || attack.damageBonus.trim() !== '';
    const damageBonus = hasDamageBonus ? ownerNumber(attack.damageBonus) : undefined;
    if (damageBonus === null) return { error: `${name}: damage bonus must be a whole number.` };
    if ((dice || hasDamageBonus) && !attack.type)
      return { error: `${name}: choose a damage type.` };
    if (dice && !/^[1-9]\d*d(4|6|8|10|12|20|100)$/.test(dice))
      return { error: `${name}: damage dice look like 1d6 or 2d8.` };
    attacks.push({
      name,
      bonus,
      ...(attack.type && {
        damage: {
          ...(dice && { dice }),
          ...(damageBonus !== undefined && { bonus: damageBonus }),
          type: attack.type,
        },
      }),
      ...(optionalText(attack.range) && { range: attack.range.trim() }),
      ...(optionalText(attack.note) && { note: attack.note.trim() }),
    });
  }

  const uses: Companion['uses'] = [];
  for (const use of form.uses) {
    const name = use.name.trim();
    if (name === '') return { error: 'Each limited use needs a name.' };
    const max = parseWhole(use.max);
    if (max === null || max < 1) return { error: `${name}: uses must be 1 or more.` };
    uses.push({ id: use.id, name, max, recharge: use.recharge });
  }

  const candidate: Companion = {
    ...(base?.iconId && { iconId: base.iconId }),
    ...(base?.limit && { limit: base.limit }),
    ...(base?.durationSeconds && { durationSeconds: base.durationSeconds }),
    ...(base?.sourceId && { sourceId: base.sourceId }),
    id,
    name: form.name.trim(),
    type: form.type,
    ac,
    maxHp,
    speed,
    abilities,
    attacks,
    traits: form.traits
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    uses,
  };
  const kind = optionalText(form.kind);
  const notes = optionalText(form.notes);
  if (kind) candidate.kind = kind;
  if (notes) candidate.notes = notes;

  const parsed = CompanionSchema.safeParse(candidate);
  return parsed.success ? { companion: parsed.data } : { error: 'Check the companion details.' };
}
