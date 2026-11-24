import { containerChecks } from '../commands/inventory';
import { characterRegistry, type Registry } from '../registry';
import { ExportFileSchema, SCHEMA_VERSION } from '../schema';
import { AbilityBasesSchema, abilityBaseIssues } from './ability-methods';
import { attunedItems } from './attunement';
import { sourceAllows } from './campaign-rules';
import { resolveCompanion } from './companion-profiles';
import { companionStats } from './companions';
import { featSpellPickProblem, featSpellSources, wizardSpellbook } from './feat-spells';
import { featureResource } from './features';
import { averageHpRoll, type HitDie } from './hp';
import {
  activeInfusions,
  artificerLevel,
  infusionLimit,
  infusionOptionIds,
  INFUSION_PREFIX,
  infusionsKnownAt,
} from './infusions';
import { containerLoads } from './inventory-weight';
import { asiLevels } from './level-choices';
import { meetsMinimum, minimumText, MULTICLASS_RULES } from './multiclass';
import { overrideTargets } from './override-targets';
import { pendingChoices } from './pending-choices';
import { reviewProficiencies } from './review-proficiencies';
import { computeSheet, type CharacterState, type Sheet } from './sheet';
import { spellSelectionCountWarning, spellSelectionDetails } from './spell-selections';

export const REVIEW_GROUPS = [
  ['Build & stats', 'sheet'],
  ['Proficiencies', 'sheet'],
  ['Spells', 'spells'],
  ['Features & resources', 'features'],
  ['Inventory', 'inventory'],
  ['Companions', 'companions'],
] as const;

type ReviewGroup = (typeof REVIEW_GROUPS)[number][0];
export interface ReviewFinding {
  id: string;
  group: ReviewGroup;
  status: 'missing' | 'excess' | 'review';
  title: string;
  detail: string;
  route: (typeof REVIEW_GROUPS)[number][1] | 'todo' | 'combat';
}

type ReviewContext = CharacterState & { sheet: Sheet; registry: Registry };
type AddFinding = (
  id: string,
  status: ReviewFinding['status'],
  title: string,
  detail: string,
  route?: ReviewFinding['route'],
) => void;

function reviewBuild(ctx: ReviewContext, add: AddFinding) {
  const { build, live, campaign, registry, sheet } = ctx;
  const scores = AbilityBasesSchema.safeParse(build.abilityScores.base);
  const issues = scores.success
    ? abilityBaseIssues(campaign.abilityMethod, scores.data)
    : ['Base scores fall outside the standard 2014 range of 3–18'];
  for (const [index, issue] of issues.entries())
    add(
      `base-scores:${index}`,
      'review',
      issue,
      'The campaign may have changed its score method or allowed a custom roll. Review the saved base scores.',
    );

  const originIds = [
    build.raceId,
    build.subraceId,
    build.backgroundId,
    ...build.classes.flatMap(({ classId, subclassId }) => [classId, subclassId]),
  ];
  for (const id of new Set(originIds)) {
    if (id === undefined) continue;
    const row = registry.entries.get(id);
    if (!row || !sourceAllows(campaign, row))
      add(
        `origin:${id}`,
        'review',
        `Review ${row?.name ?? id}`,
        'This origin or class is missing from the catalogue or its source is disabled in this campaign.',
      );
  }

  const race = build.subraceId && registry.get('race', build.subraceId);
  if (race && race.subraceOf !== build.raceId)
    add(
      'subrace-parent',
      'review',
      `${race.name} does not match the selected race`,
      'Check the race and subrace pairing on the Sheet.',
    );
  const classIds = new Set<string>();
  for (const { classId, subclassId, level } of build.classes) {
    const def = registry.get('class', classId);
    if (classIds.has(classId))
      add(
        `class-duplicate:${classId}`,
        'review',
        `${def.name} is recorded more than once`,
        'A class normally has one entry that records all of its levels.',
      );
    classIds.add(classId);
    if (subclassId) {
      const subclass = registry.get('subclass', subclassId);
      if (subclass.classId !== classId || level < def.subclassLevel)
        add(
          `subclass:${classId}`,
          'review',
          `Review ${subclass.name} for ${def.name} ${level}`,
          `This subclass belongs to ${registry.get('class', subclass.classId).name}, and ${def.name} gains its subclass at level ${def.subclassLevel}.`,
        );
    }
    const rule = MULTICLASS_RULES[classId];
    if (
      build.classes.length > 1 &&
      rule &&
      !meetsMinimum(rule, (ability) => sheet.abilities[ability].score.value)
    )
      add(
        `multiclass:${classId}`,
        'review',
        `${def.name} multiclass prerequisite · ${minimumText(rule)}`,
        'Current scores may differ from the scores when you took the class. Confirm the original choice with your DM.',
      );
  }

  const asiSources = new Set(
    build.classes.flatMap(({ classId, level }) =>
      asiLevels(classId)
        .filter((at) => at <= level)
        .map((at) => `ASI: ${registry.get('class', classId).name} ${at}`),
    ),
  );
  const spentAsis = new Map<string, number[]>();
  for (const { source, value } of build.abilityScores.bonuses) {
    if (source.startsWith('ASI:')) spentAsis.set(source, [...(spentAsis.get(source) ?? []), value]);
  }
  for (const [source, values] of spentAsis) {
    if (
      !asiSources.has(source) ||
      values.some((value) => value !== 1 && value !== 2) ||
      values.reduce((sum, value) => sum + value, 0) !== 2
    )
      add(
        `asi:${source}`,
        'review',
        `Review ${source}`,
        'A standard ASI adds +2 to one score or +1 to each of two scores at a class level that earns an improvement.',
      );
  }

  for (const entry of build.hpEntries) {
    const die = Number(registry.get('class', entry.classId).hitDie.slice(1)) as HitDie;
    const expected =
      entry.method === 'max' ? die : entry.method === 'average' ? averageHpRoll(die) : undefined;
    const valid =
      expected === undefined ? entry.value >= 1 && entry.value <= die : entry.value === expected;
    if (!valid)
      add(
        `hp-entry:${entry.level}`,
        'review',
        `Level ${entry.level} HP entry is ${entry.value}`,
        expected === undefined
          ? `This class rolls a d${die} before adding Constitution.`
          : `The recorded method normally uses ${expected} before adding Constitution.`,
      );
  }
  if (live.hp > sheet.maxHp.value)
    add(
      'hp-over-max',
      'excess',
      `HP is ${live.hp}/${sheet.maxHp.value}`,
      'Current HP exceeds the computed maximum. Temporary HP is tracked separately.',
    );
  for (const [die, spent] of Object.entries(live.hitDiceSpent)) {
    const max = sheet.hitDice.find((entry) => entry.die === die)?.max ?? 0;
    if (spent > max)
      add(
        `hit-dice:${die}`,
        'excess',
        `${spent} ${die} Hit Dice spent · ${max} maximum`,
        'Review spent Hit Dice against the current classes.',
      );
  }
  const overrides = new Map(overrideTargets(ctx).map((target) => [target.path, target.label]));
  for (const [index, { path, note }] of build.overrides.entries())
    add(
      `override:${index}`,
      'review',
      `Override · ${overrides.get(path) ?? path}`,
      note || 'Check this saved override with your DM.',
    );
}

function reviewSpells(ctx: ReviewContext, add: AddFinding) {
  const { build, live, sheet, registry, campaign } = ctx;
  const classes = new Set([
    ...sheet.spellcasting.map(({ classId }) => classId),
    ...build.spells.map(({ classId }) => classId),
  ]);
  for (const classId of classes) {
    const details = spellSelectionDetails(ctx, classId);
    const countWarnings = new Set<string>();
    for (const list of ['cantrips', 'known', 'prepared'] as const) {
      const detail = spellSelectionCountWarning(details, list);
      if (detail) {
        countWarnings.add(detail);
        add(
          `spell-count:${classId}:${list}`,
          'excess',
          detail,
          'Always-prepared subclass spells and separate feature picks have their own allowances.',
        );
      }
    }
    for (const [index, detail] of details.warnings.entries()) {
      if (!countWarnings.has(detail))
        add(
          `spell-rule:${classId}:${index}`,
          'review',
          detail,
          'Check the spell level, list and campaign sources. Keep any exception confirmed by your DM.',
        );
    }
    const rows = build.spells.filter((entry) => entry.classId === classId);
    const duplicate = (['known', 'prepared'] as const).some((key) => {
      const ids = rows.flatMap((row) => row[key] ?? []);
      return new Set(ids).size !== ids.length;
    });
    if (duplicate)
      add(
        `spell-duplicates:${classId}`,
        'review',
        `${details.name} has repeated spell entries`,
        'Compare the saved entries in this casting source. The same spell can belong to different sources.',
      );
  }
  const featSources = new Set(featSpellSources(ctx).map(({ featureId }) => featureId));
  const book = wizardSpellbook(build);
  for (const [id, picks] of Object.entries(build.featSpells ?? {})) {
    const def = sheet.features.find((feature) => feature.def.id === id)?.def;
    const classId = def?.spells?.castingClassId;
    const subclass = build.classes.find((entry) => entry.classId === classId)?.subclassId;
    const issue =
      def && featSources.has(id)
        ? featSpellPickProblem(registry, campaign, def, picks, subclass, [], book.known)
        : 'The feature that grants these spell choices is not active.';
    if (issue)
      add(
        `feat-spells:${id}`,
        'review',
        def?.name ?? registry.entries.get(id)?.name ?? id,
        issue,
        'todo',
      );
  }
  live.slotsUsed.forEach((spent, level) => {
    const max = sheet.slots.max[level] ?? 0;
    if (spent > max)
      add(
        `slots:${level}`,
        'excess',
        `Level ${level} slots spent · ${spent}/${max}`,
        'Compare the number spent with the current slot pool, including added slots.',
      );
  });
  const pactMax = sheet.slots.pact?.count ?? 0;
  if ((live.pactSlotsUsed ?? 0) > pactMax)
    add(
      'pact-slots',
      'excess',
      `Pact slots spent · ${live.pactSlotsUsed}/${pactMax}`,
      'Pact Magic has its own pool, separate from regular spell slots.',
    );
}

function reviewFeatures(ctx: ReviewContext, add: AddFinding) {
  const { build, live, sheet, registry, campaign } = ctx;
  for (const id of new Set(build.featureIds)) {
    const def = registry.entries.get(id);
    if (!def || !sourceAllows(campaign, def))
      add(
        `source:${id}`,
        'review',
        `Review ${def?.name ?? id}`,
        'This saved feature is missing from the catalogue or from the enabled books.',
      );
  }
  for (const id of Object.keys(live.featureUsesSpent)) {
    const uses = featureResource(sheet.features, live, id);
    if (uses && uses.spent > uses.max)
      add(
        `feature-uses:${id}`,
        'excess',
        `${registry.get('feature', id).name} spent · ${uses.spent}/${uses.max}`,
        'A change to the build, an override or an older counter may explain the difference.',
      );
  }
  const known = [...new Set(build.featureIds.filter((id) => id.startsWith(INFUSION_PREFIX)))];
  const level = artificerLevel(build);
  const knownMax = infusionsKnownAt(level);
  if (known.length > knownMax)
    add(
      'infusions-known',
      'excess',
      `${known.length} infusions known · ${knownMax} allowed`,
      'Each Replicate Magic Item recipe counts as one known infusion.',
      'todo',
    );
  if (known.length) {
    const eligible = new Set(infusionOptionIds(registry, campaign, level));
    for (const id of known.filter((id) => !eligible.has(id)))
      add(
        `infusion-option:${id}`,
        'review',
        `Review ${registry.entries.get(id)?.name ?? id}`,
        'Check the required Artificer level and enabled book for this infusion.',
        'todo',
      );
  }
  const active = activeInfusions(build, live).length;
  if ((live.infusions?.length ?? 0) > active)
    add(
      'infusions-stale',
      'review',
      'Some saved infusion assignments are inactive',
      'Check for forgotten infusions, repeated assignments or gear that is no longer present.',
      'inventory',
    );
  const activeMax = infusionLimit(build);
  if (active > activeMax)
    add(
      'infusions-active',
      'excess',
      `${active} active infusions · ${activeMax} tracked limit`,
      'Check which infusions are still active and whether any armor-only allowance applies.',
      'inventory',
    );
  const expired = live.effects.filter(
    ({ endsAt }) => endsAt !== undefined && endsAt <= live.clock.seconds,
  );
  for (const effect of expired)
    add(
      `effect:${effect.id}`,
      'review',
      `${effect.name} has reached its end time`,
      'Check whether the effect should still be active at the current Game Clock time.',
      'combat',
    );
}

function reviewInventory(ctx: ReviewContext, add: AddFinding) {
  const { build, live, sheet, registry } = ctx;
  const attuned = attunedItems(ctx).length;
  if (attuned > sheet.attunementLimit)
    add(
      'attunement',
      'excess',
      `${attuned} attuned items · ${sheet.attunementLimit} allowed`,
      'The limit counts items currently marked as attuned, including depleted records.',
    );
  for (const item of build.items) {
    const def = registry.get('item', item.itemId);
    const record = live.items[item.instanceId];
    const name = def.name;
    if (def.charges && record?.charges !== undefined && record.charges > def.charges.max)
      add(
        `charges:${item.instanceId}`,
        'excess',
        `${name} charges · ${record.charges}/${def.charges.max}`,
        'The number of charges exceeds this item’s recorded capacity.',
      );
    if (record?.qty === 0 && (record.equipped || record.attuned))
      add(
        `depleted:${item.instanceId}`,
        'review',
        `${name} has quantity 0`,
        'The item still has an equipped or attuned flag. Review whether it is present.',
      );
    for (const check of containerChecks(ctx, item.instanceId, item.container))
      add(`container:${item.instanceId}`, 'review', `Review where ${name} is stored`, check.reason);
  }
  for (const { instanceId, name, pounds, capacityPounds, overCapacity } of containerLoads(
    ctx,
    registry,
  )) {
    if (overCapacity)
      add(
        `capacity:${instanceId}`,
        'excess',
        `${name} contains ${pounds} lb · ${capacityPounds} lb capacity`,
        'Confirm the outcome with your DM.',
      );
  }
}

function reviewCompanions(ctx: ReviewContext, add: AddFinding) {
  const limits = new Map<string, { count: number; max: number; name: string }>();
  for (const stored of ctx.build.companions ?? []) {
    const live = ctx.live.companions?.[stored.id];
    if (live?.status !== 'active') continue;
    const companion = resolveCompanion(stored, ctx);
    const { maxHp } = companionStats(companion, ctx);
    if (live.hp > maxHp)
      add(
        `companion-hp:${stored.id}`,
        'excess',
        `${companion.name} HP · ${live.hp}/${maxHp}`,
        'Compare current HP with the maximum from this form and owner.',
      );
    if (live.hp === 0 || (live.endsAt !== undefined && live.endsAt <= ctx.live.clock.seconds))
      add(
        `companion-active:${stored.id}`,
        'review',
        `${companion.name} is still active`,
        'The companion has 0 HP or has reached its recorded expiry time.',
      );
    for (const use of companion.uses) {
      const spent = live.usesSpent[use.id] ?? 0;
      if (spent > use.max)
        add(
          `companion-use:${stored.id}:${use.id}`,
          'excess',
          `${companion.name} · ${use.name} spent ${spent}/${use.max}`,
          'Compare the saved uses with this companion’s current form.',
        );
    }
    const limit = companion.limit;
    if (!limit) continue;
    const current = limits.get(limit.key);
    limits.set(limit.key, {
      count: (current?.count ?? 0) + 1,
      max: Math.max(current?.max ?? 0, limit.max),
      name: companion.name,
    });
  }
  for (const [key, { count, max, name }] of limits) {
    if (count > max)
      add(
        `companion-limit:${key}`,
        'excess',
        `${count} active companions in ${name}’s group · ${max} allowed`,
        'Check the shared limit for this feature or spell.',
      );
  }
}

/** Inspect a snapshot using 2014 rules and the campaign's enabled options. Review never edits it. */
export function verifyCharacter(
  state: CharacterState,
  bundled: Registry,
  sheet?: Sheet,
): ReviewFinding[] {
  const schema = ExportFileSchema.safeParse({
    app: 'omnidnd',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '1970-01-01T00:00:00.000Z',
    campaign: state.campaign,
    build: state.build,
    live: state.live,
    events: [],
  });
  if (!schema.success)
    return schema.error.issues.map(({ path, message }, index) => ({
      id: `schema:${index}`,
      group: 'Build & stats',
      status: 'review',
      title: `Invalid save field · ${path.join('.')}`,
      detail: message,
      route: 'sheet',
    }));

  const findings: ReviewFinding[] = [];
  const addFor =
    (group: ReviewGroup, defaultRoute: ReviewFinding['route']): AddFinding =>
    (id, status, title, detail, route = defaultRoute) => {
      findings.push({ id: `${group}:${id}`, group, status, title, detail, route });
    };
  const registry = characterRegistry(bundled, state.build);
  const { build } = state;
  const ids = [
    build.raceId,
    build.backgroundId,
    ...(build.subraceId ? [build.subraceId] : []),
    ...build.classes.flatMap(({ classId, subclassId }) => [
      classId,
      ...(subclassId ? [subclassId] : []),
    ]),
    ...build.items.map(({ itemId }) => itemId),
    ...build.featureIds,
  ];
  const unknown = [...new Set(ids)].filter((id) => !registry.entries.has(id));
  if (unknown.length)
    return unknown.map((id) => ({
      id: `unknown:${id}`,
      group: 'Build & stats',
      status: 'review',
      route: 'sheet',
      title: `Missing catalogue reference · ${id}`,
      detail: 'The app needs this reference before it can check dependent character values.',
    }));
  const ctx = { ...state, registry, sheet: sheet ?? computeSheet(state, bundled) };
  reviewBuild(ctx, addFor('Build & stats', 'sheet'));
  findings.push(...reviewProficiencies(state, ctx.sheet, registry));
  reviewSpells(ctx, addFor('Spells', 'spells'));
  reviewFeatures(ctx, addFor('Features & resources', 'features'));
  reviewInventory(ctx, addFor('Inventory', 'inventory'));
  reviewCompanions(ctx, addFor('Companions', 'companions'));

  // Legacy choices can be flattened into the base proficiency list. The budgets above cover
  // skills and languages. Other kinds still need attribution when there is no saved pick.
  for (const item of pendingChoices(state, registry, ctx.sheet)) {
    if (item.optional) continue;
    if (item.kind === 'proficiencies') {
      const choices = ctx.sheet.features.find(({ def }) => def.id === item.featureId)?.def
        .proficiencies?.choose;
      if (
        choices?.some(({ kinds }) => kinds.some((kind) => kind !== 'skill' && kind !== 'language'))
      )
        addFor('Proficiencies', 'todo')(
          `pending:${item.id}`,
          'review',
          item.label,
          'Confirm whether these choices were recorded directly on an older sheet.',
        );
      continue;
    }
    const group =
      item.kind === 'subclass' || item.kind === 'asi'
        ? 'Build & stats'
        : item.kind === 'expertise'
          ? 'Proficiencies'
          : item.area === 'spells' || item.kind === 'feat-spells'
            ? 'Spells'
            : 'Features & resources';
    addFor(group, item.area === 'spells' ? 'spells' : 'todo')(
      `pending:${item.id}`,
      'missing',
      item.label,
      'The app found an open choice based on the recorded class levels and features.',
    );
  }
  return findings;
}
