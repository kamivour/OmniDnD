# OmniDnD — Progress

**Current milestone:** M7 — Character Sheet + Exploration + level-up.
**Next up:** Ability entry by campaign method, with bonuses listed separately.

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
| M7 | Character Sheet + Exploration + level-up | 1 | doing | All computed values match TEST_CHARACTER §4 |
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
- [x] Short Rest dialog: Hit Dice spending, Song of Rest, preview diff
- [x] Long Rest dialog: 24 h + 0 HP checks, Hit Dice half cap, preview diff
- [x] Rests advance game clock
- [x] Dashboard: resources, effects, conditions, quick access, recent log
- [x] Gate: scenario steps 9–14 through real controls, including standalone time advancement

### M7 — Character Sheet + Exploration
- [x] Sheet sections (SPEC §5) with breakdown tooltips
- [x] Unify character status/log row with one Undo (gate before Sheet Edit mode)
- [x] Edit mode + overrides with ✎ marker
- [ ] Ability scores: enter base per campaign method (rolled = typed, standard array = assign, point buy = 27-point check); bonuses listed separately
- [ ] Level up (minimal): milestone button / XP threshold prompt; enter roll or take average; +1 Hit Die; XP hidden in milestone mode
- [ ] Exploration: reuse Dashboard GameClockControl (D91); utility spells/rituals, skills + passives, active effects

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

Newest first. One line per task, about 25 words at most.

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
