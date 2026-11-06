import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { registry } from '../../data/registry';
import { endConcentration, removeEffect } from '../../engine/commands';
import { useCommand } from '../commands/command-context';
import { ConcentrationChip } from '../components/chips';
import { SectionLabel } from '../components/SectionLabel';
import { useCharacter } from '../hooks/useCharacter';
import { EffectEditor, type EffectEditorRequest } from './EffectEditor';
import { effectTimingText, remainingEffectTime } from './effects-model';

/** Concentration is the caster's state; this list contains only effects on this character. */
export function LiveEffects() {
  const { state } = useCharacter();
  const { run } = useCommand();
  const concentrationSection = useRef<HTMLElement>(null);
  const effectsSection = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<EffectEditorRequest>();
  const opener = useRef<HTMLElement | null>(null);
  const openEditor = (request: EffectEditorRequest, button: HTMLElement) => {
    opener.current = button;
    setEditor(request);
  };
  // The opener may vanish (an edit that ends the effect); fall back to the section.
  const editorReturn = () =>
    opener.current?.isConnected ? opener.current : effectsSection.current;
  const { live } = state;
  const restore = (section: HTMLElement | null) => () => {
    requestAnimationFrame(() => section?.focus());
  };

  return (
    <>
      <section
        ref={concentrationSection}
        tabIndex={-1}
        aria-label="Concentration"
        className="flex min-w-0 flex-col gap-2"
      >
        <SectionLabel>Concentration</SectionLabel>
        {live.concentration ? (
          <ConcentrationChip
            name={registry.get('spell', live.concentration.spellId).name}
            remaining={remainingEffectTime(live.concentration.endsAt, live, 'No timer')}
            onEnd={() =>
              run(
                endConcentration,
                null,
                concentrationSection.current ?? undefined,
                restore(concentrationSection.current),
              )
            }
            className="max-w-full self-start"
          />
        ) : (
          <p className="text-sm text-text-muted">None</p>
        )}
      </section>
      <section
        ref={effectsSection}
        tabIndex={-1}
        aria-label="Effects on you"
        className="flex min-w-0 flex-col gap-2"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <SectionLabel>Effects on you</SectionLabel>
          <button
            type="button"
            onClick={(event) => openEditor({ kind: 'add' }, event.currentTarget)}
            className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-sm text-accent"
          >
            <Plus size={16} aria-hidden />
            Add effect
          </button>
        </div>
        {live.effects.length === 0 ? (
          <p className="text-sm text-text-muted">None</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {live.effects.map((effect) => (
              <li
                key={effect.id}
                className="flex min-w-0 items-center gap-2 rounded-card border border-magic/60 bg-surface px-3 py-1"
              >
                <div className="min-w-0 flex-1 text-sm">
                  <p className="wrap-anywhere text-text">{effect.name}</p>
                  <p className="text-xs text-magic">
                    {effectTimingText(effect, live)}
                    {effect.concentration && ' · Your concentration'}
                  </p>
                  {effect.note && (
                    <p className="wrap-anywhere text-xs text-text-muted">{effect.note}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Edit effect: ${effect.name}`}
                  onClick={(event) =>
                    openEditor({ kind: 'edit', effectId: effect.id }, event.currentTarget)
                  }
                  className="min-h-11 min-w-11 shrink-0 rounded-btn px-2 text-sm text-accent"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`End effect: ${effect.name}`}
                  onClick={() =>
                    run(
                      removeEffect,
                      { effectId: effect.id },
                      effectsSection.current ?? undefined,
                      restore(effectsSection.current),
                    )
                  }
                  className="min-h-11 min-w-11 shrink-0 rounded-btn px-2 text-sm text-accent"
                >
                  End
                </button>
              </li>
            ))}
          </ul>
        )}
        {live.combat && (live.concentration || live.effects.length > 0) && (
          <p className="text-xs text-text-muted">
            Timers follow game time. Later Start Turn and End combat each advance 6 seconds.
          </p>
        )}
      </section>
      {editor && (
        <EffectEditor
          key={editor.kind === 'edit' ? editor.effectId : 'add'}
          request={editor}
          onClose={() => setEditor(undefined)}
          returnFocusTo={editorReturn}
        />
      )}
    </>
  );
}
