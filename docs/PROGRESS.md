# OmniDnD — Progress

**Current milestone:** M12 — Journal + Companions.
**Next up:** M13 (see the milestone table). Going online with accounts: follow [HOSTING.md](HOSTING.md) when ready.

Status: `todo` · `doing` · `done` · `blocked`

Build for multiple campaigns and characters, including friends' future characters. The Fool remains the acceptance fixture.

## Goals

| ID | Goal | Measured by |
|---|---|---|
| G1 | Run a full session with The Fool without paper | User plays one session on it |
| G2 | Common combat actions in ≤ 2 taps on mobile | Cast, attack, damage, heal, end turn |
| G3 | Zero desync between screens | Acceptance scenario checks every step |
| G4 | Every change can be undone | Scenario steps 13–14 |
| G5 | Works offline, survives refresh | PWA test, reload checks |
| G6 | Correct 2014 rules for everything implemented | Engine unit tests |

## Milestones

| ID | Milestone | Phase | Status | Exit criteria |
|---|---|---|---|---|
| M0 | Project setup | 1 | done | App runs, tests run, tokens in place |
| M1 | Key frames (static) | 1 | done | User signs off hub, Dashboard, Spellbook, Combat look |
| M2 | Rules engine core (headless) | 1 | done | Scenario passes as Vitest test |
| M3 | Shell, HUD, persistence | 1 | done | Nav works on all breakpoints, data survives reload |
| M4 | Spellbook (live) | 1 | done | Cast/adjust slots synced with HUD |
| M5 | Combat (live) | 1 | done | Scenario steps 1–8 work in UI |
| M6 | Rest + Dashboard (live) | 1 | done | Scenario steps 9–14 work in UI |
| M7 | Character Sheet + Exploration + level-up | 1 | done | All computed values match TEST_CHARACTER §4 |
| M8 | Phase 1 hardening | 1 | done | Definition of done (SPEC §8) met |
| M9 | Inventory + Features screen | 2 | done | General inventory and feature controls sync across screens; custom items export; changes survive reload and Undo |
| MA | Accounts + cloud sync | 2 | done | Optional login keeps each person's campaigns and characters; guest mode and offline use unchanged |
| M10 | Effects editor + Conditions | 2 | done | Effects on you can be added, edited and end on their own; conditions show their consequences |
| M11 | Campaign Setup: sources + optional rules | 2 | done | Each campaign picks its books and optional rules; changes never delete character choices |
| M12 | Journal + Companions | 2 | done | |
| M13 | Searchable Reference | 2 | todo | |
| M14 | Full level-up wizard + more classes + multiclass | 3 | todo | |
| M15 | Ally/enemy tracker | 3 | todo | |
| M16 | Dice roller, themes, more books | 4 | todo | |

Detail one milestone at a time. Later Phase 2+ screens remain placeholders until their milestone starts.

## Checklists

### M0 — Project setup
- [x] Vite + React + TypeScript (strict) + Tailwind
- [x] Zustand, Immer, Dexie, zod, React Router, Radix primitives, Floating UI, Lucide
- [x] Vitest + Playwright configured; `npm test`, `npm run e2e`, `npm run typecheck` work
- [x] ESLint + Prettier
- [x] `src/theme/tokens.css` with DESIGN.md §2 tokens; Tailwind reads them
- [x] Inter + Cinzel self-hosted
- [x] Folder layout per DATA.md §8
- [x] Fill in commands in AGENTS.md

### M1 — Key frames (static, fixture data)
- [x] Core components: `PipRow`, `StatChip`, `HpControl`, `EconomyBar`, `SpellRow`, `PreviewPopover` / `PreviewSheet`, `Toast`, `Icon`
- [x] Frame C: Combat, mobile 375 px (first)
- [x] Frame C: Combat, desktop
- [x] Frame B: Spellbook with hover preview (desktop) and bottom sheet (mobile)
- [x] Frame A: Dashboard, desktop + mobile
- [x] Pick game-icons for The Fool's spells/features + school fallbacks
- [x] Motion budget only (DESIGN.md §5); reduced motion works
- [x] Campaigns hub as landing page; hub routes + "All campaigns" link from the character frame (D38)
- [x] Campaign settings / New campaign frame (D40 defaults; low HP rolls setting, D44)
- [x] New character frame: inputs follow campaign methods; scores, modifiers, max HP computed (`engine/calc/hp.ts`)
- [x] Dashboard resources: three groups, `PipStepper`, description cards (D37); concentration separate from effects on you (D41)
- [x] Spell types: tags, tinted rows, Type filter, Active badge (D39, D43)
- [x] Combat without turn order (D42)
- [x] **Gate:** user reviews and signs off → log in DECISIONS.md (D45)

### M2 — Rules engine core (headless)
- [x] Types + zod schemas (DATA.md §4), including `Campaign` character rules
- [x] Seed fixture `data/characters/the-fool.json` + campaign #273 (TEST_CHARACTER §1–3)
- [x] SRD import script → `data/srd/`; report missing IDs
- [x] The Fool content: summaries in `data/srd` overlays / `data/content/`; mechanics in `data/mechanics/`
- [x] Calculations: mods (base + bonuses), prof, saves, skills, JoAT, passives, initiative, DC/attack, AC, weapon attacks, slots, resources, max HP from `hpEntries`
- [x] Command runner with Immer patches, validation levels, override flag, event log, undo
- [x] Commands: spells + concentration, damage/heal/temp, death saves, turn economy, effects + clock expiry, rests, manual adjusts, `levelUp` (adds one HP entry + 1 Hit Die)
- [x] Unit tests: TEST_CHARACTER §4 values (incl. level-up to 4)
- [x] Unit test: full acceptance scenario (TEST_CHARACTER §6)

### M3 — Shell, HUD, persistence
- [x] Layouts: desktop sidebar + detail panel, tablet drawer, mobile bottom nav
- [x] All screens routed; Phase 2+ screens show "Coming in Phase N"
- [x] Global HUD wired to store; adjust popovers
- [x] Dexie save after each command; load on start
- [x] Campaigns hub (live): list campaigns + characters, seed #273 with The Fool, create blank, duplicate, delete, import/export JSON
- [x] Campaign Setup (Phase 1 part, live): leveling, HP method, ability method. New character entry follows these methods
- [x] Reference: link cards + bookmarks + Credits page
- [x] Settings: reduced motion, automation level, export/import

### M4 — Spellbook (live)
- [x] Groups, slot rows with `− / +` and pip toggle
- [x] Preview (hover / tap / focus) + pin to detail panel
- [x] Cast flow with slot-level picker and upcast text; ritual option
- [x] Filters, search, favorites
- [x] Manage mode (known count vs limit, replace spell)

### M5 — Combat (live)
- [x] Start combat, round counter (no turn order, D42)
- [x] Economy bar; Start/End Turn resets
- [x] Action tabs; standard actions; weapon attacks
- [x] HP panel; concentration save prompt; death saves at 0 HP
- [x] Reactions usable off-turn; second reaction warns
- [x] Bonus-action-spell rule
- [x] Effects with round countdown; log + Undo
- [x] End combat converts rounds to game time

### M6 — Rest + Dashboard (live)
- [x] Short Rest dialog: Hit Dice spending, Song of Rest, preview diff
- [x] Long Rest dialog: 24 h + 0 HP checks, Hit Dice half cap, preview diff
- [x] Rests advance game clock
- [x] Dashboard: resources, effects, conditions, quick access, recent log
- [x] Gate: scenario steps 9–14 through real controls, including standalone time advancement

### M7 — Character Sheet + Exploration
- [x] Sheet sections (SPEC §5) with breakdown tooltips
- [x] Unify character status/log row with one Undo (gate before Sheet Edit mode)
- [x] Edit mode + overrides with ✎ marker
- [x] Ability scores: enter base per campaign method (rolled = typed, standard array = assign, point buy = 27-point check); bonuses listed separately
- [x] Level up (minimal): milestone button / XP threshold prompt; enter roll or take average; +1 Hit Die; XP hidden in milestone mode
- [x] Exploration: reuse Dashboard GameClockControl (D91); utility spells/rituals, skills + passives, active effects

### M8 — Phase 1 hardening
- [x] Playwright acceptance scenario at mobile + desktop sizes
- [x] PWA: installable, offline after first load
- [x] Keyboard pass; contrast check; reduced motion check
- [x] No dead buttons
- [x] Auto backups (before import/reset, after long rest)
- [x] Settings reset behavior (D107), with backup and confirmation
- [x] SPEC §8 checklist all true; device feel and full-session judgments remain in MANUAL_QA.md

### M9 — Inventory + Features
- [x] Define scope, task order and acceptance from existing item and feature data
- [x] Live Inventory: instance quantities, equipment toggles and container groups; AC/attacks update through logged commands
- [x] Catalogue items: add/remove instances, choose containers, edit notes; preserve legacy records and reject new container cycles
- [x] Reject incomplete item imports while preserving existing records and valid legacy item IDs
- [x] Currency adjustments and computed carried weight/capacity, including coins, purchase bundles and unknown weights
- [x] Attunement limit and explicit bond records, with focused-rest reminders and legacy record review
- [x] Item charge counters and explicit recharge prompts tied to rests/game time
- [x] Consumables and potions: entered rolls/outcomes, 2014 combat action costs, shared Combat Items controls
- [x] Portable custom items, saved with the character and retained by import/export
- [x] Features screen: origin groups, passive/active/triggered details, uses/shared pools, recharge, favorites and supported explicit toggles
- [x] Gate: general characters, cross-screen values, offline reload and exact Undo at phone/desktop widths; manual QA documented

### MA — Accounts + cloud sync (after M9; going online waits for hosting, Q1/Q28)
- [x] Sync-ready local storage: per-record change times and deletion markers, with migration and no behavior change for guests
- [x] Database schema and row-level security policies in the repo, so each account can only read and write its own rows
- [x] Optional sign-in screen, hidden until a sync provider is configured; guest mode stays the default
- [x] Two-way sync through the persistence layer with revision conflict checks; conflicts ask the user, never silently overwrite
- [x] Gate: guest-only use unchanged; sync tested against a local or mocked provider; hosting steps documented for the user

### M10 — Effects editor + Conditions
- [x] Engine: effects can end at your next turn's start or end, or at a rest; carry damage defenses; can be edited in place
- [x] Effect editor in Combat, Dashboard and Exploration: duration, end trigger, conditions, number modifiers, defenses, note; Sheet shows effect defenses
- [x] Condition consequences: advantage, disadvantage and auto-fail reminders on checks, saves and attacks; exhaustion levels; condition details in own words
- [x] Gate: phone and desktop widths, exact Undo, reload; manual QA documented

### M11 — Campaign Setup: sources + optional rules
- [x] Engine: campaigns save sources and optional rules (defaults off); choices from a removed book are kept and listed as conflicts
- [x] Campaign Setup: book and optional-rule toggles with conflict preview; enabling a book never enables its rules
- [x] Rules in play: rest variants change rest length; variant encumbrance slows you and adds roll reminders; potion as bonus action
- [x] Gate: phone and desktop widths, Undo, reload; feats, multiclassing and Tasha options recorded for M14

### M12 — Journal + Companions
- [x] Journal engine: narrative traits, notes, quests, NPCs, locations and dated session notes
- [x] Journal UI: character narrative, markdown notes, quests, NPCs, locations and session logs
- [x] Companions engine: companion definitions, owner-derived stats, independent live state and commanding
- [x] Companions UI: companions screen and combat actions with turn economy integration
- [x] Gate: phone and desktop widths, Undo, reload, manual QA documented

## Backlog (not scheduled)

- Optional dice roller with roll history
- Parchment theme
- Shared campaign view for a party or DM (after accounts)
- Party view (several characters side by side)
- Print / PDF character sheet export
- Spell import from user-pasted text
- Session recap generated from the event log

## Session log

Newest first. One line per task, about 25 words at most.

- 2026-11-06 — M12 gate: Journal and Companions pass at 375 and 1440 px with Undo and reload; manual QA listed. Next: M13.
- 2026-11-06 — M12 Companions UI: screen with HP, conditions, uses, initiative and commanding that spends your turn economy; Mastiff and horse templates; sidekick option deferred (Q30).
- 2026-11-06 — M12 Companions engine: definitions, owner-derived stats, own HP, conditions and uses, commanding, timed expiry, undo and export checks; SRD creature import deferred (D130).
- 2026-11-06 — Journal review fixes: "&" title, local session date, 44 px quest checkbox, DATA.md schema; Markdown shown unformatted (D129).
- 2026-11-06 — M12 Journal UI: responsive narrative, markdown notes, quests, NPCs, locations and session logs with live Undo and persistence.
- 2026-11-06 — M12 Journal engine: narrative traits, notes, quests, NPCs, locations and session notes with validation, persistence and exact Undo.
- 2026-11-06 — M11 complete: books and optional rules verified at phone and desktop width, exact Undo, reload; manual QA listed. Next: M12.
- 2026-11-06 — M11 rules in play: rest length variants, variant encumbrance speed and reminders, encumbrance Off, self-drunk potions as bonus action.
- 2026-11-06 — M11 settings: book and optional-rule checkboxes, encumbrance and rest choices; untouched rules are not written.
- 2026-11-06 — M11 engine: campaigns save books and optional rules; removing a book keeps its choices and warns which ones; PHB stays on.
- 2026-11-06 — M10 complete: effect with condition and AC bonus checked at phone and desktop width, exact Undo, reload; manual QA listed. Next: M11.
- 2026-11-06 — M10 conditions: roll reminders for conditions and exhaustion, save tags, condition details in own words, exhaustion levels listed.
- 2026-11-06 — M10 effect editor: add or edit effects with timing, conditions, bonuses and damage defenses; Sheet and damage pad show effect defenses.
- 2026-11-06 — M10 engine: effects end at your next turn's start/end or at a rest, carry damage defenses, and can be edited; concentration survives a triggered end.
- 2026-11-06 — MA complete: guest builds unchanged and free of account code; sync verified with an in-memory cloud; HOSTING.md lists the steps to go online. Next: M10.
- 2026-11-06 — Sign-in: Settings shows an Account section only in builds with a provider; email sign-in, Sync now, conflict choices. Guest builds omit the code. Next: MA Gate.
- 2026-11-06 — Two-way sync engine: uploads, downloads and deletions per campaign/character with revision checks; conflicts wait for a choice. Tested with an in-memory cloud. Next: sign-in.
- 2026-11-06 — Account database schema: one row per campaign or character, server revisions, owner-only access, no hard deletes. Static test checks the rules. Next: sign-in.
- 2026-11-06 — Sync-ready storage: each campaign and character gets a change stamp and deletion marker; older saves back-fill on load. No visible change. Next: database schema.
- 2026-11-06 — M9 complete: a non-Fool fighter checks AC, feature uses, Home, offline reload and exact Undo. All SRD classes now track common limited uses. Next: MA.
- 2026-11-06 — Features screen: origin groups, activation, uses with pips, Use, favorites. No toggles yet; no feature defines one (Q25). Next: M9 Gate.
- 2026-11-06 — Custom items: create, edit and delete per-character items; weapons/armor copy a base item's stats and proficiency; travel with export. Next: Features screen.
- 2026-11-06 — Consumables: potions heal by entered roll, spend the action in combat, ally-given potions revive; shared Inventory and Combat Items controls. Next: custom items.
- 2026-11-06 — M9 charges: SRD magic items, charge counters, dawn/rest recharge prompts with entered rolls, exact Undo. Consumables next.
- 2026-11-06 — M9 attunement: record bonds with limits, manual rest reminders and exact Undo. Paused for user review; charges next.
- 2026-11-06 — M9 currency and weight: adjust actual coins with previews and Undo; show bundles, unknown weights and computed capacity. Next: attunement and charges.
- 2026-11-06 — M9 imports: reject incomplete item state without changing saved data; valid legacy records retain edits and Undo. Next: currency and weight.
- 2026-11-06 — M9 catalogue: add separate items, edit counts/notes/locations and confirm removal with retained contents and exact Undo. Next: import validation, currency and weight.
- 2026-11-05 — M9 Inventory: independent quantities, equipment and container groups sync AC/attacks, warnings and exact Undo across reloads. Next: catalogue items and notes.
- 2026-11-05 — M9 started: planned inventory, portable custom items, charges, consumables and Features as separate tasks. Next: quantities, equipment and container groups.
- 2026-11-05 — M8 complete: Phase 1 covers combat, offline play, backups, Reset and Undo. Manual device/session checks documented. Next: M9 Inventory and Features.
- 2026-11-05 — M8 Reset: preview and confirm resource recovery, with prior-workspace backup, exact Undo and retained belongings/time. Next: Phase 1 gate.
- 2026-11-05 — M8 backups: retain ten whole-workspace recovery points before imports/reset and after long rests; failed saves preserve Retry snapshots. Next: Settings Reset.
- 2026-11-05 — M8 controls: preferences visibly pause while saving; Phase 1 entry points and standard actions support commands and Undo. Next: automatic backups.
- 2026-11-05 — M8 accessibility: keypad activation, desktop Escape, focus rings and readable state labels pass keyboard and contrast checks. Next: dead-button review.
- 2026-11-05 — M8 PWA: installation, offline routes, commands and Undo work locally; updates preserve open drafts. Next: keyboard and contrast.
- 2026-11-05 — M8 acceptance: fresh Fool runs through combat, reactions, rests, reloads and Undo with all five screens synchronized. Next: PWA and offline use.
- 2026-11-05 — M7 complete: Exploration reuses clock, casting, effects and Sheet checks; rituals, expiry and Undo share saved state. Next: M8 hardening.
- 2026-11-05 — M7 level-up: review class, HP, Hit Dice and resource changes; milestone and XP prompts respect recorded advancement, warnings and Undo. Next: Exploration.
- 2026-11-04 — M7 ability entry: rolled, array and point-buy edits separate bases from bonuses; previews and Undo preserve current resources. Next: minimal level-up.
- 2026-11-04 — M7 Sheet Edit: staged choices and noted overrides save, reset and undo across screens; resource corrections keep normal spending. Next: ability entry.
- 2026-11-04 — Shared character status/history row leaves more phone space; one Undo follows character and workspace changes. Next: Sheet Edit mode and overrides.
- 2026-11-04 — Shortened docs, deferred D80 review and planned M12 companions. Next: shared character status/log row with one Undo.

- 2026-11-04 — M7 Sheet: identity, Inspiration, calculated stats, defenses and accessible breakdowns are live. Next: Edit mode and noted overrides.
- 2026-11-04 — M6 complete: manual clock, expiry, rest recovery and Undo work together; oversized HUD editors now scroll. Next: M7 Sheet sections.
- 2026-11-04 — M6 Dashboard: live resources, favorites, conditions and history replace fixtures; layout and focus fixes landed. Next: manual clock and gate.
- 2026-11-03 — M6 rest clock: rest durations, midnight crossing, expiry and exact Undo verified. Next: live Dashboard.
- 2026-11-03 — M6 Long Rest: full recovery preview, interval warnings and optional prepared-spell review are live; focus is fixed. Next: rest clock verification.
- 2026-11-03 — M6 Short Rest: Hit Dice drafts, Song of Rest and recovery previews are live; mixed-die focus is fixed. Next: Long Rest.
- 2026-11-03 — M5 complete: End Combat settles time, expires due effects and preserves surviving state with Undo. Next: M6 Short Rest.
- 2026-11-03 — M5 effects/log: saved countdowns, source endings and complete history with Undo are live; focus and touch targets improved. Next: End Combat.
- 2026-11-03 — M5 bonus-action spells: 2014 restrictions work in both orders; default filtering follows available choices. Next: effect countdowns and history.
- 2026-11-03 — M5 reactions: off-turn actions share one reaction pool with warnings and Undo; final-use focus is fixed. Next: bonus-action-spell rule.
- 2026-11-03 — M5 HP/saves: damage, healing, concentration checks and death saves are live; Q21 remains open. Next: reactions.
- 2026-11-03 — M5 actions: equipped weapons, standard actions, class spells and owned features are live; self Invisibility ends appropriately. Next: HP and saves.
- 2026-11-03 — M5 turn controls: Start/End Turn, economy corrections and movement use saved state and game time. Next: action tabs and attacks.
- 2026-11-03 — M5 combat start: saved combat status and rounds replace fixtures; initiative remains a reference, with refresh and Undo. Next: turn controls.
- 2026-11-03 — M4 complete: spell management supports class limits, preparation, replacement, retained conflicts and tags without changing play state. Next: M5 combat start.
- 2026-11-03 — M4 filters/favorites: search and filters use live metadata; saved stars retain useful focus through removal. Next: spell management.
- 2026-11-03 — M4 casting: shared flows handle slots, rituals, healing and class modifiers with clear warnings and retained choices. Next: filters and favorites.
- 2026-11-02 — M4 previews: class-specific metadata and slot availability stay live; phone focus and high-level touch targets improved. Next: casting and rituals.
- 2026-11-02 — M4 groups/slots: selected spells, casting stats and slot controls share saved state and Undo. Unsupported associations remain explicit. Next: previews.
- 2026-11-02 — M3 complete: Settings saves automation and motion preferences, respects system motion and shares character transfer controls. Reset scope remains Q20. Next: Spellbook.
- 2026-11-02 — M3 Reference: 2014 links, shared bookmarks and Credits are live; removal focus is fixed. Next: Settings.
- 2026-11-02 — M3 Campaign Setup: saved rules guide creation while existing HP entries remain preserved; management Undo handles older levels. Next: Reference.
- 2026-11-02 — M3 hub: saved campaigns, character creation, copies, deletion and JSON transfer are live with previews and management Undo. Next: Campaign Setup.
- 2026-11-02 — M3 persistence: local saves, validation, Retry, durable Undo and stale-window protection preserve characters and history. Next: live hub and management.
- 2026-11-02 — M3 HUD: saved characters drive stats, adjustments, conditions, effects, warnings and Undo; other screen bodies remain previews. Next: persistence.
- 2026-11-02 — M3 routes: all destinations now resolve, including Companions, Credits and future-phase notices. Next: live HUD and shared state.
- 2026-11-02 — M3 layouts: collapsible details, sidebar, tablet drawer and phone navigation share readable workspaces and return focus. Next: routes and placeholders.
- 2026-11-02 — Change tracking: timestamped plain-language changelog and per-task commits join the workflow; initial project history committed. Next: M3 layouts.
- 2026-11-02 — M2 complete: the full Fool acceptance sequence passes in one session; rest previews and save choices await UI. Next: M3 layouts.
- 2026-11-02 — M2 expected values: Fool calculations, Song of Rest and minimal level-up match the fixture; XP visibility awaits UI. Next: acceptance scenario.
- 2026-11-02 — M2 commands: spells, combat, HP, effects, time, rests, corrections and minimal level-up are undoable. Next: expected values and acceptance.
- 2026-11-02 — M2 command runner: checks, explicit overrides, validated changes, saved history and linear Undo are ready. Next: commands.
- 2026-11-02 — M2 calculations: character stats, resources, attacks and spellcasting include explanation parts; exhaustion and movement conditions apply. Next: command runner.
- 2026-11-02 — M2 Fool content: required references, original summaries and mechanics now merge into a validated registry; all fixture references resolve. Next: calculations.
- 2026-11-02 — M2 SRD import: pinned 2014 data maps into local references; missing Fool entries identified. Next: original summaries and mechanics.
- 2026-11-02 — M2 seed: campaign #273, Fool build and current state validate together; features derive from references. Next: SRD import.
- 2026-11-02 — M2 schemas: campaign, character and reference shapes validate; the game clock uses seconds. Next: seed fixture.
- 2026-11-02 — M1 signed off by the user; M2 started. Next: types and schemas.
- 2026-11-01 — Campaign HP floor added for low rolls; a stale development page was resolved by restarting the server. Next: M1 sign-off.
- 2026-11-01 — M1 review: campaign hub, setup and creation frames added; resources and spell states clarified; turn order removed. Next: user sign-off.
- 2026-11-01 — M1 frames: responsive Combat, Spellbook and Dashboard use fixtures, shared components and reduced motion; actions remain previews. Next: user sign-off.
- 2026-11-01 — M0 complete: app foundation, styling tokens, local fonts and project checks are ready. Next: mobile Combat frame.
- 2026-11-01 — Docs aligned with Fool data, campaign rules, public content limits and locked HP entries. Next: project setup.
- 2026-11-01 — Planning documents created for scope, design, data, decisions, progress and acceptance. Next: project setup.
