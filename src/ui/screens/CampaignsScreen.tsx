import { Link } from 'react-router';
import { Plus, Settings2, Upload } from 'lucide-react';
import { HpBar } from '../components/HpBar';
import { Icon } from '../components/Icon';
import { SectionLabel } from '../components/SectionLabel';
import { rulesSummary } from '../campaignOptions';
import { campaigns, type CampaignView } from '../fixtures/campaigns';
import { useFixtureAction } from '../fixtures/useFixtureAction';

const button =
  'hover-lift inline-flex min-h-11 items-center gap-2 rounded-btn border border-border bg-surface px-3 text-sm text-text';

/** Landing screen: every campaign with its rules and characters (SPEC §5 Campaigns). */
export function CampaignsScreen() {
  const act = useFixtureAction();
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-xl text-text">Campaigns</h1>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => act('Import JSON')} className={button}>
            <Upload size={16} aria-hidden /> Import
          </button>
          <Link to="/campaigns/new" className={button}>
            <Plus size={16} aria-hidden /> New campaign
          </Link>
        </div>
      </div>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </section>
  );
}

function CampaignCard({ campaign: c }: { campaign: CampaignView }) {
  const headingId = `campaign-${c.id}`;
  return (
    <article aria-labelledby={headingId} className="rounded-card border border-border bg-surface">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border p-4">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-lg text-text">
            {c.name}
          </h2>
          <p className="text-xs text-text-muted">{rulesSummary(c)}</p>
        </div>
        <Link
          to={`/campaigns/${c.id}/settings`}
          className="inline-flex min-h-11 items-center gap-2 rounded-btn px-2 text-sm text-accent"
        >
          <Settings2 size={16} aria-hidden /> Campaign settings
        </Link>
      </header>
      <div className="flex flex-col gap-2 p-4">
        <SectionLabel as="h3">Characters</SectionLabel>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {c.characters.map((ch) => (
            <li key={ch.id}>
              <Link
                to={`/characters/${ch.id}`}
                className="hover-lift flex items-center gap-3 rounded-card border border-border bg-surface-2 p-3"
              >
                <Icon id={ch.iconId} size={40} className="text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base text-text">{ch.name}</span>
                  <span className="block truncate text-xs text-text-muted">{ch.line}</span>
                  <span className="mt-1.5 flex items-center gap-2 text-xs">
                    <span className="text-text-muted">HP</span>
                    <span className="text-text">
                      {ch.hp.current}/{ch.hp.max}
                    </span>
                    <HpBar current={ch.hp.current} max={ch.hp.max} className="w-16" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to={`/campaigns/${c.id}/characters/new`}
              className="flex h-full min-h-16 items-center justify-center gap-2 rounded-card border border-dashed border-border p-3 text-text-muted hover:border-accent hover:text-text"
            >
              <Plus size={16} aria-hidden /> New character
            </Link>
          </li>
        </ul>
      </div>
    </article>
  );
}
