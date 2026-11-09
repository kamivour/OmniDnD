import { useState } from 'react';
import { deviceStore } from '../../state/device-settings';
import type { Campaign, CharacterBuild } from '../../engine/schema';
import { CAMPAIGN_ROLE_OPTIONS, PLAYED_BY_OPTIONS } from '../campaignOptions';
import { Sheet } from '../components/Sheet';

type CampaignRole = NonNullable<Campaign['role']>;
type PlayedBy = NonNullable<CharacterBuild['playedBy']>;

interface Choice<T extends string> {
  value: T;
  label: string;
  hint: string;
}

function ChoiceSheet<T extends string>({
  open,
  title,
  description,
  options,
  fallback,
  onChoose,
}: {
  open: boolean;
  title: string;
  description: string;
  options: readonly Choice<T>[];
  /** Used when the dialog is closed without choosing. */
  fallback: T;
  onChoose: (value: T) => void;
}) {
  const [remember, setRemember] = useState(false);
  const done = (value: T) => {
    if (remember) deviceStore.getState().setAskRoles(false);
    onChoose(value);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) done(fallback);
      }}
      title={title}
      description={description}
    >
      <div className="flex flex-col gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => done(option.value)}
            className="flex min-h-11 flex-col items-start gap-0.5 rounded-btn border border-border bg-surface p-3 text-left hover:border-accent"
          >
            <span className="font-semibold">{option.label}</span>
            <span className="text-xs text-text-muted">{option.hint}</span>
          </button>
        ))}
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-text-muted">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="size-4 accent-(--omni-accent)"
        />
        Don&apos;t ask again on this device
      </label>
    </Sheet>
  );
}

/** First question for a new campaign: run the game or play in it. */
export function CampaignRoleDialog({
  open,
  onChoose,
}: {
  open: boolean;
  onChoose: (role: CampaignRole) => void;
}) {
  return (
    <ChoiceSheet
      open={open}
      title="How will you use this campaign?"
      description="You can change this later in Campaign Setup."
      options={CAMPAIGN_ROLE_OPTIONS}
      fallback="player"
      onChoose={onChoose}
    />
  );
}

/** Question for a new character: who plays it. The DM option is offered only to the DM. */
export function PlayedByDialog({
  open,
  isDm,
  onChoose,
}: {
  open: boolean;
  isDm: boolean;
  onChoose: (playedBy: PlayedBy) => void;
}) {
  return (
    <ChoiceSheet
      open={open}
      title="Who plays this character?"
      description="Another player can claim it when they join a shared campaign."
      options={PLAYED_BY_OPTIONS.filter((option) => isDm || option.value !== 'dm')}
      fallback="me"
      onChoose={onChoose}
    />
  );
}
