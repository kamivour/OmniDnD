import { useRef, useState, type ReactNode } from 'react';
import { Sheet } from '../components/Sheet';
import { RestContext } from './rest-context';
import { ShortRestForm } from './ShortRestForm';

/** HUD, tablet toolbar, and mobile More share one rest draft and return-focus owner. */
export function RestProvider({ children }: { children: ReactNode }) {
  const [shortRestOpen, setShortRestOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RestContext
      value={{
        openShortRest: (control) => {
          opener.current = control ?? (document.activeElement as HTMLElement | null);
          setShortRestOpen(true);
        },
      }}
    >
      {children}
      <Sheet
        open={shortRestOpen}
        onOpenChange={setShortRestOpen}
        title="Short Rest"
        description="One hour of game time. Review rolls and changes before applying."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = opener.current;
          if (
            target?.isConnected &&
            target.getClientRects().length &&
            !target.matches(':disabled')
          ) {
            target.focus();
          } else document.getElementById('character-workspace')?.focus();
        }}
      >
        {shortRestOpen && <ShortRestForm onClose={() => setShortRestOpen(false)} />}
      </Sheet>
    </RestContext>
  );
}
