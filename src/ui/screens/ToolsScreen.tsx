import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { TOOLS } from '../../data/tools';
import { NO_TOOL_FILTER, filterTools, groupTools, type ToolFilter } from '../../engine/calc/tools';
import { TOOL_PLATFORMS, type ToolPlatform } from '../../engine/schema';
import { Field, inputClass } from '../components/fields';
import { cx } from '../cx';

const PLATFORM_LABELS: Record<ToolPlatform, string> = {
  web: 'Web',
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
  ios: 'iPhone / iPad',
  android: 'Android',
};
const COST_LABELS = { free: 'Free', freemium: 'Free + paid', paid: 'Paid' } as const;
const check = 'flex min-h-11 items-center gap-2 text-sm';

/** Outside tools by goal. Links open in a new tab; the list itself works offline. */
export function ToolsScreen() {
  const { characterId } = useParams();
  const base = characterId ? `/characters/${encodeURIComponent(characterId)}` : '';
  const [filter, setFilter] = useState<ToolFilter>(NO_TOOL_FILTER);
  const shown = useMemo(() => filterTools(TOOLS, filter), [filter]);
  const groups = useMemo(() => groupTools(shown), [shown]);
  return (
    <section
      className={cx(
        'mx-auto flex min-w-0 max-w-5xl flex-col gap-5',
        characterId && 'px-4 py-4 lg:px-6',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl">Tools</h1>
        <Link to={`${base}/reference`} className="inline-flex min-h-11 items-center text-accent">
          Back to Reference
        </Link>
      </header>
      <p className="text-sm text-text-muted">
        Outside sites for maps, tokens, minis, audio and more. Links open in a new tab and need an
        internet connection. Prices and features change, so check the site.
      </p>
      <form
        role="search"
        aria-label="Filter tools"
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field label="Search tools" htmlFor="tools-search">
          <input
            id="tools-search"
            type="search"
            value={filter.query}
            onChange={(event) => setFilter({ ...filter, query: event.target.value })}
            placeholder="map, token, 3D print…"
            className={inputClass}
          />
        </Field>
        <Field label="Platform" htmlFor="tools-platform">
          <select
            id="tools-platform"
            value={filter.platform}
            onChange={(event) =>
              setFilter({ ...filter, platform: event.target.value as ToolFilter['platform'] })
            }
            className={inputClass}
          >
            <option value="any">Any</option>
            {TOOL_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </Field>
        <label className={check}>
          <input
            type="checkbox"
            checked={filter.freeOnly}
            onChange={(event) => setFilter({ ...filter, freeOnly: event.target.checked })}
          />
          Free only
        </label>
        <label className={check}>
          <input
            type="checkbox"
            checked={filter.hideAi}
            onChange={(event) => setFilter({ ...filter, hideAi: event.target.checked })}
          />
          Hide AI tools
        </label>
      </form>
      <p role="status" className="text-xs text-text-muted">
        {shown.length} {shown.length === 1 ? 'tool' : 'tools'}
      </p>
      {groups.length === 0 && <p className="text-sm text-text-muted">Nothing matches.</p>}
      {groups.map((group) => (
        <section
          key={group.objective}
          aria-labelledby={`tools-${group.objective}`}
          className="flex flex-col gap-3"
        >
          <h2 id={`tools-${group.objective}`} className="text-base font-semibold">
            {group.label}
          </h2>
          {group.objective === 'other-systems' && (
            <p className="text-xs text-text-muted">
              Not supported by this app. OmniDnD only handles D&amp;D 5e (2014).
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tools.map((tool) => (
              <a
                key={tool.id}
                href={tool.url}
                target="_blank"
                rel="noreferrer"
                aria-label={tool.name}
                className="flex min-w-0 gap-3 rounded-card border border-border bg-surface p-4 hover:border-accent"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold">{tool.name}</h3>
                  <p className="mt-1 text-sm text-text-muted">{tool.summary}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {COST_LABELS[tool.cost]} ·{' '}
                    {tool.platforms.map((p) => PLATFORM_LABELS[p]).join(', ')}
                    {tool.ai && ' · AI'}
                  </p>
                </div>
                <ExternalLink size={18} aria-hidden className="shrink-0 text-accent" />
              </a>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
