import type { Registry } from '../registry';
import { CLASS_START } from './class-start';
import { MULTICLASS_RULES } from './multiclass';
import { EXPERTISE_TOTALS } from './pending-choices';
import { proficiencyPickProblem } from './proficiencies';
import type { CharacterState, Sheet } from './sheet';
import type { ReviewFinding } from './character-review';

type CountKind = 'skills' | 'languages';

/** Mixed choices (such as Samurai's skill or language) have a range, not an exact count. */
function proficiencyBudget({ build }: CharacterState, sheet: Sheet, registry: Registry) {
  const [first, ...later] = build.classes;
  const start = first && CLASS_START[first.classId];
  if (!start || later.some(({ classId }) => !MULTICLASS_RULES[classId])) return;
  const race = registry.get('race', build.subraceId ?? build.raceId);
  const background = registry.get('background', build.backgroundId);
  const startSkills =
    start.skills.count +
    background.skills.length +
    (background.skillChoices ?? 0) +
    later.filter(({ classId }) => MULTICLASS_RULES[classId]?.skill !== undefined).length;
  const startLanguages = race.languages.length + (background.languageChoices ?? 0);
  const sharedChoices = sheet.features.reduce(
    (count, { def }) =>
      count +
      (def.proficiencies?.choose ?? [])
        .filter(({ kinds }) => kinds.includes('skill') && kinds.includes('language'))
        .reduce((sum, row) => sum + row.count, 0),
    0,
  );
  const budget = (key: CountKind, kind: 'skill' | 'language', base: number) => {
    let min = base;
    let max = base;
    for (const { def } of sheet.features) {
      const grant = def.proficiencies;
      const fixed = grant?.[key]?.length ?? 0;
      min += fixed;
      max += fixed;
      for (const row of grant?.choose ?? []) {
        if (!row.kinds.includes(kind)) continue;
        if (row.kinds.length === 1) min += row.count;
        max += row.count;
      }
      // Older feats may store their picks directly on the build.
      if (key === 'skills' && !grant?.choose?.some((row) => row.kinds.includes('skill'))) {
        max += def.grants?.skills ?? 0;
      }
      if (key === 'languages' && !grant?.choose?.some((row) => row.kinds.includes('language'))) {
        // These 2014 choices can be recorded as languages or represented by the feature alone.
        if (def.id === 'feature.feat.linguist') max += 3;
        if (def.id === 'feature.ranger.favored-enemy')
          max +=
            1 +
            Number(levelFor(build, 'class.ranger') >= 6) +
            Number(levelFor(build, 'class.ranger') >= 14);
        if (def.id === 'feature.druid.druidic' || def.id === 'feature.rogue.thieves-cant') max++;
      }
    }
    return { min, max };
  };
  return {
    skills: budget('skills', 'skill', startSkills),
    languages: budget('languages', 'language', startLanguages),
    sharedChoices,
  };
}

const levelFor = (build: CharacterState['build'], id: string) =>
  build.classes.find(({ classId }) => classId === id)?.level ?? 0;

const normalize = (value: string) => value.trim().toLowerCase();

function excessDetail(build: CharacterState['build'], sheet: Sheet, kind: CountKind): string {
  const base = new Set(build.proficiencies[kind].map(normalize));
  const additions = new Set(
    sheet.grantedProficiencies
      .filter((entry) => entry.kind === kind && !base.has(normalize(entry.value)))
      .map(({ value }) =>
        kind === 'skills'
          ? value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
          : value,
      ),
  );
  const detail = additions.size
    ? `The base list has ${base.size} entries. Saved features add ${[...additions].join(', ')}.`
    : `The base list already contains ${base.size} entries.`;
  return `${detail} Review earlier choices and any DM grants.`;
}

export function reviewProficiencies(
  state: CharacterState,
  sheet: Sheet,
  registry: Registry,
): ReviewFinding[] {
  const { build } = state;
  const findings: ReviewFinding[] = [];
  const add = (id: string, status: ReviewFinding['status'], title: string, detail: string) =>
    findings.push({ id, group: 'Proficiencies', status, title, detail, route: 'sheet' });
  const budget = proficiencyBudget(state, sheet, registry);
  const skillCount = new Set(sheet.proficiencies.skills).size;
  const languageCount = new Set(sheet.proficiencies.languages.map(normalize)).size;
  if (!budget) {
    add(
      'proficiency-budget',
      'review',
      'Proficiency allowance needs review',
      'A recorded class has no proficiency budget in the app.',
    );
  } else {
    for (const [key, count, label] of [
      ['skills', skillCount, 'skill proficiencies'],
      ['languages', languageCount, 'languages'],
    ] as const) {
      const { min, max } = budget[key];
      if (count > max)
        add(
          `proficiency-${key}`,
          'excess',
          `${count} ${label} recorded · up to ${max} from the build`,
          excessDetail(build, sheet, key),
        );
      if (count < min)
        add(
          `proficiency-${key}`,
          'missing',
          `${count} ${label} recorded · ${min} expected from the build`,
          'Review the choices from your origin, classes and features. Confirm any substitutions with your DM.',
        );
    }
    const combinedMax = budget.skills.max + budget.languages.max - budget.sharedChoices;
    if (
      budget.sharedChoices > 0 &&
      skillCount <= budget.skills.max &&
      languageCount <= budget.languages.max &&
      skillCount + languageCount > combinedMax
    )
      add(
        'proficiency-shared',
        'excess',
        `${skillCount + languageCount} skills and languages recorded · up to ${combinedMax} together`,
        'A choice that grants a skill or a language can contribute to either list once.',
      );
  }

  const trained = new Set<string>([...sheet.proficiencies.skills, ...sheet.proficiencies.tools]);
  for (const id of new Set(sheet.proficiencies.expertise)) {
    if (!trained.has(id))
      add(
        `expertise-${id}`,
        'review',
        `Expertise in ${registry.entries.get(id)?.name ?? id.replaceAll('-', ' ')} has no proficiency`,
        'Expertise normally doubles an existing proficiency. Check the saved proficiency and expertise choices.',
      );
  }
  const classExpertise = build.classes.reduce(
    (sum, { classId, level }) =>
      sum + (EXPERTISE_TOTALS[classId]?.findLast(([at]) => at <= level)?.[1] ?? 0),
    0,
  );
  if (new Set(build.proficiencies.expertise).size > classExpertise)
    add(
      'expertise-count',
      'review',
      `${new Set(build.proficiencies.expertise).size} base Expertise choices · ${classExpertise} from class levels`,
      'Review Expertise stored on the build. Feats, traits and DM grants can provide additional Expertise.',
    );

  const savedPicks = Object.entries(build.proficiencyPicks ?? {});
  for (const [id, picks] of savedPicks) {
    const def = sheet.features.find((feature) => feature.def.id === id)?.def;
    const problem = def
      ? proficiencyPickProblem(def, picks, registry, new Set(sheet.proficiencies.skills))
      : 'This trait or feature is no longer active on the character.';
    if (problem)
      findings.push({
        id: `proficiency-pick:${id}`,
        group: 'Proficiencies',
        status: 'review',
        title: def?.name ?? registry.entries.get(id)?.name ?? id,
        detail: problem,
        route: 'todo',
      });
  }
  return findings;
}
