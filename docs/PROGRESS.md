# OmniDnD — Progress

**Current milestone:** M39 Themes done; all planned milestones complete (see PLAN.md).
**Next up:** Manual QA for M26 and M39 by the user.

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
| M12 | Journal + Companions | 2 | done | Journal entries and companions save, show on every screen, survive reload and Undo |
| M13 | Searchable Reference | 2 | done | Any bundled rule can be found by name; quick tables work offline |
| M14 | Full level-up wizard + more classes + multiclass | 3 | done | Every SRD class reaches level 20 through the wizard; multiclassing and feats follow campaign toggles |
| M15 | Ally/enemy tracker | 3 | done | A whole fight can be tracked: order, HP and conditions for allies and enemies, all undoable |
| M16 | Dice roller, themes, more books | 4 | done | Optional dice roller, Parchment theme, backups, Xanathar's and Tasha's packs; rules review done with the user |
| M17 | Newbie-friendly character creation | 5 | done | Step-by-step or one-page creation with own-words guidance and suggestions for every class, race and background |
| M18 | Print and PDF sheet | 5 | done | Any character prints to paper or PDF from the browser, offline |
| M19 | Physical checks and spell components | 6 | done | Jump, carry, breath and travel numbers come from the engine with breakdowns; casting says when a focus covers the material |
| M20 | Tools directory | 6 | done | Outside tools grouped by what you want to do, in our own words, with working links |
| M21 | Find and Related links | 6 | done | One search box reaches any screen, rule, tool or character item in two steps or fewer |
| M22 | Accounts, finished | 8 | done | Automatic sync, password reset, display name; see [PLAN.md](PLAN.md) |
| M23 | Tutorial | 5 | done | First visit on each device: guide with Skip and Replay; see [PLAN.md](PLAN.md) |
| M24 | Roles and shared campaigns | 7 | done | DM or player role; party sees every character live, each player changes only their own; see [PLAN.md](PLAN.md) |
| M25 | DM party overview | 7 | done | Read-only overview of the whole party for the DM; see [PLAN.md](PLAN.md) |
| M26 | Friend-testing fixes | 5 | done | New players on a phone create a character without confusion and find sign-up; see [PLAN.md](PLAN.md) |

| M27 | PHB races and Beast Master | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M28 | PHB martial subclasses | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M29 | PHB caster subclasses | 18 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M30 | PHB non-SRD spells | 39 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M31 | Tasha's options | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M32 | Tasha's spells | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M33 | Tasha's subclasses, part 1 | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M34 | Tasha's subclasses, part 2 | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M35 | Xanathar's options | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M36 | Xanathar's spells | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M37 | Xanathar's subclasses, part 1 | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M38 | Xanathar's subclasses, part 2 | 9 | done | Content in own words, filtered by book; see [PLAN.md](PLAN.md) |
| M39 | Themes | 10 | done | Midnight, glass, water and D&D place themes with title effects; see [PLAN.md](PLAN.md) |

All remaining milestones are planned below. Still build one milestone at a time; later screens stay placeholders until their milestone starts.

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

### M13 — Searchable Reference
- [x] Rules search: name search over bundled 2014 data; conditions show their SRD text
- [x] Quick tables and rules summaries in our own words
- [x] Gate: phone and desktop widths, reload, manual QA documented

### M14 — Full level-up wizard + more classes + multiclass
- [x] SRD creature import: SRD monster statblocks into `data/srd/`, searchable in Reference (D130); companion templates and the M15 tracker read from it
- [x] Engine, multiclass: `levelUp` can add a new class only when the campaign allows multiclassing; checks 2014 ability minimums for the old and new class; grants the smaller multiclass proficiency set
- [x] Engine, level choices: subclass at the class's subclass level; ASI (+2 or +1/+1, cap 20) or a feat only when feats are on; class picks such as Fighting Style, Expertise, Favored Enemy, Metamagic, Invocations
- [x] Engine, spells on level-up: new cantrips and spells known per class table, Wizard adds two spellbook spells, known casters may swap one spell; prepared counts recompute
- [x] Level-up wizard UI: class, HP, new features, subclass, ASI or feat, class picks, spells, review; applies as one undoable command; replaces the minimal level-up
- [x] Martial and half-caster classes end to end, levels 1–20: Barbarian, Fighter, Monk, Rogue, Paladin, Ranger; features, resources and slots checked per level
- [x] Full casters end to end, levels 1–20: Bard, Cleric, Druid, Sorcerer, Warlock, Wizard; Pact Magic and Mystic Arcanum, Sorcery Points, Wild Shape uses, Channel Divinity
- [x] Feats: SRD Grappler plus PHB feats in our own words in `data/content/`; ability, HP, initiative and proficiency effects applied, the rest shown as reminders
- [x] Tasha options behind campaign toggles: optional class features and custom origin; turning a toggle off keeps choices and lists conflicts (as M11)
- [x] Artificer (TCE, 2014-compatible, own words): class, infusions as choices, Battle Smith and Artillerist (D131)
- [x] Owner-derived companion templates: Ranger's companion (PHB 2014, Q23, HP uses the higher of its normal HP or 4 × ranger level), Steel Defender, Eldritch Cannon, Find Familiar forms
- [x] Guided character builder: race, class, background, ability method, skills, equipment and spells for a new character in any campaign; blank create stays available
- [x] Gate: build a Fighter 2 / Wizard 3 and a Warlock / Sorcerer through the wizard; one character per SRD class to level 5; phone and desktop widths, Undo, reload, manual QA documented

### M15 — Ally/enemy tracker
- [x] Engine, tracker: one encounter per character (Q31) with combatants (you, companions, allies, enemies), initiative order, round and turn; logged and undoable
- [x] Engine, combatants: add from an SRD creature or a quick custom entry (name, AC, HP, initiative bonus); groups get numbers ("Goblin 2"); HP is average or a roll the player enters
- [x] Engine, turn flow: next turn moves through the order; your turn start resets your action economy; rounds drive existing effect timers; companions act on their own or the owner's initiative
- [x] Tracker UI in Combat: initiative list, quick damage and heal, conditions, defeated toggle, statblock preview; compact at 375 px
- [x] Hits, saves and damage dealt stay player-entered; the tracker warns (concentration, 0 HP) but never decides
- [x] Gate: run a three-round fight with The Fool, a companion and three enemies; phone and desktop widths, Undo, reload, manual QA documented

### M16 — Dice roller, themes, more books
- [x] Optional dice roller (off by default, Settings toggle): roll from attack, damage, save and check buttons; roll history; results never applied without the player (Q5)
- [x] Parchment theme and theme picker (system, dark, parchment); tokens only
- [x] Backups UI: export and import all data, restore preview, reminder when no recent backup
- [x] Xanathar's and Tasha's packs in our own words (Q6): subclasses, races, spells, feats; Artificer Alchemist and Armorer
- [x] Search and lists respect each campaign's books; content packs appear in Reference
- [x] Journal shows formatted Markdown safely (D129)
- [x] Portrait upload (Q12): image resized and stored on the device; icon stays the default
- [x] Rules review with the user: Q21, Q22, D80 and every default ruling; DECISIONS updated with the answers
- [x] Gate: switch themes, back up and restore, add a Tasha subclass, roll and apply damage by hand; phone and desktop widths, offline reload, manual QA documented

### M17 — Newbie-friendly character creation
- [x] Data, guidance schema: `data/content/guidance.json` (own words) with a zod schema; a test fails if any class, subclass, race or background in the registry lacks an entry
- [x] Content, classes and subclasses: role, difficulty (Easy/Medium/Hard), main abilities, strengths, weaknesses, suggested skills and starter spells with a reason, for every class and subclass in the app (SRD, PHB, Xanathar, Tasha)
- [x] Content, races and backgrounds: one-line pitch, good-with notes (for example "Hill Dwarf: extra HP suits any front-liner") and suggested pairings
- [x] Engine, suggestions: pure functions for a suggested standard array or point-buy spread from class and race, skill tags from strong abilities, and starter spell picks; tested, never auto-applied
- [x] Device settings: creation mode (Step by step or One page, Step by step by default) and a Beginner hints toggle (on by default); switching mode keeps everything entered
- [x] Step-by-step UI: Name, Race, Class, Background, Level, Abilities, Choices, Review; Back and Next, a step indicator, each step checks its own choices; Review shows the computed sheet before Create
- [x] Choice cards in both modes: race, class, background and subclass options show pitch, difficulty, strengths and weaknesses before picking (subclass cards arrive with the level choices in task 9)
- [x] Suggestions in both modes: Suggested scores button, Recommended tags on skills and spells with a one-line reason, synergy notes for the current race, class and background
- [x] Starting above level 1: subclass and ASI or feat picks for each level, with subclass cards, in a Levels step (One page: Level choices section); class picks and per-level spells are left to the To do list
- [x] Engine, to-do list: pure `pendingChoices` lists what a character still has to decide: subclass, ASI or feat, class picks (fighting style, Expertise, invocations, metamagic, infusions), cantrips, spells known, spellbook spells, and prepared spells below the daily number; each item links to where it is done
- [x] To-do UI: after a level-up, a summary of what changed (new features, HP, slots, proficiency) and a To do badge on the HUD and Dashboard that opens the list; items clear themselves when done, optional ones (preparing spells) can be dismissed
- [x] Gate: a beginner builds a level 1 Fighter and a level 5 Wizard step by step using only suggestions; an expert builds one on One page with hints off; phone and desktop widths, reload mid-build; level a Wizard and a Cleric, skip choices, and clear them from the To do list; manual QA documented

### M18 — Print and PDF sheet
- [x] Print view at `/characters/:id/print`: identity, abilities, saves, skills, AC, HP, attacks, features, inventory and spells, all computed by the engine
- [x] Print styles: light paper colours whatever the theme, clean page breaks, optional spell and feature summary pages
- [x] Print / Save as PDF button on the sheet uses the browser's print dialog (no PDF library); works offline
- [x] Gate: print The Fool and a level 5 Wizard to PDF in Chrome and on a phone; checks match the sheet; manual QA documented

### M19 — Physical checks and spell components
Rules: PHB 2014 chapters 7–8 (jumping, lifting, suffocating, food, travel, falling) and chapter 10 (components, focus). Numbers are computed; the DM still rules on edge cases.
- [x] Engine, body numbers (`src/engine/calc/physical.ts`): long jump (running = STR score ft, standing = half), high jump (running = 3 + STR mod ft, min 0; standing = half), push/drag/lift (2 × carrying capacity), hold breath (1 + CON mod minutes, min 30 s), choking rounds (CON mod, min 1), days without food (3 + CON mod, min 1), climb and swim speed (half speed unless a feature grants one). Each value returns a breakdown. Unit tests for The Fool and a STR 8 and STR 20 character
- [x] Engine, modifiers: Remarkable Athlete adds STR mod to running long jump; active *Jump* spell triples jump distance; Athlete feat makes the run-up 5 ft; Step of the Wind shows "double jump distance" as a reminder only. Sources come from features and active effects, never hard-coded names in the UI
- [x] UI, Explore panel "Movement and body": the numbers above as stat chips with breakdowns; works at 375 px
- [x] UI, Reference quick tables: travel pace (fast, normal, slow with their effects), forced march (CON save DC 10 + 1 per extra hour), falling (1d6 per 10 ft, max 20d6). Text in our own words
- [x] Engine, material components: classify each spell's material as none, focus-covered (no cost, not consumed), costly (gp parsed from the text) or consumed. Test with Shatter (covered), Revivify (costly and consumed) and Identify (costly, kept)
- [x] Engine, focus rules: Bard instrument, Cleric and Paladin holy symbol, Druid druidic focus, Sorcerer, Warlock and Wizard arcane focus, Artificer thieves' or artisan's tools (infusion item too); a component pouch works for any class; Ranger has no focus. Read from carried or equipped items
- [x] UI, cast note: when casting, show "Material covered by your Flute" or "Needs a 300 gp diamond (consumed)". It warns when nothing covers it but never blocks the cast
- [x] Gate: The Fool jumps (breakdown checked), casts Shatter with the flute equipped and without it; a Wizard casts Identify without a pearl and sees the warning; phone and desktop widths, Undo, reload; manual QA documented

### M20 — Tools directory
Sources: [awesome-dnd](https://github.com/flamableconcrete/awesome-dnd) (CC0) plus the user's list; one entry per tool, duplicates merged.
- [x] Data: `data/content/tools.json` with zod schema: id, name, url, objective, platforms, cost (free, freemium, paid), one-line summary in our own words, `ai` flag, search synonyms. A test fails on duplicate ids or urls
- [x] Content, objectives: Play online (VTTs), Maps and battle maps, Dungeon and town generators, Tokens and art, Miniatures and 3D printing, AI art and 3D pipeline, Music and ambience, Character builders and rules lookup, DM prep and campaign notes, Other game systems (marked "not supported by this app")
- [x] UI, Reference > Tools: groups by objective, filters for free only, platform and AI; each card opens the site in a new tab; works offline as a list (links need internet)
- [x] Script `npm run check:tools`: reports dead links; run by hand, not in CI. Credits screen thanks awesome-dnd
- [x] Gate: find a free map maker on a phone, filter out AI tools, open one link; manual QA documented

### M21 — Find and Related links
- [x] Engine, search index (`src/engine/calc/find.ts`): one ranked list over app places and actions (screens, panels, commands such as "Long rest"), the open character's spells, items and features, rules (reuse `searchRules`) and tools; synonyms ("jump" finds Movement and body, "PDF" finds Print). Pure and tested
- [x] Registry of places: every screen and panel registers an id, title, route, section anchor and synonyms in one file; a test fails if a built route has no entry. Add the rule "new sections register a Find entry" to AGENTS.md
- [x] UI, Find: top-bar search icon, Ctrl/Cmd+K and `/` open it; results grouped (Go to, Do, Your character, Rules, Tools); Enter goes there, scrolls to the section and highlights it briefly
- [x] UI, Related links: small "Related" row on key panels (Jump next to Athletics, Falling next to Jump, Focus next to spell components). Suggest only; never redirect on its own
- [x] Gate: from the Dashboard, reach Jump, Print, Shatter, Long rest and a map tool in two steps or fewer, by keyboard and by touch; manual QA documented

### M26 — Friend-testing fixes
Details in [PLAN.md](PLAN.md).
- [x] 1. Number fields
- [x] 2. True Neutral
- [x] 3. Spell Pending
- [x] 4. No sample character
- [x] 5. Accounts easy to find
- [x] 6. Cautions stand out
- [x] 7. Headings and subclass cards
- [x] 8. PHB backgrounds
- [x] 9. Stats button for summons
- [x] 10. Gate

### M39 — Themes
Details in [PLAN.md](PLAN.md).
- [x] 1. Foundation: registry, tokens, contrast test, effect levels
- [x] 2. Theme picker
- [x] 3. Midnight
- [x] 4. Title and background framework
- [x] 5. Prism
- [x] 6. Tidewater
- [x] 7. Fire, Nine Hells, Icewind Dale
- [x] 8. Feywild, Shadowfell, Underdark
- [x] 9. Astral Sea, Mechanus, Barovia, Mount Celestia
- [x] 10. Gate

## Backlog (not scheduled)

- Done 2026-11-09: site live on Netlify with Supabase accounts (HOSTING.md)
- Moved to PLAN.md: automatic sync (M22), shared campaign for a party or DM (M24), party view (M24)
- Later DM ideas (after M25): map import, monsters and NPCs, rewards, DM level-ups, ambient sounds, party rests and clock, notes and handouts, shared encounter tracker
- Later: spell import from user-pasted text
- Later: Remarkable Athlete half proficiency on STR/DEX/CON checks, Observant +5 passives, Dual Wielder AC (apply by hand for now)
- Later: session recap generated from the event log

## Session log

Newest first. One line per task, about 25 words at most.
- 2026-11-11 — M27: six PHB subraces, Beast Master with Ranger companion Stats link, guidance and tests.
- 2026-11-12 — M28: nine PHB martial subclasses, maneuver, discipline and totem picks, subclass spellcasting for Eldritch Knight and Arcane Trickster.
- 2026-11-12 — M29: 18 PHB caster subclasses (Valor, six domains, Moon, Wild Magic, two patrons, seven schools) with Channel Divinity and Wild Shape links.
- 2026-11-12 — M30: 39 PHB spells missing from the SRD in own words; Hex shows its 1d6 necrotic rider, Hunter’s Mark summary names its 1d6.
- 2026-11-12 — M31: Custom Lineage, 7 feats, 7 maneuvers, 2 metamagic, 8 invocations, Pact of the Talisman, Primal Companion with three beasts.
- 2026-11-12 — M32: 20 Tasha’s spells incl. ten Summon spells with stat templates, Stats link and spell-attack-based companion attacks.
- 2026-11-12 — M33: 12 Tasha’s subclasses (Beast to Astral Self) with shared Ki, Channel Divinity, Wild Shape and Bardic Inspiration pools.
- 2026-11-12 — M34: 11 more Tasha’s subclasses (Glory to Order of Scribes) with Channel Divinity and sorcery-point links.
- 2026-11-12 — M35: 12 Xanathar’s racial feats and 14 warlock invocations; picker finds invocations by prefix.
- 2026-11-12 — M36: 89 Xanathar’s spells (cantrips to 9th level) in own words with classes, damage and upcast.
- 2026-11-12 — M37: 13 Xanathar’s subclasses (barbarian, bard, cleric, fighter, monk) with features and guidance.
- 2026-11-12 — M38: 13 Xanathar’s subclasses (paladin, ranger, rogue, sorcerer, warlock) with features and guidance.
- 2026-11-12 — Rules audit: corrected about 80 PHB, Tasha’s and Xanathar’s summaries, uses and saves against the 2014 books.
- 2026-11-12 — Companion icons: name-based picture on companion cards and encounter rows, paw print fallback.
- 2026-11-13 — Delete campaign: button on each campaign card removes it with its characters; blocked while shared; undoable.
- 2026-11-13 — Planned M39 Themes: Midnight, Prism, Tidewater and 10 D&D place themes; effects full on desktop, lite on phones.
- 2026-11-13 — M39.1 Theme foundation: theme registry, per-theme CSS files, contrast test, browser bar colour, Theme effects setting (Auto/Full/Off).
- 2026-11-13 — Theme picker: preview cards grouped by kind, each painted in its own colours; Find entry for themes.
- 2026-11-13 — Midnight theme: true black, system colours and fonts, rounder corners, no effects.
- 2026-11-13 — Title and background framework: ThemeTitle, AmbientLayer at full level only, pause on hidden tab, still-page e2e check.
- 2026-11-13 — M39 task 5: Prism glass theme with frosted bars, colour light background, sweeping title and mouse sheen on computers.
- 2026-11-13 — M39 task 6: Tidewater sea-glass theme, rolling wave in the title, drifting pool light, tap ripple on phones and computers.
- 2026-11-13 — Fire, Nine Hells and Icewind Dale themes: burning, hellfire and frost titles; embers, ash and snow on computers.
- 2026-11-13 — Feywild, Shadowfell and Underdark themes: shimmering, shadowed and faerzress-lit titles; motes, wisps and spores on computers.
- 2026-11-13 — Astral Sea, Mechanus, Barovia and Mount Celestia themes; Mount Celestia is the second light theme.
- 2026-11-13 — Gate: all 15 themes checked on Sheet, Spells and Combat at 375 and 1440 px; phones still, computers 60 fps; manual QA list added.
- 2026-11-13 — GPU backgrounds: Tidewater pool light with tap rings and Prism ribbed glass on computers; Tidewater title gets rolling waves.
- 2026-11-13 — Theme effects Full now overrides the system reduced motion setting; Settings explains why Auto effects are still.
- 2026-11-13 — GPU backgrounds for the ten D&D place themes: moving scenes that follow the mouse and answer clicks; plain themes stay still.
- 2026-11-13 — Hid Prism and the ten D&D place themes until reworked; picker offers System, Dark, Parchment, Midnight and Tidewater.
- 2026-11-13 — Auto theme effects now move on every computer, even with Windows animations off; Off and Always reduce motion still stop them.
- 2026-11-13 — New devices start on the Dark theme instead of System; saved hidden themes also fall back to Dark.
- 2026-11-14 — Passive numbers: Dwarven Toughness and Draconic Resilience HP, Draconic AC, auras, initiative and speed features, Defense style, save proficiencies.
- 2026-11-11 — M26 verify fixes: Steel Defender Stats on Features and Combat, phone spell rows keep names, sign-in card single frame.
- 2026-11-11 — M26 task 10: Gate. Manual QA list added; full e2e rerun, tour step test fixed.
- 2026-11-11 — M26 task 9: Stats button beside Use and Cast for summons; opens the companion or a pre-filled add form.
- 2026-11-11 — M26 task 8: All PHB backgrounds, variants and Custom; creation asks for their skills, languages and tools.
- 2026-11-11 — M26 task 7: M26-7: bolder field labels and headings; subclass choice is icon cards with pitch and difficulty; DESIGN.md updated.
- 2026-11-11 — M26 task 6: M26-6: cautions use warn colour, a triangle icon and bolder text; blocking level-up errors use danger.
- 2026-11-11 — M26 task 5: M26-5: sign-in card on Campaigns when signed out (sync builds only), hideable; welcome tour points at it.
- 2026-11-11 — M26 task 4: M26-4: new devices start empty; Campaigns offers a Try the sample character button.
- 2026-11-11 — M26 task 3: Pending spell picks open Manage spells on just that pick; Show all brings back the rest.
- 2026-11-11 — M26 task 2: Alignment list says True Neutral; old Neutral shows as True Neutral.
- 2026-11-11 — M26 task 1: Backspace clears Level while typing; Enter moves between ability scores and HP rolls.
- 2026-11-11 — Plan: M26 friend-testing fixes (inputs, True Neutral, spell Pending, no sample character, sign-up card, cautions, headings, PHB backgrounds, summon Stats button); Q41–Q43.
- 2026-11-10 — Performance: screens load on first visit; app, library and reference data ship as separate cached files. Main file 3 MB to 285 kB.
- 2026-11-09 — M25 done: DM overview table with sort and column picker, DM tutorial tips, Find synonym, e2e at 375 and 1440 px; QA list added.
- 2026-11-09 — M24 gate: sharing, party sync, view-only and non-member checks covered by tests; QA list added. Run the migration in Supabase.
- 2026-11-09 — M24 tasks 6–7: party view with a card per character, "Party" link on shared campaign cards, party tutorial tips, Find synonym.
- M24 task 5: party characters are view only (commands, undo, delete blocked in the engine); banner with Duplicate to play; Duplicate makes an own copy.
- M24 tasks 3–4: Party section in Campaign settings, /join/CODE page, party sync both ways with read-only copies, live updates, Find entry.
- M24 task 2: party tables, row-level security, one DM, hashed 7-day invites, join and member functions, party names readable; schema tests and a throwaway-project check script.
- M24 task 1: DM or player role asked for new campaigns, who-plays asked for new characters; Settings switch and Don't ask again; old campaigns count as Player; e2e added.
- M23 gate: tests, typecheck, lint and e2e pass (every tour target exists at both widths); manual QA added. M23 done.
- M23 task 4: Screen tips on first visit to Combat, Spells and Inventory, following the Show screen tips switch; Rest and level-up have no screen, so no tip; e2e added.
- M23 task 3: Character tour (HUD, menus, To do, History and Undo, Sheet Edit) starts on first character visit; e2e added.
- M23 task 2: Welcome tour on first campaign-list visit, Settings → Tutorial (tips switch, Replay, Reset tips), Find entry; e2e added; other specs skip the tour.
- M23 task 1: tour engine (spotlight, card, Back/Next/Skip, keyboard, device-only progress in localStorage); no chapters yet; unit tests added.
- M22 gate: tests, typecheck, lint and e2e pass; manual QA added. M22 done.
- M22 task 7: edits to different fields on two devices merge automatically using event patches; same-field edits still ask; D177.
- M22 task 6: top-bar sync chip (Synced, Syncing, Offline, Sync problem, Needs your choice) on hub and character screens; opens Settings.
- M22 task 5: automatic sync on sign-in, open, tab return, network return and after edits, with retries; one tab syncs; D176 replaces D124.
- M22 task 4: Delete account in Settings → Account (type DELETE); a database function removes cloud data, device copies stay.
- M22 task 3: Forgot password and Change password in Settings → Account, plus a /reset-password page for the emailed link.
- M22 tasks 1–2: profiles table with owner-only access, and a display name field in Settings → Account; unit tests added.
- Plan: Q39 answered (D175); the DM cannot change players' characters either. No open plan questions.
- Plan: user answered Q32–Q38 (D168–D174); party characters are view only with Duplicate; M25 is the overview only; Q39 open.
- Plan: M22 accounts finished, M23 tutorial, M24 roles and shared campaigns, M25 DM tools written in PLAN.md; open questions Q32–Q38.
- Testing fix: Find now matches edit, fix, override and correct to Sheet, where the Edit button fixes numbers and build choices.
- Testing fix: spell names in level-up picks and Manage spells open the spell card (hover or focus on desktop, tap on phones); Escape closes only the card.
- Testing fix: skipped spell picks show as Pending buttons on Spells (cantrips under Cantrips, others under the first level) and open Manage; e2e added.
- Testing fix: Parchment theme toned down (less glare, darker text colors); Theme options in Settings show Monitor, Moon and Sun icons.
- M21 gate: Jump, Print, Shatter, Long rest and a map tool each reachable from the Dashboard in two steps; manual QA added. M21 done.
- M21 task 4: Related rows on Skills, Movement and body, and the cast sheet; links only suggest and move nowhere on their own; e2e added.
- M21 task 3: Find search icon in the character toolbar and hub header, Ctrl/Cmd+K and / open it; results jump to the section and flash it.
- M21 task 2: places registry lists every screen, section and rest action for Find; a test fails if a nav route has no entry; AGENTS rule added.
- M21 task 1: pure Find search index ranks titles, synonyms and details, groups results and caps each group; unit tests added.
- M20 gate: e2e finds a free web map maker with AI hidden and opens-in-new-tab links; check:tools script and Credits thanks added; manual QA written.
- M20: Reference > Tools page groups tools by goal with free only, platform, hide AI and search; cards open in a new tab.
- M20: 61 tools written in own words across 10 objectives, duplicates merged; other-system entries marked not supported.
- M20: tools data schema, loader and test for duplicate ids and urls; one seed entry.
- M19 gate: cast sheet shows material cover or warning and never blocks; e2e with Fool flute, no flute and Wizard Identify; manual QA written.
- M19: engine reads spell materials (none, plain, costly, consumed) and checks carried focus by class or component pouch. Infusion items skipped, no data.
- M19: Reference quick tables for travel pace, forced march and falling, in own words, with e2e.
- M19: Explore "Movement and body" panel with jump, lift, breath, food, climb and swim chips and breakdowns; e2e at phone and desktop.
- M19: engine body numbers (jumps, lift, breath, food, climb, swim) with Remarkable Athlete, Jump spell, Athlete feat and Step of the Wind note.
- Planned M19 (physical checks, spell components), M20 (tools directory) and M21 (Find, Related links) as concrete task lists.
- Review: draft Start over and safe restore; print page toggles, missing-character guard, PDF title; new gate e2e (suggested scores, subclass via To do); stale Explore test fixed.
- M18: Print view at /characters/:id/print with light paper styles, page breaks and a Print / Save as PDF button; e2e checks it; manual QA written.
- M17 gate: New character draft survives reload (per tab); e2e covers beginner Wizard, expert one-page build and reload; manual QA written.
- M17 task 11: To do list with HUD badge and Home banner; resolveChoices command settles subclass, ability increase, class picks and expertise; spells open the Spellbook.
- M17 task 10: pure pendingChoices lists open subclass, ASI, class picks, expertise and spell choices; prepared spells optional. Next: To do UI.
- M17 task 8: Suggested scores button, Recommended tags with a reason on class skills and spells, and Good together notes, in both modes.
- M17 task 9: starting above level 1 now asks for subclass and ability increase or feat at each level; skipped choices wait for the To do list.
- M17 task 7: Race, class and background show a guide card (pitch, difficulty, strengths, weaknesses) and a Compare list, in both modes; hints can be switched off.
- M17 task 6: New character has a Step by step mode (Name to Review) beside One page; each step checks itself, entries survive switching.
- M17 task 5: Settings gets New characters (Step by step or One page) and Beginner hints, saved on this device.
- 2026-11-08 — M17: engine suggestions: suggested ability spread (fits standard array and point buy), skill tags, starter-spell reasons and synergy notes; nothing auto-applied.
- 2026-11-08 — M17: guidance data for all 13 classes, 21 subclasses, 13 races and 2 backgrounds in our own words; a test fails if any entry is missing.
- 2026-11-08 — M17: guidance data for all 13 classes, 21 subclasses, 13 races and 2 backgrounds in our own words; a test fails if any entry is missing.
- 2026-11-08 — Planned M17 (newbie-friendly creation, level-up to-do list, guidance for every class) and M18 (print and PDF). M14 status fixed to done.
- 2026-11-08 — M16 gate: all checks and e2e pass at both widths; Playwright now pins dark mode; M16 manual QA list added. Milestone done.
- 2026-11-08 — M16: rules review. Q4, Q21, Q22, Q23, Q29 answered (D150–D153); instant-death DM-review note removed. Other defaults stay open.
- 2026-11-08 — M16: portrait upload in Edit character: picture is cropped and shrunk to a small JPEG, shown on sheet, HUD and campaign list; icon is default.
- 2026-11-08 — M16: Journal text shows bold, italic, lists, headings, quotes and web links; typed HTML stays plain text. Saved text unchanged.
- 2026-11-08 — M16: Reference search hides books a campaign does not use (PHB always shows) and lists Xanathar and Tasha entries with their book.
- 2026-11-08 — M16: first Xanathar and Tasha content, own words: 5 subclasses, 8 spells, 11 feats. Artificer subclasses already existed; no new races in either book.
- 2026-11-08 — M16: backups in Settings. Export all data to one file, restore from a file or recovery point with preview, reminder after 14 days.
- 2026-11-08 — M16: Parchment light theme and Theme picker in Settings (System, Dark, Parchment); System follows the device; choice stored on this device.
- 2026-11-08 — M16: optional dice roller. Settings switch (device only), dice tray with history, Roll buttons on attacks, saves and skills; nothing is applied for you.
- 2026-11-08 — M15: gate passed. Three-round fight with The Fool, a companion and three goblins at phone and desktop width; Undo and reload work.
- 2026-11-08 — M15: tracker UI in Combat: initiative rows, damage, heal, conditions, defeated, statblock, add combatants; 0 HP and concentration only warn.
- 2026-11-08 — M15: tracker engine. One encounter per character with order, rounds, groups, damage, defeated marks and Next turn driving effect timers; all undoable.
- 2026-11-07 — M14: gate passed. Fighter 2 / Wizard 3, Warlock / Sorcerer and all 13 classes to level 5 build and undo; guided create survives reload.
- 2026-11-07 — M14: guided new-character builder with a class start table: skills, kit choices, instruments and spells; blank create stays as the default.
- 2026-11-07 — M14: owner-derived companion templates for Ranger beasts, Steel Defender, Eldritch Cannon and Find Familiar forms; ranger HP is the higher of normal or 4 x level.
- 2026-11-07 — M14: Artificer class, four specialists, sixteen infusions as picks, round-up slots, prepared count, multiclass rule and spell list
- 2026-11-07 — M14: Tasha optional class features by level, seven fighting styles, custom origin command and sheet section, conflicts listed when off

- 2026-11-07 — M14: All 42 PHB feats added in own words; ability, save, skill, armor, initiative, speed and HP effects apply when taken at level-up.
- 2026-11-07 — M14: Bard, Cleric, Druid, Sorcerer, Warlock, Wizard checked at levels 1–20: slots, Pact Magic, Sorcery Points, Channel Divinity, Mystic Arcanum pools.
- 2026-11-07 — M14: Barbarian, Fighter, Monk, Paladin, Ranger, Rogue checked at levels 1–20: scaling dice and bonuses, pools, Unarmored Defense AC, half-caster slots.
- 2026-11-07 — M14: Level up now offers new class, subclass, ability score improvement or feat, and spells in one undoable step. Class picks arrive with tasks 6–7.
- 2026-11-07 — M14: `levelUp` can add the new cantrips and spells a class table allows, Wizard spellbook copies, and one known-caster swap; prepared counts follow the level.
- 2026-11-07 — M14: `levelUp` takes subclass, ASI (cap 20) or feat, expertise and picked option features in one undoable step. Next: spells on level-up.
- 2026-11-07 — M14: `levelUp` can add a new class when multiclassing is on: 13+ minimums checked, proficiencies and skill/instrument pick granted. Next: level choices.
- 2026-11-07 — M14: 334 SRD creatures imported into `data/srd/creatures.json`; Reference search shows statblocks. Next: multiclass engine.
- 2026-11-07 — M12 and M13 verified. Planned M14–M16 task lists; tracker scope and Artificer subclasses added as open questions. Next: SRD creature import.
- 2026-11-07 — M12 review fix: companions can be edited (attacks, uses, abilities, traits, notes); strict number entry; initiative box refreshes on Undo.
- 2026-11-06 — M13 complete: quick tables added; search and tables pass at 375 and 1440 px; manual QA listed. Next: M14.
- 2026-11-06 — M13 rules search: Reference page searches conditions, spells, items, features, classes and races by name; conditions show SRD text.
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
