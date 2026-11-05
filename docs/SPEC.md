# OmniDnD — Product Spec

## 1. Goal

One place to track a D&D 5e (2014) character during play. Fast in combat, complete between sessions.

Support different campaigns and characters, including future friends' characters. The Fool is the first acceptance fixture, not the product's scope limit; local saves and character-file exchange do not require accounts or cloud sync.

**Principles (in priority order)**

1. **Accurate** — functional accuracy beats usability, which beats polish, which beats more automation.
2. **One state** — every screen reads and writes the same character state through shared commands. Never enter a value twice.
3. **Glanceable** — essentials visible; details on hover (desktop), tap (mobile), or focus (keyboard).
4. **Player decides, app tracks** — DM outcomes stay manual. App warns; it never silently rules.
5. **Undoable** — every change is logged and can be undone.
6. **Logic apart from UI** — themes, layouts, classes, and books can change without touching each other.

**Non-goals for v1:** battle map/grid, full combat simulator, DM tools, accounts/cloud sync, copying whole rulebooks, 2024 rules.

## 2. Phases

| Phase | Content |
|---|---|
| 1 — MVP | Key frames, rules engine core, nav shell, HUD, Dashboard, Character Sheet, Spellbook, Combat, Exploration (basic), Rest, basic conditions/effects, local save, Reference links, Campaign Setup (character rules), minimal level up |
| 2 — Full management | Inventory, Features screen, full Effects editor, Companions, Journal, Campaign Setup (sources, optional rules), searchable Reference |
| 3 — Automation | Full level-up workflow (features, spells, ASI/feats), more classes, multiclass, ally/enemy tracker, advanced feature exceptions |
| 4 — Extras | Dice roller, themes (Parchment), backups UI, cloud sync, more books, integrations |

Milestones and checklists live in [PROGRESS.md](PROGRESS.md).

## 3. Navigation & layout

| Screen | Purpose | Phase |
|---|---|---|
| Campaigns (landing) | List campaigns and their characters; open a character; new campaign; new character | 1 |
| Characters | Create, import, duplicate, select, delete (per campaign) | 1 |
| Dashboard | Resources, effects, quick access, recent log | 1 |
| Character Sheet | Abilities, skills, saves, proficiencies, combat stats | 1 |
| Spellbook | Spells, slots, casting, spell management | 1 |
| Combat | Turn economy, attacks, spells, HP, reactions, log | 1 |
| Exploration | Utility spells, rituals, skills, game clock | 1 (basic) |
| Inventory | Equipment, currency, consumables, attunement | 2 |
| Features | Race/class/background/feat features with uses | 2 (Phase 1: shown on Dashboard + Combat) |
| Companions | Pets, mounts, familiars, summons, sidekicks | 2 |
| Journal | Backstory, personality, quests, NPCs, session notes | 2 |
| Reference | External links (Phase 1), searchable rules/conditions (Phase 2) | 1 / 2 |
| Campaign Setup | Character rules (leveling, HP, ability scores), sourcebooks, optional rules | 1 (character rules) / 2 (sources, optional rules) |
| Settings | Theme, motion, automation level, import/export | 1 |

- **Two frames (D38).** The app opens on the **Campaigns hub** (`/`), never on a character. Hub routes: `/`, `/campaigns/new`, `/campaigns/:id/settings`, `/campaigns/:id/characters/new`. Opening a character switches to the **character frame** (`/characters/:id/...`: HUD + screen nav). The character frame has an "All campaigns" link (sidebar on desktop, More sheet on mobile).
- A campaign has many characters; every character belongs to exactly one campaign and follows its rules.
- **Desktop (≥1024 px):** left sidebar nav · top HUD · center workspace · right detail panel (collapsible).
- **Tablet (640–1023 px):** icon-only sidebar · detail panel as overlay drawer.
- **Mobile (<640 px):** compact HUD header · bottom nav `Home · Combat · Spells · Inventory · More` · bottom sheets instead of popovers.
- Combat is designed **mobile-first**. Desktop gets a richer layout of the same components.

## 4. Global HUD

Always visible, including Combat.

- Portrait/icon, name, class + subclass + level
- HP bar: current / max, temp HP shown separately
- AC, initiative, speed
- Spell slot pips per level; key class resource (e.g., Bardic Inspiration pips)
- Concentration chip: spell name + ✕ to end
- Condition/effect chips (max 4 visible, then `+N`)
- Short Rest / Long Rest buttons (desktop); in `More` menu on mobile

Tap/click any value → its adjust popover (HP: Damage / Heal / Temp with number pad on mobile). Mobile HUD fits in 2 rows max.

A shared status row beneath the HUD shows saving status, the latest change and one Undo on every character screen. Tap the entry for full history; it stays visible while scrolling, and character toasts do not duplicate Undo.

## 5. Screens

### Campaigns (landing)
One card per campaign: name, rules summary (e.g. `Milestone · HP rolled · Abilities rolled`), Settings link, its characters (portrait, name, race, class/level), and "New character". A "New campaign" button opens Campaign Setup with defaults (D40). Seed: Campaign #273 with The Fool.

### Characters
Create blank (inside a campaign), import JSON, duplicate, delete (confirm). Full guided builder is Phase 3.

**New character (Phase 1):** name, level, race, class, background, alignment; an ability table whose Base inputs follow the campaign method (standard array picker, point-buy range, or typed rolls) plus a racial bonus column; a per-level HP table (level 1 = die maximum; later levels = typed roll or fixed average per campaign). Score, modifier, Hit Dice, and max HP are computed.

**Manual vs automatic:** the user enters every *choice* (race, class, skills, Expertise, languages, tools, spells, items, ability scores or rolls, HP rolls). The app computes every *derived number* (modifiers, saves, skills, passives, initiative, DC, attacks, AC, max HP, slots, uses). Never ask the user to type a number the app can compute.

### Dashboard
Resources, concentration, effects on you, conditions, Quick Access (favorited spells/features/items), ability/save/passive summary and the last 5 log entries. Full history and Undo stay in the shared header.

- **Resource groups (D37):** Spell slots (one row per level) · Features & traits (class/race resources, e.g. Bardic Inspiration) · Hit Dice. Each group has its own heading.
- **Row:** label · `[−] pips left/max [+]`. Pips sit between the buttons so a tap on a pip never spends or restores.
- **Description:** the label opens a short card: what the resource does, how many are left, and what restores it. Desktop: hover tooltip, click pins in the detail panel. Mobile: tap opens a bottom sheet.
- **Concentration** is its own block (spell, remaining time, End). **Effects on you** lists only effects whose target is this character (D41).

### Character Sheet
- **Identity:** name, race/subrace, class/subclass/level, background, alignment, inspiration toggle. XP field and "next level at" only when the campaign uses XP leveling; otherwise hidden.
- **Abilities:** score, modifier, save (proficiency marked). Edit bases as typed rolls, standard-array assignments or a point-buy purchase costing at most 27 points; bonuses (racial, ASI, feat, item) stay separate, with their sources shown.
- **Max HP:** computed from per-level HP entries (see §6). Shows each level's entry in the breakdown.
- **Level up (Phase 1: minimal):** XP mode prompts at the next recorded level's threshold; milestone mode offers "Level up" whenever the DM says so. Review one new HP roll or the computed average, gain one class level and Hit Die, then apply once; full feature/spell choices stay in Phase 3.
- **Skills:** modifier with markers for proficient / expertise / Jack of All Trades. Passive Perception, Investigation, Insight.
- **Proficiencies:** armor, weapons, tools, languages. Senses, resistances, immunities, vulnerabilities.
- **Combat stats:** HP, temp HP, Hit Dice, AC, initiative, speed, attacks, death saves.
- **Breakdown on every computed number:** hover/tap shows its parts, e.g. `Initiative +3 = DEX +2, Jack of All Trades +1`.
- **Overrides:** any current computed value can be selected for a noted override (e.g., "DM approved"); ✎ marks the result, and breakdowns retain the calculated value. Remaining resources use noted spending corrections, so later use and rest recovery continue normally (D100–D101).
- View mode by default; Edit mode toggle for build changes.

### Spellbook
- Groups: Cantrips, then Level 1–9. Show only levels with spells or slots.
- Slot row per level: pips + `− / +`. Tap a pip to toggle.
- Spell row: icon, name, casting-time badge (`A` / `BA` / `R` / `1 min`), range, save/attack chip, `C` (concentration) / `Rit` (ritual) markers, Cast button.
- **Preview:** desktop hover (250 ms delay) opens popover; click pins full detail in right panel. Mobile tap opens bottom sheet with Cast button. Keyboard focus + Enter opens preview.
- **Cast flow:** pick slot level (default lowest available; higher levels show upcast text) → confirm. Cantrips and rituals use no slot. Ritual option appears only if the spell has the ritual tag and the class allows ritual casting (+10 min, outside combat).
- **Spell types (D39):** Damage · Control · Healing · Buff · Debuff · Utility. Each spell has one or more type tags; the first tag is its main type. The row box is tinted by the main type and the meta line starts with the type name in that colour (never colour alone). Untagged spells count as Utility.
- States: castable, no slot (dimmed), concentrating (full teal outline + "Active" badge, D43), favorite (star).
- Filters: search, level, type (matches any tag; several types = OR), casting time, concentration, ritual, school, "castable now".
- **Manage mode:** add/remove/replace known or prepared spells from the class list and enabled sources. Shows count vs limit (e.g., `6 / 6 known`).
- Pact Magic (Warlock) is a separate slot pool. Phase 3, but the data model supports it from day one.

### Combat
The Combat screen tracks **this character's** turn: what they can still do, what it costs, and what is left. It has no initiative order (D42); the DM runs the table.

- **Start Combat:** round counter starts at 1. Initiative modifier is shown for reference; the roll is not stored.
- **Turn controls:** Start Turn (advances the round after the first turn; restores action, bonus action, movement, reaction; ticks start-of-turn effects), End Turn (ticks end-of-turn effects).
- **Economy bar:** Action · Bonus Action · Reaction · Movement (ft left, `−5 / +5`). Each is tappable to toggle manually.
- **Tabs:** Actions · Spells · Bonus · Reactions · Items.
  - Actions: weapon attacks (to-hit, damage), Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object, Grapple, Shove.
  - Spells: filtered to what the current economy allows.
  - Reactions: Opportunity Attack, Cutting Words, Readied action, other triggered features. Usable during other creatures' turns.
- **HP panel:** big current HP, quick `−1 −5 −10`, number pad, Damage / Heal / Temp. Damage while concentrating → CON save prompt showing the DC, with Pass / Fail buttons.
- **At 0 HP:** death-save tracker appears (success/fail pips, nat 1 / nat 20 buttons).
- **Concentration** block (spell, remaining rounds, End) and **Effects on you** list with remaining rounds (D41).
- **Log + Undo** always visible in the shared header row (last entry + one Undo; full history in a sheet).
- **End Combat:** clear turn state; remaining round durations convert to game time (1 round = 6 s).
- Validates action requirements and spends resources (see §6). Attack hits and damage dealt to others stay manual.

### Exploration (basic in Phase 1)
- Reuse Dashboard's shared Game Clock control and saved clock (D91): `Day N, HH:MM`, with `+1 min · +10 min · +1 h · +8 h · custom`. No second clock or real-world timer.
- Spells with any effective Utility tag, plus rituals; keep class associations and unavailable choices visible. Casting uses the same controls and slot pool as Combat; a ritual label alone does not grant ritual eligibility.
- Skill list with modifiers + passives.
- Active effects with remaining time; they persist into Combat until expired or ended.
- Light sources and timed consumables as effects (Phase 2).
- Quick notes (Phase 2: link to Journal).

### Rest
Opened from HUD. Always shows a **preview diff** before applying, e.g. `HP 12 → 21 · L1 slots 1 → 4 · Bardic Inspiration 2 → 5 · Hit Dice 0 → 1 of 3`.

**Short Rest (≥1 h game time)**
- Spend Hit Dice one at a time: Roll or enter the die value; CON modifier added automatically.
- Extra healing features offered when eligible (e.g., Song of Rest: +1d6 once, if any Hit Die was spent).
- Restore short-rest features only. Slots (except Pact Magic) and long-rest features unchanged.

**Long Rest (≥8 h game time)**
- Blocked if HP is 0 at the start. Warns if <24 h game time since the last long rest.
- HP to max. Recover spent Hit Dice up to half the total (minimum 1).
- Restore all slots and long-rest features. Reduce exhaustion by 1.
- Prompt for prepared-spell changes (prepared casters only).

### Features (Phase 2 screen; data and Use buttons in Phase 1)
Grouped by origin: Race · Class · Subclass · Background · Feats · Equipment · Temporary · Homebrew. Each: type (passive / active / triggered), activation, uses pips, recharge, short summary, Use or Toggle button. Passive features feed calculations automatically.

### Inventory (Phase 2)
Items grouped by container. Equip toggle, quantity `− / +`, Use/Consume (potion → heal prompt + action spend in combat). Currency `cp sp ep gp pp` with add/subtract. Weight vs carrying capacity. Attunement (max 3). Charges with recharge rule (e.g., "1d6+1 at dawn" → prompt at long rest). AC and attacks computed from equipped gear. Custom items allowed.

### Effects & Conditions
- Phase 1: 2014 condition toggles, exhaustion level (1–6), concentration, spell-created effects with duration.
- **Concentration vs effects (D41):** concentration is the caster's own state and is shown in its own block. An effect appears under "Effects on you" only when this character is its target (e.g. Bless cast on you). A spell you cast on others (Faerie Fire on enemies) shows only as concentration, plus an "Active" badge on its spell row.
- Phase 2: full editor: source, duration, modifiers (e.g., +1 AC, resistance), expiry trigger, manual override. Injuries and custom effects are DM-defined (no built-in mechanics).

### Companions (Phase 2)
Planned for M12; no companion screen, commands or schema fields are implemented by this plan. Show name, type (pet / mount / familiar / summon / sidekick), icon, AC, HP, speed, attacks, abilities, conditions, uses, notes and initiative; Tasha sidekicks require the campaign option.

- **Statblocks:** import SRD 5.1 creatures such as Mastiff into `data/srd/`. Non-SRD companions use user entry or own-words content; never copy book text into public content packs.
- **Owner-derived values:** cover Eldritch Cannon, Steel Defender, Ranger companions and Find Familiar, computing values from owner class level, proficiency and ability modifiers where the selected 2014 rule requires them. Familiar forms otherwise retain fixed SRD stats; Ranger PHB/Tasha variant choice is Q23, and users never type numbers the engine can derive.
- **Creation and recreation:** apply the source's feature/spell uses, spell-slot costs, duration and maximum count through engine commands. Expiry uses the shared saved game clock.
- **Commanding:** spend the owner's required action, bonus action or other economy cost and show that cost in the economy bar. The player enters choices, rolls and DM outcomes; the app does not decide hits, saves or target behavior.
- **Independent live state:** track each companion's HP, damage, healing, conditions and uses; it is destroyed or dismissed at 0 HP. Creation, commands and all changes are logged and undoable.
- **Persistence:** include owned companions and their live state in character saves and exports. Concrete data shapes and compatibility work remain M12 design work, described as planned in DATA.md.
- **Artificer dependency:** use the 2014-compatible `TCE` Artificer, never 2024 rules or Eberron: Forge of the Artificer (2025). Cannon and Steel Defender automation depends on Artificer class support in M14; M12 does not bring that class implementation forward.

### Journal (Phase 2)
Backstory, personality traits, ideals, bonds, flaws, relationships, quests (open/done), NPCs, locations, session notes (dated). Markdown text.

### Campaign Setup
**Phase 1 — character rules** (per campaign; every character in the campaign follows them):

| Setting | Options | Effect |
|---|---|---|
| Leveling | XP · Milestone (manual) | XP: XP field + level thresholds. Milestone: no XP anywhere; "Level up" button. |
| HP per level | Average · Rolled | Average: die/2 + 1 auto-filled. Rolled: user enters the die result for each new level. |
| Low HP rolls (negative CON) | Allow negative (default) · At least 1 | Allow negative: a level adds roll + CON even when 0 or less. At least 1: each level adds at least 1 HP. |
| Ability scores | Standard array · Point buy · Rolled | Array/point buy: validated picker. Rolled: user enters six numbers manually. |

Changing a method later never rewrites existing entries; it applies to new characters and new levels. Show which existing values don't match the new method.

New campaign defaults (D40, D44): XP leveling, average HP, allow negative level HP, standard array, PHB only. The same screen edits an existing campaign (`/campaigns/:id/settings`).

**Phase 2 — sources and optional rules:**
- Ruleset locked to 5e 2014.
- Sources: `[x] PHB (locked)` `[x] Xanathar's` `[x] Tasha's` `[ ] others (future)` `[ ] Homebrew`.
- Optional rules, each an explicit toggle: feats, multiclassing, Tasha optional class features, Tasha custom origin, encumbrance (off / standard / variant), potion as bonus action (house rule), rest variant (standard / gritty / epic).
- Enabling a book never auto-enables its optional rules.
- Changing settings never deletes character choices. Show conflicts and ask how to resolve.

### Reference
- Phase 1: link cards. D&D Beyond, 2014 Basic Rules, SRD 5.1, 5e.tools (2014), D&D 5e API, Open5e, Roll20, Hero Forge. User bookmarks (add/edit/remove). Credits page (SRD and icon attribution).
- Phase 2: searchable conditions, rules summaries, quick tables. Spells/items link to their external page.

### Settings
Theme, reduced motion, automation level (**Assisted:** validate + warn · **Manual:** track only, no warnings), export/import JSON, backups, reset character.

Reset previews and confirms the current character's HP/resource refill and removal of combat, conditions and effects, with a prior-workspace backup and logged Undo (D107). Build choices, inventory, money, game time, history, ordinary Inspiration and item charges stay; the hub links to the selected character's Settings.

## 6. Rules engine

Separate module (`src/engine/`). Pure functions + commands. UI calls commands; engine returns new state, warnings, and a log event.

**Calculates:** ability mods, proficiency bonus, saves, skills, passives, initiative, spell DC/attack, slots, class resources and recovery, weapon attacks, AC, Hit Dice, concentration DCs, condition effects where deterministic.

**Validation levels**

| Level | When | UI |
|---|---|---|
| Block | No resource left (0 slots, 0 uses, 0 quantity), 4th attunement, long rest at 0 HP | Disabled button + reason. Fix via manual adjust. |
| Warn | Rule restriction: reaction already used, bonus-action-spell rule, action already used, long rest <24 h | Confirm dialog: Cancel / Do anyway. "Do anyway" logs an override. |
| Info | Reminders: concentration save DC, may provoke opportunity attacks | Inline note, no dialog |

Manual automation level turns Warn into nothing and Info into nothing; Block still prevents negative values.

**2014 rules the engine must get right**

- Modifier = floor((score − 10) / 2). Proficiency bonus by total level: +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20).
- Skill = ability mod + proficiency (×2 with Expertise). Jack of All Trades adds half proficiency (round down) to ability checks without proficiency, **including initiative**, **not** saves or attacks.
- Passive = 10 + check modifier (+5 / −5 for advantage / disadvantage when toggled).
- **Max HP:** level 1 = max Hit Die + CON mod. Each later level = that level's entry (rolled value or average die/2 + 1) + CON mod. Whether a level can add less than 1 HP is a campaign setting (D44): "Allow negative" (default) adds roll + CON as is, so a low roll with negative CON lowers max HP; "At least 1" floors each level at 1. Max HP itself never drops below 1. Entries are locked once made: a level-up adds exactly one new entry, never re-rolls old ones. CON modifier changes apply retroactively to every level.
- **Hit Dice pool:** one die per class level. Level-up adds one die to the pool.
- Spell save DC = 8 + proficiency + casting mod. Spell attack = proficiency + casting mod.
- Cantrip damage scales at character level 5 / 11 / 17.
- **Concentration:** one effect at a time; casting another concentration spell ends the first. Damage → CON save, DC = max(10, floor(damage / 2)), one save per damage instance. Incapacitated or dead → ends.
- **Bonus-action spell:** if a spell is cast as a bonus action, the only other spell that turn can be a cantrip with a casting time of 1 action.
- **Turn economy:** 1 action, 1 bonus action (only if something grants one), movement up to speed, 1 free object interaction. **Reaction: 1 per round, regained at the start of your own turn.**
- **Temp HP:** never stacks (choose keep or replace), absorbed first, not healing.
- **0 HP:** unconscious, death saves. 3 successes = stable, 3 failures = dead. Nat 20 = regain 1 HP. Nat 1 = 2 failures. Damage at 0 HP = 1 failure (crit = 2). Damage ≥ remaining HP + max HP = instant death. Any healing resets death saves.
- **Rests:** see §5 Rest.
- **Exhaustion (2014, cumulative):** 1 disadvantage on ability checks · 2 speed halved · 3 disadvantage on attacks and saves · 4 HP max halved · 5 speed 0 · 6 death.
- **Conditions (2014):** blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious.
- **Potion:** drinking or administering = action (bonus action only with house-rule toggle).
- Attunement max 3. Carrying capacity = STR × 15 lb.
- Ritual casting is class-specific (Bard: known spells with the ritual tag).
- Feature-specific rules override general rules.

**Commands (initial set):** `castSpell`, `endConcentration`, `adjustSlot`, `useFeature`, `adjustFeatureUses`, `applyDamage`, `heal`, `setTempHp`, `rollDeathSave`, `toggleCondition`, `setExhaustion`, `addEffect`, `removeEffect`, `startCombat`, `startTurn`, `endTurn`, `useEconomy` (action / bonus / reaction / movement), `endCombat`, `advanceTime`, `spendHitDie`, `completeShortRest`, `completeLongRest`, `consumeItem`, `equipItem`, `overrideValue`, `undo`.

Schemas and event log: [DATA.md](DATA.md).

## 7. Acceptance

The Fool scenario in [TEST_CHARACTER.md](TEST_CHARACTER.md) must pass as an engine test (Vitest) and as an end-to-end test (Playwright).

## 8. Definition of done (Phase 1)

- Every visible button does the correct thing. No dead buttons (placeholders say "Coming in Phase N").
- Same values on HUD, Dashboard, Spellbook, Combat, Exploration at all times.
- Data survives refresh and works offline (PWA).
- No 2024 rules.
- Rest, slots, resources, concentration, and turn economy are correct for The Fool.
- DM-dependent outcomes stay editable. Every resource change can be inspected in the log and undone.
- Usable at 375 px mobile and desktop. Keyboard accessible. Reduced motion respected.
