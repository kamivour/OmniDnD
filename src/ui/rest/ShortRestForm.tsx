import { useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { completeShortRest, type ShortRestPayload } from '../../engine/commands';
import type { HitDieName } from '../../engine/schema';
import { useCommand } from '../commands/command-context';
import { SectionLabel } from '../components/SectionLabel';
import { signed } from '../format';
import { useCharacter } from '../hooks/useCharacter';
import { previewShortRest, restChanges } from './rest-model';
import { RestPreview } from './RestPreview';

const field = 'min-h-11 w-full rounded-btn border border-border bg-surface px-3 text-text';

/** Rolls stay local until the player accepts the complete engine preview. */
export function ShortRestForm({ onClose }: { onClose: () => void }) {
  const { state, sheet } = useCharacter();
  const { run } = useCommand();
  const [rows, setRows] = useState<{ id: number; die: HitDieName; roll: string }[]>([]);
  const [selectedDie, setSelectedDie] = useState<HitDieName | ''>(sheet.hitDice[0]?.die ?? '');
  const ownSong = sheet.features.find(({ def }) => def.id === 'feature.bard.song-of-rest')?.die;
  const [songEnabled, setSongEnabled] = useState(false);
  const [songSource, setSongSource] = useState<'self' | 'other'>(ownSong ? 'self' : 'other');
  const [songRoll, setSongRoll] = useState('');
  const nextId = useRef(1);
  const focusRoll = useRef<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const dieSelect = useRef<HTMLSelectElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const pools = sheet.hitDice.map((pool) => ({
    ...pool,
    remaining: Math.max(
      0,
      pool.max -
        (state.live.hitDiceSpent[pool.die] ?? 0) -
        rows.filter(({ die }) => die === pool.die).length,
    ),
  }));
  const selected = pools.find(({ die }) => die === selectedDie) ?? pools[0];
  const dice: NonNullable<ShortRestPayload['hitDice']> = rows.map(({ die, roll }) => ({
    die,
    roll: roll.trim() === '' ? NaN : Number(roll),
  }));
  const base: ShortRestPayload = { hitDice: dice };
  const payload: ShortRestPayload = songEnabled
    ? {
        ...base,
        songOfRest: songRoll.trim() === '' ? NaN : Number(songRoll),
        songOfRestSource: songSource,
      }
    : base;
  const preview = previewShortRest(state, registry, payload);
  const songProbe = previewShortRest(state, registry, {
    ...base,
    songOfRest: 1,
    songOfRestSource: songSource,
  });
  const songEligible = songProbe.result === 'ok';
  const maxSong = songSource === 'self' && ownSong ? Number(ownSong.slice(1)) : 12;
  const changes = preview.result === 'ok' ? restChanges(state, preview.next, registry) : [];

  return (
    <div ref={container} tabIndex={-1} className="flex min-w-0 flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="Hit Dice rolls">
        <SectionLabel>Hit Dice</SectionLabel>
        <p className="text-sm text-text-muted">
          Enter each die result. CON {signed(sheet.abilities.CON.mod)} is added automatically.
          Review healing before deciding to spend another die.
        </p>
        {pools.map((pool) => (
          <p key={pool.die} className="text-sm text-text">
            {pool.die}: {pool.remaining} / {pool.max} left
          </p>
        ))}
        {pools.length === 0 && <p className="text-sm text-text-muted">No Hit Dice pool.</p>}
        {preview.result === 'ok' && (
          <p aria-label="Projected HP" className="text-sm text-text">
            Projected HP: {changes[0]!.before} → <strong>{changes[0]!.after}</strong>
          </p>
        )}
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-sm text-text">
              {row.die} roll {index + 1}
              <input
                ref={(node) => {
                  if (node && focusRoll.current === row.id) {
                    focusRoll.current = null;
                    node.focus();
                  }
                }}
                type="number"
                inputMode="numeric"
                min={1}
                max={Number(row.die.slice(1))}
                step={1}
                value={row.roll}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.id === row.id ? { ...item, roll: event.target.value } : item,
                    ),
                  )
                }
                className={`${field} mt-1`}
              />
            </label>
            <button
              type="button"
              aria-label={`Remove ${row.die} roll ${index + 1}`}
              onClick={() => {
                setRows((current) => current.filter(({ id }) => id !== row.id));
                requestAnimationFrame(() => {
                  const target = addButton.current?.disabled
                    ? dieSelect.current
                    : addButton.current;
                  (target ?? container.current)?.focus();
                });
              }}
              className="min-h-11 min-w-11 rounded-btn border border-border px-3 text-sm text-text-muted"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-end gap-2">
          {selected && (
            <label className="min-w-0 flex-1 text-sm text-text">
              Hit Die
              <select
                ref={dieSelect}
                value={selected.die}
                onChange={(event) => setSelectedDie(event.target.value as HitDieName)}
                className={`${field} mt-1`}
              >
                {pools.map((pool) => (
                  <option key={pool.die} value={pool.die}>
                    {pool.die} — {pool.remaining} left
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            ref={addButton}
            type="button"
            disabled={!selected || selected.remaining === 0}
            onClick={() => {
              if (!selected) return;
              const id = nextId.current++;
              focusRoll.current = id;
              setRows((current) => [...current, { id, die: selected.die, roll: '' }]);
            }}
            className="min-h-11 rounded-btn border border-border px-3 text-sm text-accent disabled:opacity-40"
          >
            Add Hit Die
          </button>
        </div>
        {pools.length > 0 && pools.every(({ remaining }) => remaining === 0) && (
          <p className="text-xs text-text-muted">
            No Hit Dice left to add. You can still rest without spending dice.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Song of Rest">
        <label className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={songEnabled}
            disabled={!songEnabled && !songEligible}
            onChange={(event) => setSongEnabled(event.target.checked)}
            className="size-4 accent-(--omni-accent)"
          />
          Add Song of Rest
        </label>
        <p className="text-xs text-text-muted">
          Add it once when spent Hit Dice restore HP and a bard's performance applies.
        </p>
        {songEnabled && (
          <>
            <label className="text-sm text-text">
              Song of Rest source
              <select
                value={songSource}
                onChange={(event) => setSongSource(event.target.value as 'self' | 'other')}
                className={`${field} mt-1`}
              >
                {ownSong && <option value="self">Your Song of Rest ({ownSong})</option>}
                <option value="other">Another bard</option>
              </select>
            </label>
            <label className="text-sm text-text">
              Song of Rest roll
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={maxSong}
                step={1}
                value={songRoll}
                onChange={(event) => setSongRoll(event.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <p className="text-xs text-text-muted">
              {songSource === 'self'
                ? `Roll your ${ownSong ?? 'Song of Rest die'} at the table.`
                : 'Use the other bard’s die result (d6 to d12). Eligibility and performance stay decisions at the table.'}
            </p>
          </>
        )}
      </section>

      <RestPreview duration="1 h" result={preview} changes={changes} />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-btn border border-border text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={preview.result !== 'ok'}
          onClick={(event) => {
            event.currentTarget.focus();
            run(completeShortRest, payload, container.current ?? undefined, onClose);
          }}
          className="min-h-14 rounded-btn bg-accent px-2 font-semibold text-bg disabled:opacity-40"
        >
          Apply Short Rest
        </button>
      </div>
    </div>
  );
}
