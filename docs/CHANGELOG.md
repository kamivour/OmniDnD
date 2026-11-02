# OmniDnD — Changelog

What changed, newest first, in plain language. One entry per finished task, written when its git commit is made. Times are local (UTC+7).

Entries before 2026-11-02 02:30 were written up later from the PROGRESS.md session log; their time was not recorded. Before the first commit (2026-11-02 02:59) there is no git history for them.

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
