import { useState } from 'react';
import { Link } from 'react-router';
import { registry } from '../../data/registry';
import { characterRegistry } from '../../engine/registry';
import {
  artificerLevel,
  activeInfusions,
  INFUSION_PREFIX,
  INFUSIONS,
  infusionFits,
  infusionKey,
  infusionLimit,
  magicalItem,
} from '../../engine/calc/infusions';
import { infuseItem, endInfusion } from '../../engine/commands/infusions';
import type { DamageType } from '../../engine/rules2014';
import { useCharacter } from '../hooks/useCharacter';
import { useCommand } from '../commands/command-context';
import { inputClass } from '../components/fields';

const button = 'min-h-11 rounded-btn border border-border px-3 text-sm disabled:opacity-40';
export function InfusionPanel({
  onDone,
  onNavigate,
}: {
  onDone?: () => void;
  onNavigate?: () => void;
}) {
  const { state, characterId } = useCharacter();
  const { run } = useCommand();
  const [featureId, setFeature] = useState('');
  const [instanceId, setItem] = useState('');
  const [damageType, setDamageType] = useState<DamageType>('fire');
  const [attune, setAttune] = useState(false);
  const level = artificerLevel(state.build);
  if (level < 2) return null;
  const refs = characterRegistry(registry, state.build);
  const active = activeInfusions(state.build, state.live);
  const known = state.build.featureIds.filter((id) => id.startsWith(INFUSION_PREFIX));
  const key = infusionKey(featureId),
    rule = INFUSIONS[key];
  const items = state.build.items.filter((item) => {
    const def = refs.get('item', item.itemId);
    return (
      state.live.items[item.instanceId]?.qty === 1 &&
      !magicalItem(def) &&
      infusionFits(key, def) &&
      !state.live.infusions?.some((i) => i.instanceId === item.instanceId)
    );
  });
  return (
    <section
      id="artificer-infusions"
      aria-label="Infused items"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4 text-sm"
    >
      <h2 className="font-display text-base">
        Infused items · {active.length}/{infusionLimit(state.build)}
      </h2>
      {known.some((id) => !INFUSIONS[infusionKey(id)]) && (
        <p className="text-warn">
          This counter covers equipment assignments below. Count Replicate Magic Item and Homunculus
          Servant against your limit at the table.
        </p>
      )}
      {level >= 9 &&
        state.build.classes.some((c) => c.subclassId === 'subclass.artificer.armorer') && (
          <p className="text-warn">
            Armorer’s two extra armor-only infusions are not tracked here yet. Review armor
            components and those extra slots at the table.
          </p>
        )}
      <p>
        At the end of a long rest, choose a known infusion and one nonmagical inventory item.
        Existing infusions remain until they end; resting does not remove them.
      </p>
      <p className="text-text-muted">
        Equip infused gear to use it. Attune only when required. Attack, damage, AC, spell attack
        and speed bonuses are counted automatically; special effects, charges and outcomes stay
        manual.
      </p>
      {state.live.infusions?.map((entry, index) => {
        const item = state.build.items.find((i) => i.instanceId === entry.instanceId);
        return (
          <article
            key={`${entry.instanceId}:${index}`}
            className="flex min-w-0 flex-col gap-2 rounded-btn border border-border p-3"
          >
            <p className="wrap-anywhere">
              {refs.entries.get(entry.featureId)?.name ?? entry.featureId} ·{' '}
              {item ? refs.get('item', item.itemId).name : 'Item removed'}
              {entry.damageType ? ` · ${entry.damageType} resistance` : ''}
            </p>
            {(!item || state.live.items[entry.instanceId]?.qty !== 1) && (
              <p className="text-warn">
                Not carried as a single item. This infusion still uses a slot until it ends.
              </p>
            )}
            {!active.includes(entry) && (
              <p className="text-warn">
                Inactive: review the known infusion, item quantity and level requirement.
              </p>
            )}
            {INFUSIONS[infusionKey(entry.featureId)]?.attunement &&
              !state.live.items[entry.instanceId]?.attuned && (
                <p className="text-warn">Requires attunement; its benefits are not counted yet.</p>
              )}
            <p className="text-text-muted">{refs.entries.get(entry.featureId)?.summary?.effect}</p>
            <button
              type="button"
              className={button}
              onClick={() => run(endInfusion, { instanceId: entry.instanceId })}
            >
              Record infusion ended
            </button>
          </article>
        );
      })}
      <Link
        onClick={onNavigate}
        className="text-accent underline"
        to={`/characters/${encodeURIComponent(characterId)}/todo`}
      >
        Choose known infusions
      </Link>
      <label className="flex flex-col gap-1">
        Known infusion
        <select
          className={inputClass}
          value={featureId}
          onChange={(e) => {
            setFeature(e.target.value);
            setItem('');
            setAttune(false);
          }}
        >
          <option value="">Choose an infusion</option>
          {known.map((id) => (
            <option
              key={id}
              value={id}
              disabled={!!INFUSIONS[infusionKey(id)] && level < INFUSIONS[infusionKey(id)]!.level}
            >
              {refs.get('feature', id).name}
            </option>
          ))}
        </select>
      </label>
      {featureId && !rule && (
        <p>
          For Homunculus Servant, use Companions to create its stat block. For Replicate Magic Item,
          record the DM-approved item in Inventory; replication choices and their limits need table
          review.
        </p>
      )}
      {rule && (
        <>
          <label className="flex flex-col gap-1">
            Item to infuse
            <select
              className={inputClass}
              value={instanceId}
              onChange={(e) => setItem(e.target.value)}
            >
              <option value="">Choose an item</option>
              {items.map((i, index) => (
                <option key={i.instanceId} value={i.instanceId}>
                  {refs.get('item', i.itemId).name}
                  {i.notes ? ` · ${i.notes}` : ` · item ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          {items.length === 0 && (
            <p>
              No eligible single items. Add nonmagical gear in Inventory; split stacks into separate
              entries before infusing.
            </p>
          )}
          {key === 'resistant-armor' && (
            <label className="flex flex-col gap-1">
              Damage resistance
              <select
                className={inputClass}
                value={damageType}
                onChange={(e) => setDamageType(e.target.value as DamageType)}
              >
                {(
                  [
                    'acid',
                    'cold',
                    'fire',
                    'lightning',
                    'necrotic',
                    'poison',
                    'radiant',
                    'thunder',
                  ] as const
                ).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          )}
          {rule.attunement && (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={attune}
                onChange={(e) => setAttune(e.target.checked)}
              />
              Attune myself when infusing
            </label>
          )}
          <button
            type="button"
            className={`${button} text-accent`}
            disabled={!items.some((i) => i.instanceId === instanceId)}
            onClick={() =>
              run(infuseItem, {
                featureId,
                instanceId,
                attune,
                ...(key === 'resistant-armor' ? { damageType } : {}),
              })
            }
          >
            Infuse item
          </button>
        </>
      )}
      {onDone && (
        <button type="button" className={button} onClick={onDone}>
          Done with infusions
        </button>
      )}
    </section>
  );
}
