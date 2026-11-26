import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Lock } from 'lucide-react';
import { registry } from '../../data/registry';
import {
  bookParts,
  ALWAYS_ON_SOURCES,
  normalizeSourceParts,
  optionalRules,
  sourceConflicts,
  SOURCE_PARTS,
  SOURCE_PART_NAMES,
  type OptionalRules,
} from '../../engine/calc/campaign-rules';
import { createCampaign } from '../../engine/commands/management';
import { campaignMethodConflicts, updateCampaign } from '../../engine/commands/campaigns';
import { SCHEMA_VERSION, type Campaign, type Source, type SourcePart } from '../../engine/schema';
import { characterStore } from '../../state/character-store';
import { useCampaign } from '../hooks/useCampaign';
import { useManagement } from '../commands/useManagement';
import { ChoiceGroup, Field, inputClass } from '../components/fields';
import { CampaignRoleDialog } from '../roles/RoleDialogs';
import { useAskRoles } from '../roles/useAskRoles';
import { cx } from '../cx';
import { syncConfig } from '../../sync/config';
import { PartySection } from '../party/PartySection';
import {
  ABILITY_OPTIONS,
  ENCUMBRANCE_OPTIONS,
  HP_FLOOR_OPTIONS,
  HP_OPTIONS,
  CAMPAIGN_ROLE_OPTIONS,
  LEVELING_OPTIONS,
  REST_OPTIONS,
  RULE_FLAG_OPTIONS,
  PARTED_SOURCES,
  SOURCE_OPTIONS,
} from '../campaignOptions';
import { PlaceholderScreen } from './PlaceholderScreen';

/** Phase 1 rules are saved through management commands; old character choices are retained. */
export function CampaignSetupScreen() {
  const { campaignId } = useParams();
  const saved = useCampaign();
  if (campaignId && !saved) return <PlaceholderScreen title="Campaign not found" />;
  return <CampaignForm key={saved?.id ?? 'new'} existing={saved} />;
}

function CampaignForm({ existing }: { existing?: Campaign }) {
  const navigate = useNavigate();
  const { run, confirmation, pending } = useManagement();
  const records = useStore(characterStore, (state) => state.characters);
  const [base] = useState<Campaign>(
    () =>
      existing ?? {
        id: crypto.randomUUID(),
        schemaVersion: SCHEMA_VERSION,
        name: '',
        ruleset: '5e-2014',
        leveling: 'xp',
        hpMethod: 'average',
        hpLevelFloor: 'none',
        abilityMethod: 'standard-array',
        sources: ['PHB'],
        optionalRules: {},
      },
  );
  const askRoles = useAskRoles();
  const [role, setRole] = useState<NonNullable<Campaign['role']>>(base.role ?? 'player');
  const [roleAsked, setRoleAsked] = useState(false);
  const [name, setName] = useState(base.name);
  const [leveling, setLeveling] = useState(base.leveling);
  const [hpMethod, setHpMethod] = useState(base.hpMethod);
  const [hpLevelFloor, setHpLevelFloor] = useState(base.hpLevelFloor);
  const [abilityMethod, setAbilityMethod] = useState(base.abilityMethod);
  const [sources, setSources] = useState<Source[]>(base.sources);
  const [rules, setRules] = useState<OptionalRules>(() => optionalRules(base));
  const [parts, setParts] = useState<NonNullable<Campaign['sourceParts']>>(
    () => base.sourceParts ?? {},
  );
  // Books and parts are add-only (D202): whatever the saved campaign uses stays locked on.
  const lockedBook = (source: Source) =>
    ALWAYS_ON_SOURCES.includes(source) || (existing?.sources.includes(source) ?? false);
  const lockedPart = (source: Source, part: SourcePart) =>
    existing ? bookParts(existing, source).includes(part) : false;
  const toggleSource = (source: Source, on: boolean) => {
    setSources(
      SOURCE_OPTIONS.map(({ value }) => value).filter((value) =>
        value === source ? on : sources.includes(value),
      ),
    );
    // A book turned on starts with every part.
    setParts((all) => ({ ...all, [source]: undefined }));
  };
  const togglePart = (source: Source, part: SourcePart, on: boolean) => {
    const current = bookParts({ sources, sourceParts: parts }, source);
    const next = SOURCE_PARTS.filter((value) => (value === part ? on : current.includes(value)));
    if (next.length === 0) toggleSource(source, false);
    else setParts({ ...parts, [source]: next });
  };
  const sourceParts = normalizeSourceParts({ sources, sourceParts: parts });
  const changes = {
    name: name.trim(),
    leveling,
    hpMethod,
    hpLevelFloor,
    abilityMethod,
    sources,
    ...(sourceParts ? { sourceParts } : {}),
    ...(existing && role === (existing.role ?? 'player') ? {} : { role }),
    // Store only rules the player changed so an untouched save leaves the campaign as it was.
    optionalRules: {
      ...base.optionalRules,
      ...Object.fromEntries(
        Object.entries(rules).filter(
          ([key, value]) => value !== optionalRules(base)[key as keyof OptionalRules],
        ),
      ),
    },
  };
  const proposal: Campaign = { ...base, ...changes };
  if (!sourceParts) delete proposal.sourceParts;
  const characters = Object.values(records).filter((record) => record.build.campaignId === base.id);
  const conflicts = characters.flatMap((record) => {
    const notes = [
      ...campaignMethodConflicts(proposal, record.build),
      ...sourceConflicts(proposal, record.build, registry).map(
        (choice) => `Keeps ${choice}, which the campaign no longer allows.`,
      ),
    ];
    return notes.length > 0 ? [{ name: record.build.name, id: record.build.id, notes }] : [];
  });

  return (
    <>
      <CampaignRoleDialog
        open={!existing && askRoles && !roleAsked}
        onChoose={(chosen) => {
          setRole(chosen);
          setRoleAsked(true);
        }}
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          const done = () => navigate('/');
          if (existing) run(updateCampaign, { campaignId: base.id, changes }, done);
          else run(createCampaign, { campaign: proposal }, done);
        }}
        className="mx-auto flex max-w-3xl flex-col gap-6"
      >
        <header>
          <h1 className="font-display text-xl">
            {existing ? 'Campaign settings' : 'New campaign'}
          </h1>
          {existing && (
            <p className="text-xs text-text-muted">
              {existing.name} · {characters.length} character{characters.length === 1 ? '' : 's'}
            </p>
          )}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="campaign-name">
            <input
              id="campaign-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Campaign #274"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Ruleset" htmlFor="campaign-ruleset" hint="Only 2014 rules are supported.">
            <span
              id="campaign-ruleset"
              className="flex min-h-11 items-center gap-2 rounded-btn border border-border bg-bg px-3 text-text-muted"
            >
              <Lock size={14} aria-hidden />
              D&amp;D 5e (2014)
            </span>
          </Field>
        </div>
        <ChoiceGroup
          legend="Your role"
          name="role"
          options={CAMPAIGN_ROLE_OPTIONS}
          value={role}
          onChange={setRole}
        />
        <ChoiceGroup
          legend="Leveling"
          name="leveling"
          options={LEVELING_OPTIONS}
          value={leveling}
          onChange={setLeveling}
        />
        <ChoiceGroup
          legend="Hit points per level"
          name="hp"
          options={HP_OPTIONS}
          value={hpMethod}
          onChange={setHpMethod}
        />
        <ChoiceGroup
          legend="Low HP rolls (negative CON)"
          name="hp-floor"
          options={HP_FLOOR_OPTIONS}
          value={hpLevelFloor}
          onChange={setHpLevelFloor}
        />
        <ChoiceGroup
          legend="Ability scores"
          name="abilities"
          options={ABILITY_OPTIONS}
          value={abilityMethod}
          onChange={setAbilityMethod}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-text">Sources</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SOURCE_OPTIONS.map((option) => {
              const on = ALWAYS_ON_SOURCES.includes(option.value) || sources.includes(option.value);
              const used = bookParts({ sources, sourceParts: parts }, option.value);
              return (
                <div key={option.value} className="flex min-w-0 flex-col gap-1">
                  <Toggle
                    label={option.label}
                    hint={option.hint}
                    checked={on}
                    disabled={lockedBook(option.value)}
                    onChange={(checked) => toggleSource(option.value, checked)}
                  />
                  {on && PARTED_SOURCES.includes(option.value) && (
                    <fieldset className="ml-2 flex flex-col border-l border-border pl-3">
                      <legend className="sr-only">Parts of {option.label}</legend>
                      {SOURCE_PARTS.map((part) => {
                        const locked = lockedPart(option.value, part);
                        return (
                          <label
                            key={part}
                            className={cx(
                              'flex min-h-11 items-center gap-2 text-sm',
                              locked ? 'cursor-default text-text-muted' : 'cursor-pointer',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={used.includes(part)}
                              disabled={locked}
                              onChange={(event) =>
                                togglePart(option.value, part, event.target.checked)
                              }
                              className="size-4 shrink-0 accent-(--omni-accent)"
                            />
                            {SOURCE_PART_NAMES[part]}
                            {locked && <Lock size={12} aria-label="Locked" className="shrink-0" />}
                          </label>
                        );
                      })}
                    </fieldset>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted">
            {existing
              ? 'Books and parts already in use stay on. You can add more, but not turn them off.'
              : 'Choose carefully: books and parts can be added later but never turned off.'}{' '}
            Turning on a book never turns on its optional rules.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-text">Optional rules</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {RULE_FLAG_OPTIONS.map((option) => (
              <Toggle
                key={option.value}
                label={option.label}
                hint={option.hint}
                checked={rules[option.value]}
                onChange={(on) => setRules({ ...rules, [option.value]: on })}
              />
            ))}
          </div>
          <p className="text-xs text-text-muted">
            Feats, multiclassing and Tasha&apos;s options are saved now and used by level up.
          </p>
        </fieldset>
        <ChoiceGroup
          legend="Encumbrance"
          name="encumbrance"
          options={ENCUMBRANCE_OPTIONS}
          value={rules.encumbrance}
          onChange={(encumbrance) => setRules({ ...rules, encumbrance })}
        />
        <ChoiceGroup
          legend="Rest length"
          name="rests"
          options={REST_OPTIONS}
          value={rules.rests}
          onChange={(rests) => setRules({ ...rules, rests })}
        />

        {existing && (
          <section
            aria-labelledby="campaign-existing"
            className="rounded-card border border-border bg-surface p-3 text-sm"
          >
            <h2 id="campaign-existing" className="mb-2 font-semibold">
              Existing character values
            </h2>
            <p className="text-xs text-text-muted">
              Saved HP rolls, ability scores, XP and current resources are kept. New character and
              level entries use the new methods. Earlier HP levels keep their original low-roll
              floor.
            </p>
            {conflicts.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-3">
                {conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    <p className="font-semibold">{conflict.name}</p>
                    <ul className="list-disc pl-5 text-xs text-warn">
                      {conflict.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-text-muted">
                Existing entries match the selected methods.
              </p>
            )}
          </section>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center rounded-btn px-4 text-sm text-text-muted hover:text-text"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="min-h-11 rounded-btn bg-accent px-5 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {existing ? 'Save' : 'Create campaign'}
          </button>
        </div>
      </form>
      {existing && syncConfig && (
        <div className="mx-auto mt-6 max-w-3xl">
          <PartySection campaign={existing} />
        </div>
      )}
      {confirmation}
    </>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cx(
        'flex min-w-0 flex-col gap-0.5 rounded-btn border border-border bg-surface p-3',
        'has-checked:border-accent has-checked:bg-surface-2 has-focus-visible:outline-2 has-focus-visible:outline-accent',
        disabled ? 'cursor-default' : 'cursor-pointer hover:border-text-muted',
      )}
    >
      <span className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 shrink-0 accent-(--omni-accent)"
        />
        <span className="min-w-0 font-semibold wrap-anywhere text-text">{label}</span>
        {disabled && <Lock size={14} aria-label="Locked" className="shrink-0 text-text-muted" />}
      </span>
      <span className="text-xs text-text-muted">{hint}</span>
    </label>
  );
}
