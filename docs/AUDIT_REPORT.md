# OmniDnD audit · 2026-11-21

Reviewed the repository at `7da09b9` and implemented confirmed class fixes in the working tree. The data pass covered 13 classes, 99 subclasses, 790 feature rows, 459 spell references and 69 resource links. All references resolved. This was a structural pass across the full catalog with targeted checks against the 2014 rules. Individual effects on all 99 subclasses still need rule-by-rule review.

## Baseline and verification

| Command | Result |
|---|---|
| `npm install --offline --no-audit --no-fund` | Existing dependency versions resolved. No lockfile change. |
| `npm test` | 2,269 passed before changes and 2,296 after changes, including 27 class audit cases. |
| `npm run typecheck` | Passed in the baseline build and in the build for the final browser run. |
| `npm run lint` | Passed before and after changes. |
| `npm run build` | Passed. Vite warned about the 2.13 MB data chunk and 610 kB vendor chunk before compression. The baseline precache was 4.38 MiB. |
| `npm run e2e` | Baseline run at 375 and 1440 px. 844 passed, 50 skipped and 4 hit the known forwarding error at `tests/e2e/fixtures.ts:121`. The native follow-up passed 90 cases, including all four affected cases and both full Phase 1 sequences. Two tablet cases skipped the mobile project as designed. |
| Final focused `npm run e2e` | 44 passed at 375 and 1440 px for the Paladin flow, spell choices, level-up and To do. The production build passed. |
| `npx --yes knip --reporter compact` | Flagged 5 files, 46 exports and 32 types. Scripts, config and test helpers can be false positives. |

Baseline skips were limited to cases for one viewport or input mode, optional screenshots, and the configured account build. The new Paladin flow passed at both widths with forwarding and was included in the native follow-up.

## Ten findings to review first

1. **Fixed.** Blessed Warrior was listed but could not grant its cantrips. The paired Ranger style had the same gap.
2. **Fixed.** Glory's Inspiring Smite and Conquest's Guided Strike were missing from their Combat controls.
3. **Fixed.** Cleric/Paladin multiclass characters could spend Channel Divinity from two separate pools.
4. **Fixed.** Twilight Sanctuary used an action without spending Channel Divinity.
5. **Fixed.** Champion got no second style picker at Fighter 10, and Archery omitted its attack bonus.
6. **Fixed.** Land Druid had no terrain picker or level-gated circle spells.
7. **Fixed in part.** Warlock patron spells and the Divine Soul cleric list now appear in normal picks. Genie heritage spells and the Divine Soul affinity grant remain open.
8. **Fixed in part.** Arcane Trickster now gets Mage Hand and Swords Bard gets a style picker. Stars already has its spells, while Star Map's free cast remains manual.
9. **Open.** Several class choices are text or manual, including some documented as part of completed milestones.
10. **Pending live evidence.** M43's account flows have automated coverage. Its two-account deployment check and the tester's Artificer report still need the relevant environments.

## Phase 1 · Milestones

The suite exercises the initial workspace and the Phase 1 acceptance sequence, inventory and rules through M11, companions and creation through M18, Find and campaign sharing, and the M44 phone and M45 Compendium changes. See `tests/e2e/m6-acceptance.spec.ts:298` and `src/engine/commands/acceptance.test.ts` for the saved Fool values and the combat-to-rest sequence. This reproduces the documented scenario in browser automation at both widths. A separate manual walk-through and a task-to-test link for every milestone checkbox are pending.

### [MEDIUM] M43 had stale status

- Where: `docs/PROGRESS.md:69`, `docs/PROGRESS.md:337`, `docs/PLAN.md:282`
- Evidence: M43 has completed implementation tasks and an unchecked live verification task. M44 and M45 are already marked done.
- Impact: The progress summary gave a misleading impression about available account flows.
- Change: Marked M43 in progress and corrected the summary. M41 remains open on the original Artificer report.
- Effort: S

## Phase 2 · 2014 rules and content

### [HIGH] Fighting styles could not grant cantrips

- Where: `data/content/features.json:1258`, `src/engine/calc/granted-spells.ts:20`
- Evidence: The tested Paladin style was available under Tasha's Optional Class Features but had no spell picks. The verified rule name is Blessed Warrior. The exact tester phrase could not be matched to a supported fighting style.
- Change: Both styles now ask for two spells, filter to the correct source list, and cast with the owning class's ability. The existing saved-choice editor remains available for corrections.
- Proof: The tests reject an off-list pick, check casting stats, and verify reload and Undo. [Publisher confirmation of the style's Tasha origin](https://www.dndbeyond.com/posts/1749-2024-paladin-vs-2014-paladin-whats-new)
- Effort: M

### [HIGH] Paladin Channel Divinity options could be absent from Combat

- Where: `data/content/features.json:7366`, `data/content/features.json:9646`, `src/ui/combat/combat-model.ts:36`
- Evidence: All eight supported oaths have two choices linked to the shared resource. Glory's Inspiring Smite was marked Special. Conquest's Guided Strike was also Special, so both were excluded from Combat.
- Change: Inspiring Smite appears under Bonus with its Divine Smite trigger. Guided Strike appears under Actions with a No action badge. Hits and recipients remain player-entered. Harness Divine Power stays a separate optional feature with its existing rules.
- Proof: Tests inspect both choices for every oath and confirm resource spending, action cost and Undo. [2014 Paladin rules](https://www.dndbeyond.com/classes/4-paladin), [publisher comparison of Inspiring Smite timing](https://media.dndbeyond.com/compendium-images/ua/ph-playtest6/OJVW7QLuHjEFCCVs/UA-2023-PH-Playtest6.pdf)
- Effort: M

### [HIGH] Channel Divinity pools diverged

- Where: `src/engine/calc/features.ts:30`, `src/engine/commands/features.ts:68`, `data/content/features.json:2448`
- Evidence: Cleric and Paladin each read a separate counter. Twilight Sanctuary lacked a pool link. Vigilant Blessing's summary incorrectly excluded the caster.
- Change: Commands, HUD, Features, rest previews and corrections use one multiclass pool with the higher maximum. Legacy spent uses add together. Twilight Sanctuary now spends the Cleric pool, and Vigilant Blessing allows the caster.
- Proof: The Cleric 6/Paladin 3 test covers old per-class amounts, blocked use, manual correction, rest and exact Undo. [2014 multiclass rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options#ChannelDivinity)
- Effort: M

### [HIGH] Style choice and derived attack gaps

- Where: `src/engine/calc/pending-choices.ts:281`, `src/engine/calc/sheet.ts:441`
- Evidence: Fighter had a single style allowance at every level. Archery had no calculation while Defense already did.
- Change: Champion 10 gets a second distinct style. Fighter and Ranger Archery adds +2 to ranged-weapon attack rolls, with thrown melee weapons excluded.
- Proof: Level 9/10 boundary and longbow/handaxe checks. [2014 Champion and Archery](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes)
- Effort: S

### [HIGH] Class spell lists missed subclasses' choices

- Where: `data/mechanics/subclasses.json:2`, `src/engine/calc/spell-selections.ts:65`, `data/mechanics/features.json:46`
- Evidence: Spell eligibility only considered the base class or the subclass's base casting list. The Land terrain entries were present but unused in the builder.
- Change: Patron lists and Divine Soul cleric spells are eligible for normal picks. Celestial bonus cantrips, Land and Nature bonus cantrip choices, and all eight Land terrains use class grants. Class spell validation also recognizes the subclass's Wizard list for Eldritch Knight and Arcane Trickster.
- Proof: Tests exercise seven patron lists, class limits, and a Coast Druid's spell access with and without multiclass levels. [2014 Warlock](https://www.dndbeyond.com/classes/7-warlock), [2014 Land Druid](https://www.dndbeyond.com/subclasses/20-circle-of-the-land)
- Effort: M

### [MEDIUM] Class and subclass choice gaps remain

- Where: `data/content/features.json:4396`, `data/content/features.json:6938`, `data/content/features.json:8141`, `data/content/features.json:8962`
- Evidence: Arcane Trickster's required Mage Hand was text alongside three ordinary picks, and Swords Bard's style had no option family. Stars Druid already gains both Star Map spells, but its slotless Guiding Bolt uses a separate manually recorded resource. Genie needs heritage-specific spell picks and Wish through Mystic Arcanum. Divine Soul's affinity spell remains a manual choice.
- Change: Arcane Trickster now starts with Mage Hand and two open cantrip picks. An existing character with extra picks retains them and sees the limit warning. Swords Bard can record Dueling or Two-Weapon Fighting in To do. Their grip and off-hand damage remain manual.
- Impact: Affected builds need manual choices or tracking. Add these using the existing choice and casting commands, keeping old selections and use records intact.
- Also tracked: one-third caster school limits (D186), Four Elements level and Ki limits (D187), and Kensei and Favored Enemy choices (D208).
- Effort: L in total

The structural pass checked all class and subclass links and pool links. The focused rules pass used the existing ability, AC, save, skill, slot, concentration, death-save, movement, encumbrance and rest tests, including mixed classes and odd Hit Dice. Searches for 2024 identifiers found edition rejection cases and a 2014 weapon-property comment. This does not verify every rule expressed in a feature summary.

## Phases 3 and 4 · Architecture and data safety

- Engine purity lint passed. Character commands use the shared runner and its validated patches. The view-only route also blocks engine commands at `src/engine/commands/runner.ts:81`. The direct write at `src/ui/party/ShareCampaign.tsx:87` mirrors cloud sharing metadata after a successful request.
- `supabase/migrations/20261109170000_party.sql:190` ties party-character reads to membership and writes to ownership. The automated reader tests cover a separate view-only route. Live RLS and account mutations need a throwaway project.
- `.env.local` and private data are ignored. Path-scoped history shows only the private folder's instruction README. The focused key/signature scan produced one generated vendor match, with no private key found in app source. A complete historical secret scan was not part of this pass.
- JSON export/import validation and Journal's plain text rendering have passing browser tests. The audit did not include a line-by-line copied-text comparison of 20 non-SRD entries.

## Phases 5 and 6 · Cleanup and scope

### [LOW] Unused route alias and test-tool noise

- Where: `src/ui/screens/JoinScreen.tsx:1`, `src/App.tsx:59`
- Evidence: Knip flagged the route alias, which has no caller now that App imports the party module directly. It also flagged the party test config and icon-fetch script, which have separate entry points.
- Impact: Safe alias cleanup is possible after confirming references. Configure lint tooling for the external entry points before acting on the remaining results.
- Effort: S

M43's Profile, DM seat and sharing changes match its plan. The Bench is covered by D244. The M46 damage flow still has design tasks ahead. A per-command inventory against every plan and decision was not completed.

## Phases 7 and 8 · Browser details and docs

Baseline browser tests cover offline reload and updates, themes, focus and single Undo, import/export, backups, print, tutorial and Find. The class fixes have their own tests at 375 and 1440 px. Separate manual checks of every screen in Dark and Parchment and real multi-account sync are pending.

The Progress, Changelog, Decisions and Data notes reflect the changes above. Slotless spell effects, encounter targets, and book choices retain their existing handling where this audit did not implement automation.

## Remaining decisions and evidence

- Reproduce the Artificer report with the tester's exported campaign settings. The prior fixture retained Artificer after switching to Rolled.
- Complete M43 on a disposable Supabase project before marking live account verification done.
- Decide how far to automate table choices already documented as manual, especially in D186, D187 and D208.
