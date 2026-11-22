import { useState } from 'react';
import { registry } from '../../data/registry';
import { infusionsKnownAt, isReplicateInfusion } from '../../engine/calc/infusions';
import { inputClass } from '../components/fields';
import { groupInfusionOptions } from './infusion-options';

const infusionOptions = (ids: string[]) =>
  ids
    .map((id) => ({ id, name: registry.entries.get(id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

export function InfusionPicker({
  level,
  count,
  known,
  options,
  chosen,
  onChange,
}: {
  level: number;
  count: number;
  known: string[];
  options: string[];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const saved = new Set(known);
  const groups = groupInfusionOptions(
    infusionOptions([...new Set([...options, ...known])]).filter(
      ({ id, name }) => chosen.includes(id) || name.toLowerCase().includes(search),
    ),
  );

  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <p className="text-text-muted">
        Artificer {level} · {known.length}/{infusionsKnownAt(level)} infusions known · {count} open.
        Each standard infusion or Replicate Magic Item recipe takes one slot.
      </p>
      <label className="flex flex-col gap-1">
        Search infusions
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={inputClass}
        />
      </label>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-text">
          {count > 0 ? `Pick up to ${count} (${chosen.length} chosen)` : 'Known infusions'}
        </legend>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <div
              key={group.label}
              role="group"
              aria-label={group.label}
              className="min-w-0 rounded-btn border border-border px-3 py-2"
            >
              <p className="font-semibold text-text">{group.label}</p>
              <div className="max-h-44 overflow-y-auto sm:max-h-72">
                {group.options.map(({ id, name }) => {
                  const learned = saved.has(id);
                  const selected = chosen.includes(id);
                  return (
                    <label key={id} className="flex min-h-11 items-center gap-2 text-text">
                      <input
                        type="checkbox"
                        aria-label={name}
                        checked={learned || selected}
                        disabled={learned || (!selected && chosen.length >= count)}
                        onChange={() =>
                          onChange(
                            selected ? chosen.filter((pick) => pick !== id) : [...chosen, id],
                          )
                        }
                        className="size-4 shrink-0 accent-(--omni-accent)"
                      />
                      <span className="min-w-0">
                        {name}
                        {learned && (
                          <span className="block text-xs text-text-muted">Already known</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="text-text-muted">No infusions match your search.</p>
          )}
        </div>
      </fieldset>
    </div>
  );
}

export function InfusionReplacement({
  known,
  options,
  swap,
  active,
  onChange,
}: {
  known: string[];
  options: string[];
  swap: { remove: string; add: string };
  active: boolean;
  onChange: (swap: { remove: string; add: string }) => void;
}) {
  const groups = (ids: string[]) =>
    groupInfusionOptions(infusionOptions(ids)).map((group) => (
      <optgroup key={group.label} label={group.label}>
        {group.options.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </optgroup>
    ));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2 text-sm">
      <legend className="mb-1 font-semibold text-text">Replace one known infusion</legend>
      <label className="flex flex-col gap-1">
        Infusion to replace
        <select
          value={swap.remove}
          onChange={(event) => onChange({ remove: event.target.value, add: '' })}
          className={inputClass}
        >
          <option value="">Keep current infusions</option>
          {groups(known)}
        </select>
      </label>
      {swap.remove && (
        <>
          <label className="flex flex-col gap-1">
            Replacement infusion
            <select
              value={swap.add}
              onChange={(event) => onChange({ ...swap, add: event.target.value })}
              className={inputClass}
            >
              <option value="">Choose a replacement</option>
              {groups(options)}
            </select>
          </label>
          {active && <p className="text-warn">Replacing this infusion ends it on its item.</p>}
          {isReplicateInfusion(swap.remove) && (
            <p className="text-text-muted">Record any replicated item ending in Inventory.</p>
          )}
          {swap.remove === 'feature.artificer.infusion-homunculus-servant' && (
            <p className="text-text-muted">Record the Homunculus Servant ending in Companions.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
