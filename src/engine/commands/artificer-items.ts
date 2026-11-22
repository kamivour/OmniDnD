import { isArtificerFocusTool } from '../calc/focus';
import { activeInfusions, infusionFits } from '../calc/infusions';
import { spellSelectionDetails } from '../calc/spell-selections';
import { characterRegistry } from '../registry';
import type { ItemDef, SpellDef } from '../schema';
import type { Command, CommandContext } from './runner';
import { applySpellEffects } from './spell-effects';
import { previewSpellHealing, spellCastDetails } from './spell-options';
import {
  block,
  deadCheck,
  economyChecks,
  spendEconomy,
  timeRangeChecks,
  warn,
  withNotes,
} from './shared';

const ARTIFICER = 'class.artificer';
const STORE_SPELL = 'feature.artificer.spell-storing-item';
const ARCANE_FIREARM = 'feature.artificer.artillerist-arcane-firearm';

type ItemContext = Pick<CommandContext, 'build' | 'live' | 'campaign' | 'sheet' | 'registry'>;
const owns = ({ sheet }: Pick<ItemContext, 'sheet'>, id: string) =>
  sheet.features.some(({ def }) => def.id === id);

function singleItems(ctx: ItemContext) {
  const refs = characterRegistry(ctx.registry, ctx.build);
  return ctx.build.items.flatMap(({ instanceId, itemId }) => {
    const def = refs.entries.get(itemId);
    return def?.kind === 'item' && ctx.live.items[instanceId]?.qty === 1
      ? [{ instanceId, def }]
      : [];
  });
}

const firearmFits = (def: ItemDef) =>
  infusionFits('enhanced-arcane-focus', def) || /^Arcane Focus: (Rod|Staff|Wand)$/i.test(def.name);

export function arcaneFirearm(ctx: ItemContext) {
  if (!owns(ctx, ARCANE_FIREARM)) return undefined;
  return singleItems(ctx).find(
    ({ instanceId, def }) => instanceId === ctx.live.arcaneFirearmId && firearmFits(def),
  );
}

export function artificerItemOptions(ctx: ItemContext) {
  const items = singleItems(ctx);
  const infused = new Set(activeInfusions(ctx.build, ctx.live).map(({ instanceId }) => instanceId));
  const store = owns(ctx, STORE_SPELL);
  const firearm = owns(ctx, ARCANE_FIREARM);
  const details = store ? spellSelectionDetails(ctx, ARTIFICER) : undefined;
  const spellIds = new Set([
    ...(details?.candidates.prepared ?? []),
    ...(details?.granted.map(({ id }) => id) ?? []),
  ]);
  const spells = [...spellIds]
    .map((id) => ctx.registry.get('spell', id))
    .filter(
      ({ level, casting, retired }) =>
        level >= 1 && level <= 2 && casting.cost === 'action' && !retired,
    );
  return {
    store,
    firearm,
    spells,
    storedItems: store
      ? items.filter(
          ({ def, instanceId }) =>
            def.weapon ||
            infused.has(instanceId) ||
            isArtificerFocusTool(def.id, ctx.sheet.proficiencies.tools) ||
            (ctx.live.arcaneFirearmId === instanceId && firearm && firearmFits(def)),
        )
      : [],
    firearmItems: firearm ? items.filter(({ def }) => firearmFits(def)) : [],
  };
}

function restWarning(ctx: ItemContext) {
  return ctx.live.lastLongRestEnd === ctx.live.clock.seconds
    ? []
    : [warn('Record this choice at the end of a long rest')];
}

export const storeArtificerSpell: Command<{ instanceId: string; spellId: string }> = {
  name: 'storeArtificerSpell',
  check: (ctx, { instanceId, spellId }) => {
    const options = artificerItemOptions(ctx);
    if (!options.store) return [block('Spell-Storing Item is unavailable')];
    if (!options.storedItems.some((item) => item.instanceId === instanceId))
      return [block('Choose a carried weapon or Artificer focus')];
    if (!options.spells.some((spell) => spell.id === spellId))
      return [block('Choose a level 1 or 2 Artificer spell with a one-action casting time')];
    const checks = [...deadCheck(ctx), ...restWarning(ctx)];
    if (ctx.live.storedSpellItem && ctx.live.storedSpellItem.restEnd === ctx.live.lastLongRestEnd)
      checks.push(warn('You already stored a spell for this long rest'));
    return checks;
  },
  apply: ({ live }, { instanceId, spellId }, ctx) => {
    const item = artificerItemOptions(ctx).storedItems.find(
      (row) => row.instanceId === instanceId,
    )!;
    const limit = Math.min(Number.MAX_SAFE_INTEGER, Math.max(2, 2 * ctx.sheet.abilities.INT.mod));
    const restEnd = live.lastLongRestEnd;
    live.storedSpellItem = {
      instanceId,
      spellId,
      limit,
      spent: 0,
      ...(restEnd === undefined ? {} : { restEnd }),
    };
    return `Stored ${ctx.registry.get('spell', spellId).name} in ${item.def.name} (${limit} uses)`;
  },
};

export function storedSpellItem(ctx: ItemContext) {
  const saved = ctx.live.storedSpellItem;
  if (!saved) return undefined;
  const spell = ctx.registry.entries.get(saved.spellId);
  const item = singleItems(ctx).find(({ instanceId }) => instanceId === saved.instanceId);
  return {
    saved,
    item,
    spell: spell?.kind === 'spell' && !spell.retired ? spell : undefined,
    left: Math.max(0, saved.limit - saved.spent),
  };
}

interface StoredSpellUse {
  otherHolder?: boolean;
  onSelf?: boolean;
  healRoll?: number;
}

export function storedSpellDetails(ctx: ItemContext, spell: SpellDef) {
  return spellCastDetails(ctx, { classId: ARTIFICER, spellId: spell.id, slotLevel: spell.level });
}

const storedHealing = (ctx: ItemContext, spell: SpellDef, healRoll?: number) =>
  healRoll === undefined
    ? undefined
    : previewSpellHealing(
        ctx,
        { classId: ARTIFICER, spellId: spell.id, slotLevel: spell.level },
        healRoll,
      )?.amount;

export const useArtificerStoredSpell: Command<StoredSpellUse> = {
  name: 'useArtificerStoredSpell',
  check: (ctx, input) => {
    const stored = storedSpellItem(ctx);
    if (!stored?.item || !stored.spell || !stored.left)
      return [block('No stored spell use is available')];
    const { spell } = stored;
    if (
      input.healRoll !== undefined &&
      (!input.onSelf || storedHealing(ctx, spell, input.healRoll) === undefined)
    )
      return [block('Enter the dice total for healing yourself with the stored spell')];
    const checks = [...timeRangeChecks(ctx.live.clock.seconds, spell.duration.seconds ?? 0)];
    if (!input.otherHolder || input.healRoll !== undefined) checks.push(...deadCheck(ctx));
    if (!input.otherHolder) {
      checks.push(...economyChecks(ctx, 'action'));
      if (spell.duration.concentration && ctx.live.concentration)
        checks.push(warn('Using the stored spell ends your current concentration'));
    }
    return checks;
  },
  apply: ({ live }, input, ctx) => {
    const { item, spell, left } = storedSpellItem(ctx)!;
    live.storedSpellItem!.spent++;
    if (!input.otherHolder) spendEconomy(live, 'action');
    const notes = applySpellEffects(
      live,
      spell!,
      {
        level: spell!.level,
        onSelf: input.onSelf,
        otherHolder: input.otherHolder,
        healAmount: storedHealing(ctx, spell!, input.healRoll),
      },
      ctx,
    );
    if (input.otherHolder && spell!.duration.concentration)
      notes.push('holder tracks concentration');
    return withNotes(
      `${input.otherHolder ? 'Other holder used' : 'Used'} ${item!.def.name}: ${spell!.name} (${left - 1} left)`,
      notes,
    );
  },
};

export const markArcaneFirearm: Command<{ instanceId: string }> = {
  name: 'markArcaneFirearm',
  check: (ctx, { instanceId }) =>
    artificerItemOptions(ctx).firearmItems.some((item) => item.instanceId === instanceId)
      ? [...deadCheck(ctx), ...restWarning(ctx)]
      : [block('Choose a carried wand, staff or rod')],
  apply: ({ live }, { instanceId }, ctx) => {
    const item = artificerItemOptions(ctx).firearmItems.find(
      (row) => row.instanceId === instanceId,
    )!;
    live.arcaneFirearmId = instanceId;
    return `Marked ${item.def.name} as Arcane Firearm`;
  },
};
