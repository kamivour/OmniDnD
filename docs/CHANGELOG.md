# OmniDnD — Changelog

What changed, newest first, in plain language. One entry per finished task, written when its git commit is made. Times are local (UTC+7).

Entries before 2026-11-02 02:30 were written up later from the PROGRESS.md session log; their time was not recorded. Before the first commit (2026-11-02 02:59) there is no git history for them.

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
