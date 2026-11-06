import { QUICK_TABLES } from '../../data/quick-rules';

/** Collapsible rules reminders. Closed by default so the page stays short on a phone. */
export function QuickTables() {
  return (
    <section aria-labelledby="reference-tables" className="flex min-w-0 flex-col gap-3">
      <h2 id="reference-tables" className="text-base font-semibold">
        Quick tables
      </h2>
      <div className="flex flex-col gap-2">
        {QUICK_TABLES.map((table) => (
          <details key={table.id} className="rounded-card bg-surface">
            <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-text">
              {table.title}
            </summary>
            <div className="px-3 pb-3">
              {table.note && <p className="mb-2 text-xs text-text-muted">{table.note}</p>}
              <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
                {table.rows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="font-semibold text-text">{row.label}</dt>
                    <dd className="text-text-muted">{row.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
