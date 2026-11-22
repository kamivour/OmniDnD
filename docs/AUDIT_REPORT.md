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

## 2026-11-22 · Infusion choices follow-up

- To do already hid learned recipes and recipes above the character’s Artificer level. At level 2, the old nine-option pool would show six choices after three picks.
- The generic Replicate Magic Item entry missed individual recipes. The selector now offers all 49 named Tasha’s recipes at their required levels and shows the character’s known picks. Existing general picks still count toward the limit.
- Resistant Armor also accepts force and psychic. Replica creation stays in Inventory under Q47.

## 2026-11-22 · Artificer rules and play audit

Scope is the Tasha Artificer from levels 1–20, its four specialists, their spells and infusions, and the Xanathar spells in the Artificer list. Xanathar supplies spells and replica candidates. Tasha supplies the class and its subclasses. See [Tasha’s class entries](https://www.dndbeyond.com/sources/dnd/tcoe), [the publisher’s Artificer spell reference](https://www.dndbeyond.com/spells/class/252717-artificer) and [the 2020 Artificer errata](https://media.wizards.com/2020/dnd/downloads/ERftLW-Errata.pdf).

| Area | Checked or corrected | Still handled at the table |
|---|---|---|
| Levels 1–2 | INT casting, prepared limits, rituals, cantrip progression and replacement, multiclass slots, and focus reminders for every Artificer spell. All 15 standard infusions and 49 named replica recipes are present. Common replicas follow enabled books. | Magical Tinkering effects and physical focus use. Replica or Homunculus creation and active limits (Q47). |
| Levels 3–10 | Subclass at 3, ASIs, double proficiency on proficient tools at 6, Flash of Genius reaction and uses at 7, fourth attunement at 10. | The Right Tool for the Job, Flash of Genius targets and item crafting. |
| Levels 11–20 | Fifth and sixth attunements at 14 and 18. Soul of Artifice adds one to all saves per attuned item. Corrected the Spell-Storing Item rules and removed its misleading daily counter. | Store a spell on a specific item, track its uses and resolve its holder’s concentration. Apply Savant exceptions and Soul of Artifice’s infusion sacrifice at the table. |
| All specialists | Automatic prepared pairs at 3, 5, 9, 13 and 17 sit outside the class preparation limit. The first tool proficiency is granted. | Choose an alternate artisan tool when you already know the one your subclass grants (D208). |
| Alchemist | Corrected Alchemical Savant’s eligible rolls. Restorative Reagents has a long-rest counter. Chemical Mastery tracks defenses and separate free uses of Heal and Greater Restoration. | Creating and drinking Experimental Elixirs, calculating their temporary HP and applying Alchemical Savant to the chosen roll. |
| Armorer | Heavy armor training, subclass spells and Extra Attack are tracked. | Arcane Armor and its focus, Guardian and Infiltrator model effects, Perfected Armor and the two armor-only infusion slots (Q48). |
| Artillerist | All cannon forms, damage scaling and the level 15 cannon limit are covered. Corrected the Artificer spell requirement for Arcane Firearm. | Marking a particular focus as the firearm and applying its bonus, cannon explosion outcomes and Fortified Position cover. |
| Battle Smith | Battle Ready can use INT with magic weapons. Extra Attack, Steel Defender stat scaling and the level 15 AC upgrade are tracked. Arcane Jolt has its own long-rest counter and dice scaling. | Qualifying hits, the once-per-turn Jolt limit, healing or damage targets, and Defender reaction outcomes. |

Eight class-list gaps were restored. A regression test covers the 95 spells in Tasha’s class list, including all 15 Xanathar spells, across all spell levels. Vortex Warp remains a separate Strixhaven option. Wrath of Nature was moved to Xanathar. The 2024 Bubbling Cauldron entry was retired so old saves can remove it without enabling it in play. The Fizban source for Summon Draconic Spirit remains Q49.

## 2026-11-23 · Audit of the other twelve classes

The roster now has 98 subclasses for these classes, including the DMG Oathbreaker, plus the four existing Artificer subclasses. The audit compared the supported 2014 class and spell lists and checked when each recorded subclass feature unlocks. The level-up command test reaches level 20 for every class and undoes the last level. [2014 class rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes), [2014 PHB spell lists](https://media.wizards.com/2015/downloads/dnd/DnD_SpellLists_1.01.pdf), [Xanathar’s](https://www.dndbeyond.com/sources/dnd/xgte), [Tasha’s](https://www.dndbeyond.com/sources/dnd/tcoe)

| Class | Restored or corrected | Follow-up |
|---|---|---|
| Barbarian | A second Primal Knowledge pick at level 10, the action cost of Bolstering Magic, and Primal Champion's STR and CON bonuses. | Apply Bolstering Magic to its recipient and choose the slot restored. |
| Bard | Optional spells and ASI cantrip swaps. Mote of Potential, Psychic Blades and Peerless Skill use the correct Inspiration cost. Magical Secrets offers bonus picks at Lore 6 and reserved picks at Bard 10, 14 and 18. | Review earlier saves if a spell was entered before Magical Secrets had its own choices. |
| Cleric | Optional spell list and ASI cantrip swap. Divination returns to the base list. Destructive Wave stays available from its domain grant. | Track the choice and replacement for Blessed Strikes. |
| Druid | Dreams and Shepherd subclasses, Druid Grove, optional spells, ASI cantrip swap, Wild Companion spending Wild Shape, and Stars’ free Guiding Bolt uses. | Handle spirit auras, Balm dice and Wild Companion creation at the table. |
| Fighter | Arcane Archer's eight shots and lore cantrip. Rune Knight's six runes. Ferocious Charger, Remarkable Athlete and Champion weapon critical thresholds. | Rune replacement and active effects, Arcane Shot riders and Ever-Ready Shot, maneuver pools from feats and styles, and Eldritch Knight school limits. |
| Monk | Corrected Ki costs, the Mercy Flurry limit, Sun Soul bolt costs and the displayed Purity of Body defenses. | Dedicated Weapon, Kensei picks, Four Elements gates, and once-per-rest tracking for Hand of Ultimate Mercy. |
| Paladin | Find Greater Steed and Tasha's optional spell list. | Track the steed bond and mount choices at the table. |
| Ranger | Primal Awareness spells with separate free castings, Nature's Veil uses, and Tasha's optional spell list. | Apply Nature's Veil invisibility and track Favored Enemy and temporary target effects at the table. |
| Rogue | Soulknife's psionic pool and blade range. Corrected Swashbuckler Panache. | Psionic power options and die recovery, Arcane Trickster school limits, and Panache outcomes. |
| Sorcerer | Shadow Magic grants Darkness, fixed several Sorcery Point costs, restored four points on a level 20 short rest, and corrected Restore Balance and displayed defenses. Optional spells and ASI cantrip swaps are available. | Shadow's slotless Darkness, Divine Soul affinity, origin spell replacements and Aberrant Mind's slotless psionic casting. |
| Warlock | Pact of the Tome cantrips, Pact of the Chain familiar, optional spells, ASI cantrip swaps, defenses and independent Mystic Arcanum castings per tier. Limited Wish uses a manual recharge after 1d4 long rests. | Genie spells by heritage and Eldritch Versatility options for boons and Arcanum. |
| Wizard | Bladesinging, weapon proficiency, Extra Attack, active Bladesong, Song of Victory, Arcane Recovery, Cantrip Formulas, Spell Mastery and Signature Spells. | Apply Song of Defense at the table. Add Illusion's replacement cantrip. |

Warding Wind and Soul Cage now appear for Bard and Warlock respectively. Cordon of Arrows is available with the PHB, and Cause Fear follows its Xanathar class list. Healing Spirit uses the published healing limit. [2014 PHB spell lists](https://media.wizards.com/2015/downloads/dnd/DnD_SpellLists_1.01.pdf), [Xanathar’s spell reference](https://www.dndbeyond.com/sources/dnd/sae/xanathars-guide-to-everything)

The 2014 Bladesinger and the two Xanathar Druid circles use their published class levels and play options. Target rolls, damage riders and companion behavior remain table decisions. [Bladesinging](https://www.dndbeyond.com/posts/1048-wizard-101-bladesinging-from-tashas-cauldron-of), [Circle of Dreams](https://www.dndbeyond.com/posts/73-the-druid-circle-of-dreams-in-xanathars-guide-to), [Circle of the Shepherd](https://www.dndbeyond.com/posts/1492-circle-of-the-shepherd-druid-guide-features-how-to)
