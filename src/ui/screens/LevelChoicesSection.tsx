import { registry } from '../../data/registry';
import type { Campaign } from '../../engine/schema';
import { OptionGuide } from '../components/OptionGuide';
import { SectionLabel } from '../components/SectionLabel';
import { AsiPick, SubclassPick } from '../level/LevelUpChoices';
import { emptyPicks, featOptions, subclassOptions, type LevelPicks } from '../level/level-up-model';
import { levelPickRows } from './new-character-steps';

/** Subclass and ability score improvement picks for each level a new character starts above. */
export function LevelChoicesSection({
  campaign,
  classId,
  level,
  picks,
  onChange,
  hints,
}: {
  campaign: Campaign;
  classId: string;
  level: number;
  picks: Record<number, LevelPicks>;
  onChange: (next: Record<number, LevelPicks>) => void;
  hints: boolean;
}) {
  const rows = levelPickRows(registry, classId, level);
  const subclasses = subclassOptions({ campaign }, registry, classId);
  const feats = featOptions({ campaign, build: { featureIds: [] } }, registry);
  return (
    <section aria-labelledby="nc-levels" className="flex flex-col gap-4">
      <SectionLabel>
        <span id="nc-levels">Level choices</span>
      </SectionLabel>
      <p className="text-xs text-text-muted">
        Anything you skip stays on the character&apos;s to-do list.
      </p>
      {rows.map((row) => {
        const current = picks[row.level] ?? emptyPicks;
        const set = (patch: Partial<LevelPicks>) =>
          onChange({ ...picks, [row.level]: { ...current, ...patch } });
        return (
          <fieldset key={row.level} className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-text">Level {row.level}</legend>
            {row.subclass && subclasses.length > 0 && (
              <>
                <SubclassPick options={subclasses} picks={current} set={set} />
                {hints && (
                  <OptionGuide
                    noun="subclasses"
                    options={subclasses}
                    value={current.subclassId}
                    onChange={(id) => set({ subclassId: id })}
                  />
                )}
              </>
            )}
            {row.asi && <AsiPick feats={feats} picks={current} set={set} campaign={campaign} />}
          </fieldset>
        );
      })}
    </section>
  );
}
