# OmniDnD — Progress

**Current milestone:** M6 — Rest + Dashboard (live).
**Next up:** Short Rest dialog with Hit Dice, Song of Rest, and preview diff.

Status: `todo` · `doing` · `done` · `blocked`

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
| M6 | Rest + Dashboard (live) | 1 | doing | Scenario steps 9–14 work in UI |
| M7 | Character Sheet + Exploration + level-up | 1 | todo | All computed values match TEST_CHARACTER §4 |
| M8 | Phase 1 hardening | 1 | todo | Definition of done (SPEC §8) met |
| M9 | Inventory + Features screen | 2 | todo | |
| M10 | Effects editor + Conditions | 2 | todo | |
| M11 | Campaign Setup: sources + optional rules | 2 | todo | |
| M12 | Journal + Companions | 2 | todo | |
| M13 | Searchable Reference | 2 | todo | |
| M14 | Full level-up wizard + more classes + multiclass | 3 | todo | |
| M15 | Ally/enemy tracker | 3 | todo | |
| M16 | Dice roller, themes, sync, more books | 4 | todo | |

Phase 2+ milestones get detailed checklists when Phase 1 is done.

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
- [ ] Short Rest dialog: Hit Dice spending, Song of Rest, preview diff
- [ ] Long Rest dialog: 24 h + 0 HP checks, Hit Dice half cap, preview diff
- [ ] Rests advance game clock
- [ ] Dashboard: resources, effects, conditions, quick access, recent log

### M7 — Character Sheet + Exploration
- [ ] Sheet sections (SPEC §5) with breakdown tooltips
- [ ] Edit mode + overrides with ✎ marker
- [ ] Ability scores: enter base per campaign method (rolled = typed, standard array = assign, point buy = 27-point check); bonuses listed separately
- [ ] Level up (minimal): milestone button / XP threshold prompt; enter roll or take average; +1 Hit Die; XP hidden in milestone mode
- [ ] Exploration: game clock controls, utility spells/rituals, skills + passives, active effects

### M8 — Phase 1 hardening
- [ ] Playwright acceptance scenario at mobile + desktop sizes
- [ ] PWA: installable, offline after first load
- [ ] Keyboard pass; contrast check; reduced motion check
- [ ] No dead buttons
- [ ] Auto backups (before import/reset, after long rest)
- [ ] Settings reset behavior (Q20), with backup and confirmation
- [ ] SPEC §8 checklist all true

## Backlog (not scheduled)

- Optional dice roller with roll history
- Parchment theme
- Cloud sync / multi-device
- Party view (several characters side by side)
- Print / PDF character sheet export
- Spell import from user-pasted text
- Session recap generated from the event log

## Session log

Newest first. One line per work session: date — what changed — what's next.

- 2026-11-03 — M5 complete: End Combat runs the existing engine command from the header, settles only the final six seconds, expires due timers, preserves surviving state, and restores usable status focus (D84). Available before the first turn, off-turn, and at zero HP/dead. 788 unit tests and 318 full browser checks pass without retries (32 expected width skips), including 12 new End Combat checks; typecheck, lint and build pass. 375/1440 layouts and exact reload/Undo checked; final M5 manual QA added. Next: M6 Short Rest dialog with Hit Dice, Song of Rest and preview diff.

- 2026-11-03 — M5 effects/log: live concentration and personal effects derive round countdowns from saved deadlines, with logged End controls and exact Undo. Sticky history opens all saved events with game timestamps and Override/Undone markers; desktop shows five recent entries (D83). Reproduced/fixed imported shorter self-effect expiry leaving an invalid concentration link and End targets below 44 px. 783 unit tests and 60 focused browser checks pass without retries (4 expected width skips); typecheck, lint and build pass. 375/1440 layouts, sticky access, focus and long names checked; manual QA added. Next: End Combat and final M5 checks.

- 2026-11-03 — M5 bonus-action-spell rule verified in both orders, including BA cantrips, own/off-turn reactions, nonspell bonus features, Manual/Blocks, flag reset and exact durable Undo. Default Spells visibility now reuses the engine's existing 2014 rule check; Show all and explicit action tabs retain exceptions without changing selections (D82). Five visibility regressions reproduced before the fix. 772 unit tests, 12 focused bonus-spell browser checks and 14 shared action regressions pass; typecheck, lint and build pass. 375/1440 warning/retained-choice layouts checked; manual QA added. Next: effect countdowns and Combat log/Undo.

- 2026-11-03 — M5 reactions verified: off-turn Cutting Words, melee opportunity attacks, Readied responses and reaction spells share one reaction pool, with second-use warnings, explicit override, Manual behavior and durable Undo. Reproduced/fixed actual Readied responses bypassing dead checks and final feature-use focus loss (D81); manual economy corrections remain available. 764 unit tests and 42 focused browser checks pass without retries, including 16 reaction checks (4 expected width skips); typecheck, lint and build pass. 375/1440 layouts checked; manual reaction QA added. Next: bonus-action-spell rule.

- 2026-11-03 — M5 HP/saves: shared live HUD/Combat damage, heal, temp and critical-at-zero inputs; durable per-damage concentration requests with explicit logged Pass/Fail and exact Undo (D79). Manual creates no new reminders and preserves old checks for explicit review. Death saves support natural d20 plus manual external modifiers, stable/dead states and natural1/20 outcomes; absorbed damage at0 still adds failures (D80), with Q21 flagged for the ambiguous massive-damage threshold. Real browser failures reproduced and fixed desktop HUD warning dismissal and revival focus. 758 unit tests and 266 full browser checks pass without retries (32 expected skips); typecheck, lint and build pass. 375/1440 HP/save layouts checked; manual QA added. Next: off-turn reactions/second-use warning.

- 2026-11-03 — M5 actions: live equipped weapons, named standard actions, class-specific spells/shared casting, and owned feature pools replace action fixtures. Strict named commands validate weapon availability; Dash expires at End Turn with exact Undo, and spell-created self Invisibility ends on actual attacks/casts without deleting unknown ally targets (D77–D78). Default Spells view follows economy with a view-only Show all override. Zero-quantity gear and dead/missing-pool feature uses cannot grant actions; flat damage cannot be negative. 689 unit tests and 248 full browser checks pass without retries (32 expected skips); typecheck, lint and build pass. 375/768/1440 layouts checked; action manual QA added. Next: HP/concentration-save/death-save panel.

- 2026-11-03 — M5 turn controls/economy: Start/End Turn, manual action/bonus/reaction toggles, and movement use the existing engine commands. The first turn keeps the clock; later turns advance 6 seconds and reset economy. End Turn retains spent resources until the next turn. Derived speed and saved flags drive the screen; warnings preserve Cancel/override/focus behavior on touch and keyboard. 620 unit tests and 30 focused Combat browser checks pass without retries (4 expected width skips); typecheck, lint and build pass. 375/1440 layouts checked; manual turn QA added. Next: action tabs, standard actions, weapon attacks.

- 2026-11-03 — M5 combat start: saved combat state and round/turn display replace the fixture header; initiative is derived and remains a reference. Starting combat is one logged command, preserves resources/clock, focuses the updated status, and supports reload/Undo. Other Combat controls remain an explicit preview. 620 unit tests and 18 focused Combat browser checks pass (4 expected width skips); typecheck, lint and build pass. 375/1440 layouts checked; startup manual QA added. Next: economy bar and Start/End Turn.

- 2026-11-03 — M4 complete: Manage adds/removes known and prepared spells, derives separate class limits, replaces atomically, retains imported conflicts for explicit cleanup, and edits ordered character tag overrides (D76). Selection/tag changes preserve play state and support reload/Undo. 620 unit tests and 216 full browser checks pass without retries; typecheck, lint and build pass. Manage/tag layouts checked at 375/1440; final M4 manual QA added. Next: M5 Start combat and saved round counter.

- 2026-11-03 — M4 filters/favorites: school and actual minute/hour costs join search, level, type, concentration, ritual, castable resources and saved favorites. Stars use strict logged commands with reload/Undo and retain unrelated references; removing a filtered row restores focus (D75). 559 unit tests and 204 full browser checks pass without retries; typecheck, lint and build pass. 375/1440 layouts and manual QA checked. Next: Manage selections/limits/replacement/tag overrides.

- 2026-11-03 — M4 live casting: shared row/mobile/pinned flow with one logged engine command, exact class modifiers, computed dice/healing preview, opt-in self results, eligible rituals and clock advancement (D74). Unknown/unprepared spell warnings retain override/Manual behavior; unavailable healing modifiers block. Warning Cancel preserves choices/focus, success closes correctly, and depleted pinned controls get a usable focus fallback. 537 unit tests and 196 full browser checks pass without retries; typecheck, lint and build pass. Phone/desktop casting QA added. Next: filters/search/favorites.

- 2026-11-02 — M4 previews: live class-specific spell attack metadata, current slot selection/fallback, no-slot disabled Cast, source-neutral references, and mobile focus restoration (D73). Slot levels wrap into 56×48 px minimum targets; a level 20 regression reproduced 31 px targets before the fix. 501 unit tests and 176 full browser checks pass without retries; typecheck, lint and build pass. Preview layouts checked at 375/768/1440 px; manual QA added. Next: live casting and rituals.

- 2026-11-02 — M4 spell groups/slots: selected registry spells, engine-derived DC/attack/limits, actual concentration, empty-book slot rows, and logged −/+ or pip adjustments shared with the HUD and durable Undo (D72). Unsupported imported casting associations keep metadata without invented stats; Pact Magic Spellbook support remains Phase 3. 500 unit tests and 168 full browser checks pass without retries; the final phone screenshot check also passes. Typecheck, lint and build pass; 375/1440 layouts checked. Manual slot QA added. Next: live previews/pinned details, then casting.

- 2026-11-02 — M3 complete: Settings now saves automation/reduced motion through logged commands with durable Undo, respects OS motion preferences, and reuses hub character JSON transfer controls (D71). Preference controls retain keyboard focus while saving. 488 unit tests and 158 full browser checks pass without retries; typecheck, lint and build pass. Phone/desktop Settings and import previews checked. M3 manual QA consolidated in MANUAL_QA.md. Reset scope recorded as Q20 for M8. Next: M4 live Spellbook groups/slot controls.

- 2026-11-02 — M3 Reference: eight external cards with 2014 destinations/edition notes, shared HTTP(S) bookmarks with durable management Undo, and Credits with SRD attribution, icon sources/authors, and local icon/font license notices (D70). 454 unit tests pass; 148 browser checks pass after focused reruns for a fixed removal-focus race and two transport errors. Typecheck, lint and build pass; 375/1440 layouts checked. Manual Reference QA added. Next: Settings.

- 2026-11-02 — M3 live Campaign Setup: create/save through management commands, retained-entry notes, and new-character inputs following saved methods. Per-entry HP floors preserve legacy low rolls and negative-CON HP when rules change (D69). Management Undo also survives character Undo removing an older level. 379 unit tests and 140 browser checks pass; one host transport error in a skipped case cleared on rerun. Typecheck, lint and build pass; phone/desktop visually checked. Manual campaign QA added. Next: Reference links/bookmarks and Credits.

- 2026-11-02 — M3 live hub and blank creation: saved campaign/character cards, copy/delete confirmation, durable management Undo, validated JSON preview/import/export, collision-safe copies, and source-filtered creation with derived racial bonuses/HP/XP (D67–D68). 343 unit tests and 132 full browser checks pass; the final corrected-form checks also pass at both widths. Typecheck, lint and build pass. Manual management QA added. Next: live Campaign Setup save/create.

- 2026-11-02 — M3 persistence: atomic IndexedDB workspace saves, startup validation/hydration, serialized queue, save status/Retry, durable toolbar Undo, seed-once marker, and stale-window revision guard (D66). Invalid data and undo histories are preserved with a load error. 253 unit tests and 118 browser checks pass; typecheck, lint and build pass. Manual persistence QA added. Next: live Campaigns hub and character management.

- 2026-11-02 — M3 live HUD: validated seed loader and Zustand command store; derived stats, HP/slot/resource adjustments, basic conditions/effects, warnings, command notes, toast Undo and focus restoration (D65). 234 unit tests and 108 browser checks pass; typecheck, lint and build pass. Manual HUD QA added. Next: Dexie persistence; other screen bodies remain static until M4–M6.

- 2026-11-02 — M3 routes: added Companions to sidebar/More, Credits aliases, and explicit future-phase notices. All navigation screens are routed. 224 unit tests and 47 focused browser checks pass; typecheck, lint and build pass. Next: live HUD and shared command store.

- 2026-11-02 — M3 layouts: shared collapsible Details panel, desktop sidebar collapse, tablet right drawer (touch/mouse), mobile sheets/nav, focus restoration and container-sized workspaces. 224 unit tests; 69 browser checks pass with optional real-HTTP forwarding after Windows socket failures (D63–D64). Manual checks in MANUAL_QA.md. Next: routes and phase placeholders.

- 2026-11-02 — Change tracking: `docs/CHANGELOG.md` (timestamped, plain language, backfilled from this log) and the first git commit (M0–M2). AGENTS workflow now adds a changelog entry and one commit per task (D62). Next: M3 layouts.
- 2026-11-02 — M2 done: `src/engine/commands/acceptance.test.ts` runs TEST_CHARACTER §6 steps 1–16 in order on one session (combat, concentration swap, Cutting Words, reaction override, bonus-action spell rule, expiry, both rests, Hit Dice cap, undo, manual slot fix, seed checks). §6 steps 1–3 reworded for D41 (concentration only, no effect on you) and D42 (no initiative). Rest previews and "Choose Pass" are UI steps (M5, M6). 224 tests. Next: M3 layouts.
- 2026-11-02 — M2 §4 values: all engine rows of TEST_CHARACTER §4 are covered by `sheet.test.ts` (plus the Song of Rest d6) and `level.test.ts` (level up to 4, rolled 5: max HP 25, Hit Dice 4d8). "XP field hidden" is a UI check (M3 level-up task). 208 tests. Next: acceptance scenario.
- 2026-11-02 — M2 Commands in `src/engine/commands/`: `castSpell` (slots, rituals, concentration, self effects, healing, casting time on the clock), `endConcentration`, `adjustSlot`, `useFeature` (Cutting Words spends Bardic Inspiration and the reaction), `adjustFeatureUses`, `applyDamage` / `heal` / `setTempHp` / `rollDeathSave` (concentration DC, massive damage, stability), conditions, exhaustion and effects, combat (rounds on the clock, economy, bonus-action spell rule), `advanceTime` (effect expiry, dawn), `completeShortRest` (Hit Dice + Song of Rest), `completeLongRest` (24 h warn, half Hit Dice), `adjustHitDice`, `levelUp` (D54–D61). Item commands and `overrideValue` wait for their phases (D61). 207 tests. Next: §4 tests, acceptance scenario.
- 2026-11-02 — M2 Command runner: `runCommand` in `src/engine/commands/runner.ts` runs checks (Block / Warn / Info), applies the command with Immer `produceWithPatches`, re-validates the result, and returns the log event; "Do anyway" (`force`) marks it `override`. `undo` reverts the last event that is not undone, marks it, and logs an undo event; the log keeps 500 events (D53). 128 tests. Next: Commands.
- 2026-11-02 — M2 Calculations: `computeSheet` in `src/engine/calc/sheet.ts` derives abilities, saves, skills (expertise, JoAT), passives, initiative, AC, speed, max HP, Hit Dice, spellcasting, slots (incl. multiclass and Pact Magic), features with uses and dice, weapon attacks, and carrying capacity; each number carries its parts for breakdowns. Exhaustion and speed-zero conditions apply (D52). The Fool's §4 values and the level-up to 4 pass. 117 tests. Next: Command runner.
- 2026-11-02 — M2 The Fool content: Charlatan, False Identity, Dissonant Whispers, deck of marked cards in `data/content/`; own-words summaries for The Fool's SRD spells and features in `data/content/summaries.json`; activation, uses, dice, JoAT modifier, spell tags and effects in `data/mechanics/`. Engine `buildRegistry` merges the layers and re-validates (D51). Every seed id resolves. 82 tests. Next: Calculations.

- 2026-11-02 — M2 SRD import: `npm run import:srd` maps 5e-database (pinned commit) into `data/srd/` (319 spells, 328 features, 12 classes, 12 subclasses, 13 races, 1 background, 197 items, 15 conditions) via pure mappers in `scripts/srd/map.ts` (D50). Missing for The Fool: `background.charlatan`, `spell.dissonant-whispers`, `item.deck-of-marked-cards`. 69 tests. Next: The Fool content.
- 2026-11-02 — M2 seed `data/characters/the-fool.json` (export file shape, D49) with campaign #273, §2 build and §3 live state; `ExportFileSchema` cross-checks; derived features (D48). 40 tests. Next: SRD import.
- 2026-11-02 — M2 types + zod schemas in `src/engine/schema/` (D47), game clock in seconds (D46). 21 schema tests. Next: seed fixture.
- 2026-11-02 — M1 signed off by the user (D45). M2 started. Next: types + zod schemas.
- 2026-11-01 — Blank landing page was a stale dev-server module after mid-edit HMR (no code bug); server restarted. New campaign setting for low HP rolls (D44, default allow negative): `levelHp` / `maxHp` take the floor, New character uses it. Unit 11 pass, e2e 58 pass (8 flaky on retry). Next: user sign-off (M1 gate).
- 2026-11-01 — M1 review round 1: app now opens on a Campaigns hub with campaign settings and new-character frames; Dashboard resources split into groups with `PipStepper` and description cards; concentration shown apart from effects on you; spell type tags, tinted rows, Type filter, Active badge; Combat drops turn order. D37–D43, Q19. e2e 56 pass (6 flaky on retry). Next: user sign-off (M1 gate).
- 2026-11-01 — M1 frames built on fixture data: Combat (mobile stack, lg 2 columns, xl 3 columns), Spellbook (filters, slot rows, hover/pin, cast sheet with slot picker), Dashboard. Core components, game-icons, motion tokens with reduced motion. Buttons show a toast only. e2e covers all three frames at 375 / 1440 px. Next: user sign-off (M1 gate).
- 2026-11-01 — M0 done: Vite 8 + React 19 + TS 6 strict + Tailwind 4 tokens, Vitest 5, Playwright (375 / 1440 px), ESLint 10 with engine-purity rule, Prettier, self-hosted fonts, folder layout, git init (no commits). Next: M1 Frame C.
- 2026-11-01 — Docs updated with real Fool data (max HP 19, milestone, rolled HP/abilities), public-repo rules, campaign character rules, locked per-level HP. Next: M0.
- 2026-11-01 — Planning docs created (AGENTS, SPEC, DESIGN, DATA, DECISIONS, PROGRESS, TEST_CHARACTER). Next: M0.
