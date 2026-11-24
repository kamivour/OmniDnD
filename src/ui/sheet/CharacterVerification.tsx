import { useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { registry } from '../../data/registry';
import {
  REVIEW_GROUPS,
  verifyCharacter,
  type ReviewFinding,
} from '../../engine/calc/character-review';
import type { CharacterState, Sheet as CalculatedSheet } from '../../engine/calc/sheet';
import { Sheet } from '../components/Sheet';

const statusLabels: Record<ReviewFinding['status'], string> = {
  missing: 'Missing',
  excess: 'Above limit',
  review: 'Review',
};

const routeLabels: Record<ReviewFinding['route'], string> = {
  sheet: 'Sheet',
  todo: 'To do',
  spells: 'Spells',
  features: 'Features',
  combat: 'Combat',
  inventory: 'Inventory',
  companions: 'Companions',
};

export function CharacterVerification({
  state,
  sheet,
}: {
  state: CharacterState;
  sheet: CalculatedSheet;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const findings = open ? verifyCharacter(state, registry, sheet) : [];
  const base = `/characters/${encodeURIComponent(state.build.id)}`;

  return (
    <>
      <button
        ref={trigger}
        id="verify-character"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-btn border border-border px-3 text-sm text-accent"
      >
        <ShieldCheck size={16} aria-hidden /> Verify character
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Verify character"
        description={`${state.build.name} · 2014 rules · ${state.campaign.name}`}
        className="sm:w-[min(42rem,calc(100vw-2rem))]!"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-sm text-text" role="status">
            {findings.length
              ? `${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} to review.`
              : 'No discrepancies found in the checks below.'}
          </p>
          <p className="text-xs text-text-muted">
            This check reads your current save. Confirm house rules, DM grants and past choices with
            your table.
          </p>
          {REVIEW_GROUPS.map(([group]) => {
            const rows = findings.filter((finding) => finding.group === group);
            return (
              <section
                key={group}
                aria-label={group}
                className="min-w-0 rounded-card border border-border bg-surface p-3"
              >
                <h3 className="text-sm font-semibold text-text">{group}</h3>
                {rows.length === 0 ? (
                  <p className="mt-1 text-xs text-text-muted">No findings</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {rows.map(({ id, status, title, detail, route }) => (
                      <li key={id} className="min-w-0 space-y-1 py-2 wrap-anywhere">
                        <p className="text-xs font-semibold text-warn">{statusLabels[status]}</p>
                        <p className="text-sm font-semibold text-text">{title}</p>
                        <p className="text-sm text-text-muted">{detail}</p>
                        <Link
                          to={`${base}/${route}`}
                          onClick={() => setOpen(false)}
                          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline"
                        >
                          Open {routeLabels[route]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
