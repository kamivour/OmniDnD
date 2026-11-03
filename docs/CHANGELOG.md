# OmniDnD — Changelog

What changed, newest first, in plain language. One entry per finished task, written when its git commit is made. Times are local (UTC+7).

Entries before 2026-11-02 02:30 were written up later from the PROGRESS.md session log; their time was not recorded. Before the first commit (2026-11-02 02:59) there is no git history for them.

## 2026-11-03 22:38 — Rest game-clock verification

- Confirmed Short Rest adds one hour and Long Rest eight hours only when applied. Drafting, previewing, canceling, and blocked attempts leave saved time unchanged.
- Confirmed midnight crossing, effect/concentration expiry, saved rest times, refresh, and exact Undo. Log timestamps correctly show the game time before each command.
- Reused the current passing rest tests and browser checks; no runtime changes were needed. Manual game-time checks are in `docs/MANUAL_QA.md`.
- Next: make Dashboard resources, effects, conditions, quick access, and recent log live.

## 2026-11-03 22:36 — Long Rest with recovery preview

- Long Rest now opens from the desktop HUD, phone More menu, and tablet toolbar. Its full preview shows recovery, the half-total Hit Dice cap, temporary HP, exhaustion, death saves, game time, and effect expiry before anything changes.
- The 24-hour warning keeps the preview visible. Cancel preserves it and focus; Do anyway applies one logged override. Manual suppresses the warning while zero HP, death, and combat remain blocked. Refresh and Undo restore the entire previous state.
- Eligible prepared casters can review spells after success in the existing manager, starting on their first prepared class. Opening review changes no selection. Fixed keyboard focus escaping that manager after confirming a warned rest.
- Validation: 813 unit tests and 97 focused browser checks pass without retries (9 expected width skips); typecheck, lint, and build pass. Phone/tablet/desktop recovery, nested warnings, prepared review, and Short Rest/shared feedback regressions checked using the real-HTTP forwarder.
- Long Rest manual checks are in `docs/MANUAL_QA.md`. Next: verify rest clock advancement, then make Dashboard live.

## 2026-11-03 22:20 — Short Rest with rolls and preview

- Open Short Rest from the desktop HUD, phone More menu, or tablet toolbar. Add Hit Dice one at a time and enter the results; CON and projected HP are computed automatically. Cancel or Escape discards the draft without spending anything.
- Review HP, Hit Dice, slots, features, game time, and effect expiry before Apply. One saved command advances an hour, spends selected dice, and restores eligible short-rest resources. Ordinary slots and level-3 Bardic Inspiration stay unchanged; refresh and Undo restore the exact previous state.
- Song of Rest is optional and applied once. Your own die and another bard's roll have separate limits, and Song requires actual healing from Hit Dice. Fixed incorrect ally limits, zero-healing eligibility, and focus after removing a roll while a different pool is depleted.
- Validation: 796 unit tests and 53 focused browser checks pass without retries (7 expected width skips); typecheck, lint, and build pass. Phone/tablet/desktop previews, action buttons, focus, and scrolling checked using the real-HTTP forwarder.
- Short Rest manual checks are in `docs/MANUAL_QA.md`. Next: Long Rest with eligibility checks and preview.

## 2026-11-03 22:04 — Combat milestone complete

- End combat now works from the Combat header, during your turn, while waiting, or before the first turn. It settles the final six seconds through the existing engine command, clears turn state, and returns focus to the updated status.
- Due effects and concentration expire with a log entry. Surviving effects, pending concentration checks, HP, and resources stay intact; timers switch to exact game time outside combat. Refresh and Undo restore the entire previous fight. Ending combat remains available at zero HP or dead without healing the character.
- M5 Combat is complete: startup, turns, economy, actions, casting, reactions, HP/saves, effects, saved history, and ending combat are live. Target results and DM rulings remain manual.
- Validation: 788 unit tests and 318 full browser checks pass without retries (32 expected width skips), including 12 End Combat checks. Typecheck, lint, and build pass; 375/1440 layouts and keyboard focus checked with the real-HTTP forwarder.
- Final M5 manual checks are in `docs/MANUAL_QA.md`. The existing massive-damage/temporary-HP question remains for DM review under Q21. Next: M6 Short Rest dialog, Hit Dice, Song of Rest, and preview diff.

## 2026-11-03 21:03 — Live effects and saved Combat history

- Concentration and effects on you now show their saved timers: rounds in combat and exact game time outside it. Timers follow the game clock, with no real-time countdown. End controls use logged commands and Undo restores the previous state.
- The sticky log keeps the latest command and Undo available while scrolling. View full log shows all retained character commands newest first, including game timestamps, warning overrides, and undone entries. Desktop also shows five recent events.
- Fixed a crash when an imported self effect expired before its surviving concentration. Only the expired link is removed; concentration, other possible targets, and pending saves remain intact. End effect targets are at least 44 px wide and tall.
- Validation: 783 unit tests and 60 focused browser checks pass without retries (4 expected width skips); typecheck, lint, and build pass. Phone/desktop countdowns, history, keyboard focus, long names, and sticky access checked with the real-HTTP forwarder.
- Manual checks are in `docs/MANUAL_QA.md`. Next: End Combat and final M5 validation.

## 2026-11-03 20:48 — Bonus-action spell flow verified

- Verified the 2014 restriction in both casting orders: a bonus-action spell shares its turn only with one-action cantrips. Bonus-action cantrips count too; ordinary bonus-action features do not. Own-turn reaction spells obey the restriction, while a still-available reaction after End Turn can be used normally.
- Default Combat Spells now uses the same engine check as casting, so incompatible spells are filtered from its normal view. Show all spells and the explicit action tabs keep warning/override choices reachable without changing saved selections.
- Warning Cancel preserves slot, healing choices, and focus. Do anyway spends once and logs an override. Turn changes, refresh, and Undo preserve the correct spell flags; Manual suppresses warnings while empty pools remain blocked.
- Validation: 772 unit tests, 12 bonus-spell browser checks, and 14 shared action regressions pass; typecheck, lint, and build pass. Phone/desktop warning and retained-choice layouts checked using the optional real-HTTP forwarder.
- Manual checks are in `docs/MANUAL_QA.md`. Next: live effect countdowns and the Combat log with Undo.

## 2026-11-03 20:32 — Reactions verified and boundary fixes

- Verified off-turn Cutting Words, opportunity attacks, Readied responses, and reaction spells. They share one reaction pool; a second use warns, Cancel changes nothing, and Do anyway records an override. Start Turn restores the reaction; End Turn keeps it spent.
- Readied responses now use the validated action command, so dead characters cannot spend them. Manual economy corrections remain available. Trigger and response outcomes stay decisions at the table.
- Using the final feature charge now leaves focus on a usable row preview or pinned detail container. Empty resource pools remain blocked, including Manual mode. Refresh and Undo preserve exact counts and histories.
- Validation: 764 unit tests and 42 focused browser checks pass without retries, including 16 reaction checks (4 expected width skips); typecheck, lint, and build pass. Phone/desktop layouts checked using the optional real-HTTP forwarder.
- Manual reaction checks are in `docs/MANUAL_QA.md`. Next: verify the bonus-action-spell flow, then live effect countdowns/log and ending combat.

## 2026-11-03 15:55 — Live HP, concentration checks, and death saves

- Combat and HUD now share saved damage, healing, temporary HP, and critical-at-zero controls. Warning Cancel keeps the editor, amount, and Apply focus; success closes it correctly. Desktop popover dismissal and focus after revival were reproduced and fixed.
- Damage while concentrating creates saved Pass/Fail checks in Assisted mode, one per damage instance. They survive navigation and refresh; Pass removes one, Fail ends concentration and linked effects, and Undo restores everything. Manual creates no new reminders while keeping older checks available for explicit review.
- At zero HP, record the natural d20 and any manual external bonus or penalty. Natural 1/20 keep their special outcomes. Stable/dead states disable illegal actions; damage absorbed by temporary HP still ends stability and adds the appropriate failures.
- One instant-death interaction with temporary HP remains for DM review (Q21). The existing remainder-based default is retained and identified in Assisted feedback when the competing interpretations differ.
- Validation: 758 unit tests and 266 full browser checks pass without retries (32 expected skips); typecheck, lint, and build pass. Phone/desktop HP, save, and focus layouts checked using the optional real-HTTP forwarder. Manual checks are in `docs/MANUAL_QA.md`.
- Next: verify off-turn reactions and repeated-use warnings, then the bonus-action-spell flow. Effect countdowns and Combat log presentation remain scheduled M5 work.

## 2026-11-03 10:49 — Live Combat actions, spells, and weapons

- Combat now uses equipped weapons and their computed attack/damage values, the character's selected spells, and actual feature pools. Blank characters no longer inherit The Fool's actions. Previews and pinned details keep current values.
- Standard actions and weapon attacks save as validated, undoable commands. Dash adds current-speed movement only for the current turn; End Turn removes it and Undo restores it exactly. Rolls, targets, contests, additional attacks, and readied-spell holding remain manual.
- Cast through the same phone, row, and pinned flow as Spellbook. The Spells tab follows current economy; Show all spells keeps explicit exceptions reachable without changing saved state. Shared feature uses update together, and depleted or unavailable uses disable with an explanation.
- Actual attacks and casts end spell-created Invisibility on you. Concentration on an ally stays intact; upcast or uncertain extra targets retain concentration with a note. Zero-quantity gear grants no attacks or armor benefits, dead characters cannot use features, and fixed weapon damage never goes negative.
- Validation: 689 unit tests and 248 full browser checks pass without retries (32 expected skips); typecheck, lint, and build pass. Phone, tablet, and desktop layouts checked using the optional real-HTTP forwarder. Manual action checks are in `docs/MANUAL_QA.md`.
- Next: live HP controls, concentration saves, and death saves. Combat HP/status/log remain labeled previews until their M5 tasks are finished.

## 2026-11-03 10:19 — Live turn controls and movement

- Start and end your own turns from Combat. The first turn stays in round 1 without advancing time; each later turn advances the round and clock by six seconds, restoring action, bonus action, reaction, and movement.
- Tap economy controls to spend or restore them manually. Use −5/+5 to spend or return movement against the character's computed speed. End Turn keeps spent resources until the next turn starts.
- Off-turn actions and excess movement use the existing warnings. Cancel preserves state and focus; Do anyway logs an override. Reactions remain usable off-turn. Every change saves and supports Undo after refresh.
- Validation: 620 unit tests and 30 focused Combat browser checks pass without retries (4 expected width skips); typecheck, lint, and build pass. Phone/desktop layouts and native touch warning focus were checked using the optional real-HTTP forwarder.
- Manual turn checks are in `docs/MANUAL_QA.md`. Combat actions, HP, and status/log are the next M5 work and remain labeled as a preview.

## 2026-11-03 03:02 — Combat starts from saved character state

- Start combat from the Combat screen. The header shows the saved round and whether your turn is active, waiting, or has not started yet. Initiative is computed for reference; there is no initiative order or roll entry.
- Starting combat saves one undoable command without spending resources or advancing the clock. Reload and navigation retain the same fight; keyboard focus moves to the updated status.
- Validation: 620 unit tests and 18 focused Combat browser checks pass without retries (4 expected width skips); typecheck, lint, and build pass. Phone and desktop layouts checked using the optional real-HTTP forwarder.
- Startup manual checks are in `docs/MANUAL_QA.md`. Other Combat controls remain a labeled preview while M5 continues. Next: live turn controls and economy.

## 2026-11-03 02:59 — Manage spells live; M4 complete

- Add, remove, or replace known and prepared spells from the class list and enabled sources. Separate cantrip, known, prepared, and Wizard spellbook counts use the character's own class level. Base limits warn and allow explicit exceptions.
- Replacements save as one command and undo together. Existing off-list, disabled-source, over-level, and unsupported selections remain visible for explicit cleanup. Favorites, tag references, and current play resources stay intact.
- Edit character-specific spell tags and their main type. Clearing all tags displays Utility; Reset tags restores defaults. Selection and tag changes save locally and support Undo after refresh.
- Validation: 620 unit tests and 216 full browser checks pass without retries; typecheck, lint, and build pass. Manage and tag layouts were checked at 375 px and desktop width using the optional real-HTTP forwarder.
- M4 is complete. Final Spellbook manual checks are in `docs/MANUAL_QA.md`. Next: M5 live Combat, starting with combat state and the round counter.

## 2026-11-03 02:39 — Spell filters and saved favorites

- Combine school, casting time, type, level, concentration, ritual, available casting resources, and favorites with name search. Clear resets the whole filter view without changing character data.
- Star spells by pointer or keyboard. Favorites save per character and support Undo after refresh, while preserving other favorite references and existing play state.
- Known minute/hour casting times appear as filter choices. Eligible rituals remain castable without standard slots outside combat. Removing the last filtered favorite restores focus to the Favorites filter.
- Validation: 559 unit tests and 204 full browser checks pass without retries; typecheck, lint, and build pass. Phone and desktop controls were visually checked using the optional real-HTTP forwarder.
- Manual filter/favorite checks are in `docs/MANUAL_QA.md`. Next: Manage mode for spell selections, limits, replacement, and tag overrides.

## 2026-11-03 02:22 — Casting, healing, and rituals are live

- Cast from a row, phone preview, or pinned details using one shared flow. The engine spends one slot, handles concentration and personal effects, logs the cast, and supports Undo after refresh.
- Choose a slot and see actual upcast information and computed dice. Apply healing or variable-target effects to yourself explicitly; enter only the rolled healing dice total and preview the resulting HP. Invalid totals spend nothing.
- Eligible known/prepared rituals use no slot and advance the game clock by their casting time plus ten minutes. Ordinary ritual controls stay outside combat. Prepared-caster restrictions warn while preserving Manual mode and explicit overrides; missing healing modifiers are never borrowed from another class.
- Warning cancellation keeps choices and returns focus inside the flow. Successful casting restores its opener; pinned controls that run out of slots use a usable focus fallback.
- Validation: 537 unit tests and 196 full browser checks pass without retries; typecheck, lint, and build pass. Casting layouts were checked at phone and desktop widths using the optional real-HTTP forwarder.
- Manual casting checks are in `docs/MANUAL_QA.md`. Next: filters, search, and saved favorites.

## 2026-11-02 21:42 — Live spell previews and accessible slot choices

- Hover, tap, keyboard focus, and pinned details now show actual spell attack metadata and the active character's casting values. Mobile previews return focus to the spell when closed.
- Slot selection follows saved availability, keeps a usable higher-level choice, and falls back when that slot runs out. Leveled Cast controls disable without available slots; cantrips remain available.
- All nine slot levels wrap into usable touch targets on phones. Full-reference links use a source-neutral label.
- Validation: 501 unit tests and 176 full browser checks pass without retries; typecheck, lint, and build pass. Layouts were checked at phone, tablet, and desktop widths using the optional real-HTTP forwarder.
- Manual preview checks are in `docs/MANUAL_QA.md`. Next: apply casts through the engine, including upcasting and eligible rituals.

## 2026-11-02 21:23 — Saved Spellbook groups and slot controls

- Spellbook now shows the active character's selected spells, registry summaries, casting stats, known limits, and saved concentration. Blank characters no longer inherit The Fool's spells; slot rows remain available even with no selected spells.
- Use −/+ or tap pips to adjust remaining standard slots. Every adjustment uses the engine, updates the HUD, saves locally, and supports Undo after refresh. Pip controls have 44 px targets and keyboard support.
- Imported spell associations without supported casting stats stay visible with an explanation. Pact Magic Spellbook support remains Phase 3; existing HUD adjustments remain available.
- Validation: 500 unit tests and 168 full browser checks pass without retries; the final phone screenshot check also passes. Typecheck, lint, and build pass. Phone/desktop layouts were checked using the optional real-HTTP test forwarder.
- Manual slot checks are in `docs/MANUAL_QA.md`. Next: live previews/pinned details, then casting. Cast and Manage actions still use the approved static frame behavior during this work.

## 2026-11-02 15:55 — Settings live; M3 complete

- Settings now saves Assisted/Manual automation and Always reduce motion for every character on this device. Changes are logged and can be undone after refresh.
- Reduced motion follows the OS preference or the saved switch, including mounted previews. Preference controls retain keyboard focus during saving. Manual tracks game actions without rule warnings while still blocking invalid inputs.
- Export and import character JSON from hub or character Settings. These controls share the hub's validated transfer flow, including collision previews, existing-data preservation, errors, and focus restoration.
- Validation: 488 unit tests and 158 full browser checks pass without retries; typecheck, lint, and build pass. Phone and desktop Settings/import layouts were visually checked. Browser tests use the optional real-HTTP forwarder.
- M3 is complete. Manual checks are in `docs/MANUAL_QA.md`; installability/offline checks remain M8. Next: M4 live Spellbook groups and slot controls.

## 2026-11-02 15:44 — Reference, bookmarks, and Credits

- Reference now has eight external rule/tool cards, with direct 2014 Basic Rules, SRD 5.1, and 5e.tools destinations plus edition notes for mixed libraries.
- Add, edit, and remove personal HTTP(S) bookmarks. The list is shared across campaigns on this device, survives refresh, and uses management Undo without changing character play history.
- Credits shows the required SRD attribution, each bundled game-icon author/source, and local Lucide/Inter/Cinzel license notices. Both screens preserve hub or character navigation context.
- Validation: 454 unit tests pass; 148 browser checks pass after focused reruns for a fixed removal-focus race and two transport errors. Typecheck, lint, and build pass; phone and desktop layouts were checked. Browser tests use the optional real-HTTP forwarder.
- Manual Reference checks are in `docs/MANUAL_QA.md`. Next: Settings preferences and character JSON transfer.

## 2026-11-02 15:32 — Campaign rules save and guide new characters

- Create campaigns and save their name, leveling, HP method, low-roll floor, and ability method. New characters follow the saved methods; sources stay read-only until M11.
- Existing scores, HP rolls, XP, resources, and character histories are retained. Settings explain which old entries differ from the selected methods.
- Changing the low-roll floor preserves earlier levels, including negative-CON characters. New entries remember their floor. Campaign Undo survives refresh and also handles a later character Undo removing an older HP level.
- Validation: 379 unit tests and 140 browser checks pass; typecheck, lint, and build pass. Phone and desktop layouts were visually checked. One host HTTP transport error in a skipped browser case cleared on rerun; tests use the optional real-HTTP forwarder.
- Manual campaign checks are in `docs/MANUAL_QA.md`. Next: Reference links, bookmarks, and Credits.

## 2026-11-02 15:02 — Live Campaigns hub and character management

- Campaign cards now show saved characters and computed HP. New blank characters follow campaign methods; racial bonuses, scores, HP, and XP baselines are computed from choices.
- Copy and delete controls are live, with confirmation and a separate management Undo that survives refresh. Undo warns before replacing later character changes.
- Export downloads validated JSON. Import previews the character before saving, keeps existing characters intact, and creates separate copies or campaigns when IDs or rules conflict. Remapped copies start fresh game-action histories, as explained in the preview.
- Added phone, desktop, keyboard-focus, reload, import-error, and unusual-ID navigation checks. Validation: 343 unit tests, 132 full browser checks, and two final corrected-form checks pass; typecheck, lint, and build pass. Browser checks use the optional real-HTTP forwarder.
- Manual QA is in `docs/MANUAL_QA.md`. Saved campaign settings display correctly; their Save/Create actions are the next M3 task. Optional build choices remain unselected in new blank characters.

## 2026-11-02 14:26 — Local saving and undo survive refresh

- HUD changes and their undo history now save together in IndexedDB and reload on startup. The Fool is seeded only on first use.
- The toolbar shows save status and lets you undo after a refresh. Success messages wait for saving; rapid changes keep their feedback and Undo linked to the latest command.
- Failed writes leave saved data intact and retain changes in memory for Retry. A stale second window shows a conflict instead of overwriting another window's saved session.
- Damaged or unsupported saved records show an error without being erased. Saved undo history is validated before opening the character.
- Validation: 253 unit tests and 118 browser checks pass; typecheck, lint, and build pass. Phone and desktop layouts were visually checked. Browser tests use this host's optional real-HTTP forwarder.
- Manual checks are in `docs/MANUAL_QA.md`. Next: make the Campaigns hub live, with character management and JSON import/export.

## 2026-11-02 03:33 — Live HUD and command store

- The HUD now shows The Fool's saved seed: HP 11/19, level 1 slots 0/4, level 2 slots 2/2, and Bardic Inspiration 3/5. Stats come from the rules engine.
- Tap HP, slots, or class resources to adjust them. Changes are logged and undoable. Temp HP replacement warns before applying; Cancel keeps the old value.
- AC, initiative, and speed show their calculation parts. The status control handles basic conditions, 2014 exhaustion, and ending effects. Value overrides wait for M7.
- Undo keeps its confirmation message. Closing warning dialogs returns keyboard focus. The tablet backdrop test now waits for an actionable backdrop rather than racing its listener.
- Validation: 234 unit tests and 108 browser checks pass, with no retries in the final run. Typecheck, lint, and production build pass. Browser tests use the optional real-HTTP forwarder on this host.
- Manual checks are in `docs/MANUAL_QA.md`. Saving is next: HUD changes currently reset on refresh. Dashboard, Spellbook, and Combat content stays static until its scheduled live milestone.

## 2026-11-02 03:20 — All screens have routes

- Added Companions to the sidebar and mobile More menu, plus routes for Credits.
- Inventory, Features, Companions, and Journal clearly say "Coming in Phase 2". Remaining Phase 1 placeholders name their milestone.
- Validation: 224 unit tests and 47 focused browser checks pass; typecheck, lint, and build pass.
- Manual check: open Companions from navigation, and confirm future screens show their phase rather than a broken page.
- Next: connect the global HUD to real character state and engine commands.

## 2026-11-02 03:18 — Responsive shell and shared Details

- Desktop navigation collapses to icons. Selected details open in one shared panel and remain available when you switch screens.
- Tablets open details in a drawer on the right, including spell slot choices and action buttons. Phones keep their bottom navigation and sheets.
- Layouts adapt when Details reduces the available space. Closing details restores keyboard focus.
- Added `docs/MANUAL_QA.md` with checks for phone, tablet, desktop, keyboard, and normal browser loading.
- Validation: 224 unit tests and 69 browser checks pass; typecheck, lint, and production build pass. Windows intermittently denies Chromium sockets, so browser checks use an optional real-server HTTP forwarder. Normal networking remains a manual check.
- Next: route the remaining screens and label future-phase placeholders.

## 2026-11-02 02:59 — Changelog and git history

- Added this changelog.
- First git commit: everything built so far (M0 to M2).
- From now on, every finished task gets an entry here and its own commit, so each change has an exact timestamp and a list of changed files. Nothing is pushed anywhere (there is no remote).

## 2026-11-02 02:33 — M2 done: rules engine passes the full test scenario

- The whole acceptance scenario (TEST_CHARACTER §6, steps 1–16) runs as one automated test: combat, swapping concentration, Cutting Words, a second reaction with "Do anyway", the bonus-action spell rule, spells running out on the clock, short and long rests, the Hit Dice cap, undo, a manual slot fix, and the seed values.
- Scenario steps 1–3 were reworded to match earlier decisions: no initiative step, and Faerie Fire is your concentration only, not an effect on you.
- 224 tests pass.
- Next: M3, the first live screens (layout, HUD, saving).

## 2026-11-02 02:30 — M2: The Fool's sheet values checked

- Every number in TEST_CHARACTER §4 has a test, including the level-up to 4 (rolled 5: max HP 25, Hit Dice 4d8). Added a check for the Song of Rest d6.
- "XP field hidden" is a screen check and waits for the level-up screen.

## 2026-11-02 — M2: every game action as an engine command

- Spells: slots, rituals, concentration (casting a second one ends the first), effects on yourself, healing, long casting times moving the clock.
- HP: damage, healing, temp HP, death saves, concentration save DC, massive damage.
- Combat: rounds move the game clock 6 s each; action, bonus action, reaction and movement tracking; the bonus-action spell rule.
- Time and rests: effects and concentration expire on the clock; short rest spends Hit Dice and adds Song of Rest; long rest warns within 24 h and gives back half your Hit Dice.
- Level up: adds one HP roll (or the average) and one Hit Die.
- Warnings never stop you for good: "Do anyway" goes through and is marked in the log.
- Not built yet, on purpose: item use and equipping (Phase 2), and value overrides (M3 edit mode).

## 2026-11-02 — M2: command runner with undo

- Every action runs through one runner: it checks first (block, warn, or info), then applies the change and writes a log entry.
- Any logged action can be undone; the log keeps the last 500 entries.

## 2026-11-02 — M2: character sheet calculations

- The engine computes every derived number: modifiers, saves, skills (expertise, Jack of All Trades), passives, initiative, AC, speed, max HP, Hit Dice, spell DC and attack, slots, feature uses, weapon attacks, carrying capacity.
- Each number keeps its parts, ready for the breakdown tooltips.

## 2026-11-02 — M2: The Fool's content

- Charlatan, False Identity, Dissonant Whispers and the deck of marked cards added (own words; they are not in the free SRD).
- Short summaries for The Fool's spells and features.

## 2026-11-02 — M2: SRD import

- `npm run import:srd` loads the free SRD rules data: 319 spells, 328 features, 12 classes, 13 races, 197 items, 15 conditions.

## 2026-11-02 — M2: data shapes and seed character

- Data shapes for characters, campaigns, spells, features and items, with validation.
- The Fool and campaign #273 saved as a seed file. The game clock counts in seconds.

## 2026-11-02 — M1 signed off

- You approved the key frames. M2 (the rules engine) started.

## 2026-11-01 — M1: low HP rolls setting

- New campaign setting for a level-up roll plus a negative CON modifier: allow negative (default; max HP can go down) or at least 1 per level.
- Fixed: the blank landing page was a stale dev server, not a code bug.

## 2026-11-01 — M1: review round 1

- The app now opens on a Campaigns hub, with campaign settings and new-character frames.
- Dashboard resources split into groups, with the − / + buttons apart and description cards.
- Concentration shown apart from effects on you.
- Spell type tags with colored rows and a Type filter.
- Combat has no turn order.

## 2026-11-01 — M1: key frames

- Static Combat, Spellbook and Dashboard screens for mobile and desktop, on sample data. Buttons only show a message.

## 2026-11-01 — M0: project setup

- App skeleton, design tokens, fonts, test tools (unit tests and browser tests at 375 px and 1440 px), lint rules.

## 2026-11-01 — Planning

- Planning docs written, then updated with The Fool's real data, the public-repo rules and the campaign settings (milestone leveling, rolled HP and abilities).
