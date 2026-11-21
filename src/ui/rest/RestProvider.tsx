import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sheet } from '../components/Sheet';
import { SpellManage } from '../spells/SpellManage';
import { RestContext } from './rest-context';
import { ShortRestForm } from './ShortRestForm';
import { LongRestForm } from './LongRestForm';
import { InfusionPanel } from '../features/InfusionPanel';
import { useCharacter } from '../hooks/useCharacter';
import { restDurations } from '../../engine/calc/rests';
import { formatDuration } from '../../engine/clock';

/** HUD, tablet toolbar, and mobile More share one rest draft and return-focus owner. */
export function RestProvider({ children }: { children: ReactNode }) {
  const { state } = useCharacter();
  const durations = restDurations(state.campaign);
  const [kind, setKind] = useState<'short' | 'long' | 'manage' | 'infusions' | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [preparedClass, setPreparedClass] = useState<string | undefined>(undefined);
  const manageContainer = useRef<HTMLDivElement>(null);
  const open = (next: 'short' | 'long', control?: HTMLElement) => {
    setOpener(control ?? (document.activeElement as HTMLElement | null));
    setKind(next);
  };
  useEffect(() => {
    if (kind === 'manage') manageContainer.current?.focus();
  }, [kind]);
  return (
    <RestContext
      value={{
        openShortRest: (control) => open('short', control),
        openLongRest: (control) => open('long', control),
      }}
    >
      {children}
      <Sheet
        open={kind !== null}
        onOpenChange={(next) => !next && setKind(null)}
        className={kind === 'manage' ? 'lg:flex lg:max-h-[90dvh] lg:w-4xl lg:flex-col' : undefined}
        title={
          kind === 'infusions'
            ? 'Review infusions'
            : kind === 'manage'
              ? 'Manage spells'
              : kind === 'long'
                ? 'Long Rest'
                : 'Short Rest'
        }
        description={
          kind === 'infusions'
            ? 'Assign infusions after resting. Each change is logged and undoable.'
            : kind === 'manage'
              ? 'Review prepared spells after resting. Changes are separate logged commands.'
              : `${
                  durations.variant === 'standard'
                    ? kind === 'long'
                      ? 'Eight hours'
                      : 'One hour'
                    : formatDuration(kind === 'long' ? durations.long : durations.short)
                } of game time. Review changes before applying.`
        }
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = opener;
          if (
            target?.isConnected &&
            target.getClientRects().length &&
            !target.matches(':disabled')
          ) {
            target.focus();
          } else document.getElementById('character-workspace')?.focus();
        }}
      >
        {kind === 'short' && <ShortRestForm onClose={() => setKind(null)} />}
        {kind === 'long' && (
          <LongRestForm
            onClose={() => setKind(null)}
            returnFocusTo={() => manageContainer.current ?? opener}
            onApplied={(classId, infusions) => {
              setPreparedClass(classId);
              if (infusions) setKind('infusions');
              else if (classId) {
                setKind('manage');
              } else setKind(null);
            }}
          />
        )}
        {kind === 'manage' && (
          <div ref={manageContainer} tabIndex={-1} className="lg:flex lg:min-h-0 lg:flex-col">
            <SpellManage initialClassId={preparedClass} desktopWide onClose={() => setKind(null)} />
          </div>
        )}
        {kind === 'infusions' && (
          <InfusionPanel
            onDone={() => setKind(preparedClass ? 'manage' : null)}
            onNavigate={() => setKind(null)}
          />
        )}
      </Sheet>
    </RestContext>
  );
}
