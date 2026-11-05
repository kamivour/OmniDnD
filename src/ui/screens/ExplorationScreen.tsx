import { useRef, useState } from 'react';
import { registry } from '../../data/registry';
import { spellCastDetails } from '../../engine/commands';
import { SectionLabel } from '../components/SectionLabel';
import { Sheet } from '../components/Sheet';
import { PassiveList, SkillList } from '../components/SkillChecks';
import { SpellRow } from '../components/SpellRow';
import { LiveEffects } from '../effects/LiveEffects';
import { explorationModel } from '../exploration/exploration-model';
import { useCharacter } from '../hooks/useCharacter';
import { useDetail } from '../layout/detail-context';
import { LiveSpellDetail } from '../spells/LiveSpellDetail';
import { SpellCastControls } from '../spells/SpellCastControls';
import { GameClockControl } from '../time/GameClockControl';

const card = 'flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-3';

/** Exploration shares the character's clock, casting rules, effects and calculated checks. */
export function ExplorationScreen() {
  const { state, sheet } = useCharacter();
  const { pin } = useDetail();
  const model = explorationModel(state, sheet, registry);
  const context = { ...state, sheet, registry };
  const [casting, setCasting] = useState<{
    spellId: string;
    classId: string;
    opener?: HTMLElement;
  } | null>(null);
  const castOpener = useRef<HTMLElement | null>(null);
  const unsupported = model.unsupportedClassIds.filter((classId) =>
    model.entries.some((entry) => entry.classId === classId),
  );

  return (
    <div className="mx-auto flex max-w-screen-2xl min-w-0 flex-col gap-4 px-4 py-4 lg:px-6">
      <h1 className="font-display text-xl text-text">Explore</h1>
      <GameClockControl />
      <div className="grid min-w-0 items-start gap-4 @min-[960px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Utility spells and rituals" className="flex min-w-0 flex-col gap-3">
          <SectionLabel>Utility spells and rituals</SectionLabel>
          <p className="text-sm text-text-muted">
            Casting follows your class, preparation and current resources. A ritual label alone does
            not grant ritual casting.
          </p>
          {state.live.combat && (
            <p role="note" className="text-sm text-warn">
              Combat is active. Casting still uses this turn's actions; rituals are unavailable.
            </p>
          )}
          {unsupported.length > 0 && (
            <p role="note" className="text-sm text-warn">
              Selected spells for{' '}
              {unsupported.map((id) => registry.get('class', id).name).join(', ')} have no class
              spellcasting stats. Their DC and attack calculations are unavailable.
            </p>
          )}
          {model.entries.length === 0 && (
            <p className="rounded-card border border-border bg-surface p-3 text-sm text-text-muted">
              No utility spells or rituals selected.
              {model.classes.length > 0 && ' Select spells on the Spells screen to add them here.'}
            </p>
          )}
          {model.levels.map((level) => {
            const entries = model.entries.filter(({ spell }) => spell.level === level);
            if (entries.length === 0) return null;
            return (
              <section
                key={level}
                aria-label={level === 0 ? 'Cantrips' : `Level ${level}`}
                className="flex min-w-0 flex-col gap-2"
              >
                <SectionLabel as="h3">{level === 0 ? 'Cantrips' : `Level ${level}`}</SectionLabel>
                <ul className="flex min-w-0 flex-col gap-2">
                  {entries.map(({ spell, classId, dc, attack }) => (
                    <SpellRow
                      key={`${classId}:${spell.id}`}
                      spell={spell}
                      dc={dc}
                      attack={attack}
                      castingClass={
                        model.classes.length + model.unsupportedClassIds.length > 1
                          ? registry.get('class', classId).name
                          : undefined
                      }
                      slots={model.slots}
                      concentrating={spell.id === state.live.concentration?.spellId}
                      unavailable={
                        spell.level > 0 &&
                        !model.slots.some(
                          (slot) => slot.level >= spell.level && slot.used < slot.max,
                        ) &&
                        (state.live.combat !== undefined ||
                          !spellCastDetails(context, { spellId: spell.id, classId }).ritualEligible)
                      }
                      onCast={(selected, _level, opener) => {
                        castOpener.current = opener ?? (document.activeElement as HTMLElement);
                        setCasting({ spellId: selected.id, classId, opener: castOpener.current });
                      }}
                      sheetFooter={({ close, trigger }) => (
                        <SpellCastControls
                          spellId={spell.id}
                          classId={classId}
                          returnFocusTo={trigger}
                          onApplied={close}
                        />
                      )}
                      onPin={() => pin(<LiveSpellDetail spellId={spell.id} classId={classId} />)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </section>
        <div className={card}>
          <LiveEffects />
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-4 @min-[800px]:grid-cols-2">
        <section aria-label="Skills" className={card}>
          <SectionLabel>Skills</SectionLabel>
          <SkillList sheet={sheet} />
        </section>
        <section aria-label="Passives" className={card}>
          <SectionLabel>Passives</SectionLabel>
          <PassiveList sheet={sheet} />
        </section>
      </div>
      <Sheet
        open={casting !== null}
        onOpenChange={(open) => !open && setCasting(null)}
        title={casting ? `Cast ${registry.get('spell', casting.spellId).name}` : 'Cast spell'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (castOpener.current?.isConnected && castOpener.current.getClientRects().length
            ? castOpener.current
            : document.getElementById('character-workspace')
          )?.focus();
        }}
      >
        {casting && (
          <LiveSpellDetail
            key={`${casting.classId}:${casting.spellId}`}
            spellId={casting.spellId}
            classId={casting.classId}
            returnFocusTo={casting.opener}
            onApplied={() => setCasting(null)}
          />
        )}
      </Sheet>
    </div>
  );
}
