# OmniDnD — Plan: accounts, party play, tutorial

Proposed 2026-11-09. User answers to the open questions are recorded as D168–D175. Nothing here is built yet; work starts after the live-site testing phase. Build one milestone at a time, in the order below.

| ID | Milestone | Needs | Exit criteria |
|---|---|---|---|
| M22 | Accounts, finished | MA | Signed-in players stay in sync without pressing anything, can reset a password, and have a name others can see |
| M23 | Tutorial | — | A first-time visitor on a device learns the menus in about two minutes, can skip at any time, and can replay any part later |
| M24 | Roles and shared campaigns | M22 | A DM and players share one campaign; everyone sees every party character live; each player changes only their own |
| M25 | DM party overview | M24 | The DM sees the whole party's key numbers at a glance |
| M26 | Friend-testing fixes | M25 | A new player on a phone creates a character without confusion, finds sign-up, and starts with no sample character |

The tutorial comes before party play because friends are testing now, and it builds the tour system that M24 and M25 add their own steps to.

---

## M22 — Accounts, finished

**Already built (MA):** email and password sign-in, Sync now, one private cloud row per campaign or character, conflicts that ask which copy to keep (D122), guest mode unchanged.

**Missing:** automatic sync, a way back in after a forgotten password, a display name, account deletion, fewer conflicts.

### Tasks

1. **Profiles table.** New migration: `profiles (user_id pk, display_name 1–40 chars, created_at)`. Row-level security: you read and write only your own row (M24 lets party members read the name only). Static schema test like the existing one.
2. **Display name.** Asked once right after Create account, editable in Settings → Account. Shown to your party; your email never is.
3. **Password help.** Forgot password (Supabase reset email opens a new `/reset-password` route to set a new one) and Change password for signed-in users. Add both URLs to the Supabase redirect list (HOSTING.md step).
4. **Delete account.** Settings → Account → Delete account, confirmed by typing `DELETE`. A database function deletes the account; cloud rows go with it. Everything stays on this device as guest data, with a backup made first.
5. **Automatic sync** (replaces D124). Sync runs on sign-in, app open, when the tab comes back into view, about 3 seconds after the last saved change (at most every 30 seconds while editing), and when back online. One tab syncs at a time. After an error it retries at 5 s, 30 s, then every 2 min. Sync now stays.
6. **Sync status in the top bar.** Synced · Syncing · Offline, saved on this device · Needs your choice. Tap opens Settings → Account. No message on success.
7. **Fewer conflicts (automatic merge).** Each event already stores patches (`src/engine/schema/log.ts`). When both sides changed a character but touched **different paths**, apply this device's new events on top of the cloud copy with no question. If any path overlaps or the merged result fails validation, ask as today (D122). Campaign records merge field by field the same way. Needs the last synced event id stored per record.
8. **Gate.** Two browsers on one account: a change on one shows on the other within about 5 s of focusing it; offline edits upload on reconnect; edits to different fields merge, the same field asks; guest builds unchanged; manual QA added.

---

## M23 — Tutorial

### Who sees it (D168)
Everyone, guest or signed in, on their **first visit on each device**. Progress stays on that device and does not sync.

### How it looks
- **Spotlight:** the page dims, one element is highlighted, and a card explains it: title, 1–2 plain sentences, Back / Next, "3 of 7", and **Skip tutorial** on every card.
- The card docks at the bottom on phones (thumb reach) and beside the highlighted element on desktop.
- **Reading only:** steps explain and move on; nothing forces you to tap the real control, so you cannot get stuck.
- Each step points at a `data-tour` id, with a phone target (bottom nav) and a desktop target (sidebar) where they differ. If the target is missing, the card shows centered instead of stalling.
- **Skip** closes at once, no confirmation, with one short note: "Replay any time from Settings → Tutorial".

### Chapters
Each chapter has at most 8 steps and starts only when its screen exists, so nobody tours an empty character.

| Chapter | Starts | Covers |
|---|---|---|
| A. Welcome | First visit to the campaign list | What the app does (it tracks; you and the DM decide); Campaigns; New campaign; New character; Find (Ctrl+K or `/`); Settings (theme, account, backups); where to replay the tutorial |
| B. Your character | First time a character opens | HUD (HP, AC, slots, conditions; tap to change); each menu in one line (Dashboard, Sheet, Spells, Combat, Exploration, Rest, Inventory, Features, Journal, Companions); To do badge; history row and Undo; Sheet → **Edit** to fix any number |
| C. Screen tips | First visit to Combat, Spells, Rest, Inventory or level-up | 2–4 steps for that screen. Combat: start turn, act, enter damage, end turn, "you enter hits; the app never decides". Spells: slots, Cast, Manage spells, Pending picks, tap a name to read it. Level-up: choices, and skipped ones wait in To do |
| D. Party and DM | Added in M24 and M25 | Party view, invites, view-only party characters, Duplicate, DM overview |

### Settings and Find (D174: no "?" button in the top bar)
- **Settings → Tutorial:** "Show screen tips" switch (on by default), Replay buttons per chapter, "Reset tips".
- **Find:** tutorial, tour, help and guide open Settings → Tutorial.

### Rules
- Tutorial state is device state, not character state: no engine commands, Undo, backups or sync.
- Accessibility: the card is a dialog; focus moves to it; arrow keys move between steps; Escape skips the chapter; the highlighted element is named for screen readers; no animation with reduced motion; works at 375 px; the target is scrolled into view; never shows in print.
- Built in house on floating-ui (already used), so it follows theme tokens. No tour library.
- One step list in `src/ui/tutorial/steps.ts`. AGENTS.md rule: a new screen adds its tips, like Find entries.

### Tasks
1. Tour engine: spotlight, card, placement, progress stored on the device; unit tests for step order and missing targets.
2. Chapter A plus Settings → Tutorial and Find entries.
3. Chapter B (character workspace).
4. Chapter C screen tips and the "Show screen tips" switch.
5. **Gate.** A first visit on a fresh browser shows Welcome; skipping on step 1 never shows it again on that browser; Replay works; every `data-tour` target exists at 375 px and 1440 px (e2e); manual QA reads the wording.

---

## M24 — Roles and shared campaigns

### Role dialog
- **New campaign:** first a separate dialog asks "How will you use this campaign?" — **I'm the DM** (run the game, see the whole party) or **I'm a player** (play your own character). Saved as your role in that campaign; changeable in Campaign Setup. Existing campaigns become Player.
- **New character:** a separate dialog asks "Who plays this character?" — **Me** (default for players), **Another player** (built now, claimed when they join), or **The DM (NPC or sidekick)**, offered only to the DM.
- Guests can pick a role too; sharing asks them to sign in first.

### How sharing works
1. The campaign owner opens Campaign Setup → Party → **Share with party**. This moves the campaign and its characters into the shared space.
2. **Invite players** makes a join link (`/join/CODE`) that lasts 7 days and can be replaced or revoked.
3. A signed-in friend opens the link, sees the campaign name, DM and members, and presses **Join as player**. They bring an existing character or create one.
4. **Members list:** name, role, characters. Exactly **one DM** per campaign (D171); the owner can hand the DM role to another member. The owner or DM can remove a member; members can leave. A leaving player keeps a private copy of their character; the party copy stays, marked "left", view only (D172).

### Who can do what (D169)
| Action | Character's player | Other players | DM |
|---|---|---|---|
| See every party character, live | Yes | Yes | Yes |
| Change the character (live state or build) | Yes | No | No (D175) |
| Duplicate it into your own space | Yes | Yes | Yes |
| Delete it or remove it from the campaign | Yes | No | Remove only |
| Change campaign books and optional rules | No | No | Yes (owner, if no DM) |
| Read a private journal entry | Yes | No | No |

- Opening someone else's character shows the full sheet with all screens read-only and a banner: "Ana's character · view only." with a **Duplicate** button. Commands are disabled, not hidden, so the layout matches.
- To fix a mistake, a player or the DM tells the owner; the owner makes the change. (A later idea, not planned: "suggest a fix" that the owner accepts.)

### Data and sync
- **Tables:** `shared_campaigns`, `campaign_members (campaign_id, user_id, role)` with at most one DM per campaign, `campaign_invites` (code stored hashed, expiry, revoked), `party_entities` (like `sync_entities`, keyed by campaign, plus `owner_id`).
- **Row-level security:** members read every row in their campaign; only the character's owner writes it; only the DM (or owner without a DM) writes the campaign record. Joining goes through one database function, `join_campaign(code)`, so codes cannot be listed or guessed in bulk. The app never holds a service key.
- **Live updates:** while a shared campaign is open, the app listens for changes (Supabase Realtime), so they show within about 2 seconds; M22 automatic sync is the fallback.
- **Offline:** shared campaigns are cached on the device; others' characters are read-only copies; your own edits wait for the connection.
- Because only the owner writes a character, conflicts stay between the owner's own devices, which M22's merge already handles.

### Screens
- **Campaign card:** role badge (DM or Player), "Shared · 4 members" chip, sync dot.
- **Characters list:** groups "Mine" and "Party", with each player's name.
- **Party view** (`/campaigns/:id/party`): one card per character with HP bar, temp HP, AC, conditions, concentration, slots left, passive Perception, spell save DC. List on phones, grid on desktop; tap opens the character (view only if not yours). Find entry and tutorial step.

### Tasks
1. Role dialogs for campaigns and characters (guests too); store the role; migration for existing campaigns.
2. Database: shared tables, row-level security, one-DM rule, `join_campaign`, party members can read profile names; static schema tests plus a test script against a throwaway Supabase project.
3. Share a campaign, invite links, join flow, members list, hand over DM, leave and remove.
4. Party sync: download all party records, upload your own, live updates.
5. View-only character mode: banner, disabled commands, Duplicate.
6. Party view.
7. Tutorial chapter D (party part) and Find entries.
8. **Gate.** Three test accounts (DM and two players) share a campaign; each sees the others' HP change live; no one can change another's character (checked in the UI and by row-level security); Duplicate makes an independent copy; non-members see nothing; guest mode unchanged.

---

## M25 — DM party overview (D173)

The DM's version of Party view, still read-only: everything in Party view plus passive Insight and Investigation, all six saves, languages, exhaustion, death saves, Inspiration and To do count. Sort by any column; pick which columns show; phone shows one character per row with a column picker.

### Tasks
1. DM overview layout and column picker.
2. Tutorial chapter D (DM part) and Find entry.
3. **Gate.** The DM sees all party characters update live at 375 px and 1440 px; manual QA judges what a DM needs at the table.

### Later DM ideas (backlog, not planned)
Map import, monster and NPC management, rewards (XP, Inspiration, coins, items), DM-run level-ups, ambient background sounds, party rests and a shared clock, DM notes and handouts, a shared encounter tracker.

---

## M26 — Friend-testing fixes

From friends testing the live site on 2026-11-10. Small fixes first, the larger content and layout work last.

### Tasks
1. **Number fields.** One shared number input: Backspace clears it while typing, and the value is checked and clamped when you leave the field. Use it for Level and every other number field that snaps back today. In ability scores, Enter moves to the next score (the last one moves on to the next section) instead of submitting.
2. **True Neutral.** The alignment list says "True Neutral" instead of "Neutral"; characters saved as "Neutral" read as True Neutral (Q41).
3. **Spell Pending opens the right list.** Pending on a Level 1 row opens Manage spells scrolled to and filtered on 1st-level picks, with cantrips hidden behind "Show all". Pending on Cantrips does the same for cantrips.
4. **No sample character on new devices.** A fresh device starts empty. The Campaigns page offers "Try the sample character" to add the Fool on demand. Devices that already have the Fool keep it. Tests still start with the Fool.
5. **Accounts are easy to find.** When signed out (and accounts are set up), the Campaigns page shows a short card, "Keep your characters on every device", with Sign in and Create account. It can be hidden; Settings keeps the full panel. The welcome tour points at it.
6. **Cautions stand out.** One caution style (warn colour, warning icon, slightly bolder) for weaknesses in the class, race and background guides, unmet requirements, and hints that warn of a consequence ("locks once saved", "can't be undone"). Errors that block saving use the danger colour.
7. **Clearer headings and subclass cards.** Field labels and section headings get bigger and bolder so each block has a clear title. The subclass choice becomes separate cards, each with an icon, name, one-line pitch and difficulty, in creation and level-up. Icons come from game-icons.net (already credited). DESIGN.md gets the new heading sizes.
8. **All PHB backgrounds.** Schema: backgrounds gain language choices, tool choices and variants. Data in our own words for the 11 missing PHB backgrounds (Criminal, Entertainer, Folk Hero, Guild Artisan, Hermit, Noble, Outlander, Sage, Sailor, Soldier, Urchin), their features and guidance; the PHB variants (Spy, Gladiator, Guild Merchant, Knight, Pirate) and a Custom background (Q42). Creation asks for the background's languages and tools.
9. **Stats button for summons.** Features and spells with a companion template (Steel Defender, Eldritch Cannon, Find Familiar, Find Steed, Ranger's companion) show a small Stats button next to Use or Cast. It opens that creature on the Companions screen: the existing one if you have it, otherwise the add form filled from the template. No new tab or screen. Conjure and Tasha's summon spells follow Q43.
10. **Gate.** At 375 px and 1440 px a new visitor sees no sample character, finds Create account, picks True Neutral and any PHB background, types scores with Enter, clears Level with Backspace, sees subclass cards and orange or red cautions, Pending at Level 1 shows only 1st-level spells, and an Artillerist's Eldritch Cannon card has a Stats button that opens the cannon's stats. Manual QA list added.

---

## M27–M38 — Missing content (PHB, then Tasha's, then Xanathar's)

Own-words data in `data/content/`, tagged with its book so Campaign Setup can switch it off. Anything that changes a number goes through the engine, with tests. One milestone per commit; each ends with a check at 375 px and 1440 px.

- **M27 — PHB races and Beast Master.** Wood Elf, Drow, Mountain Dwarf, Stout Halfling, Forest Gnome, Variant Human. Ranger Beast Master with a companion picked from SRD beasts, with a Stats button.
- **M28 — PHB martial subclasses.** Totem Warrior, Battle Master (maneuvers, dice, DC), Eldritch Knight, Shadow, Four Elements, Ancients, Vengeance, Assassin, Arcane Trickster.
- **M29 — PHB caster subclasses.** Valor, six Cleric domains, Moon, Wild Magic, Archfey, Great Old One, seven Wizard schools.
- **M30 — PHB non-SRD spells.** Hex and Hunter's Mark get damage riders.
- **M31 — Tasha's options.** Custom Lineage, 7 feats, Primal Companion, extra maneuvers, metamagic and invocations, Pact of the Talisman.
- **M32 — Tasha's spells.** Nine Summon spells with stat templates (Q43).
- **M33–M34 — Tasha's subclasses.** Two halves.
- **M35 — Xanathar's options.** Racial feats whose race exists, invocations.
- **M36 — Xanathar's spells.** Cantrips to 3rd, then 4th to 9th.
- **M37–M38 — Xanathar's subclasses.** Two halves.

Left out: downtime, encounter building, other books' races.

---

## M39 — Themes

Asked for on 2026-11-13: a modern dark theme for a friend, a glass theme, a water theme, and themes for D&D places. Each theme gives the "OmniDnD" title its own effect. Phones stay fast and calm; desktops get the full effects.

### Principles
- **Data never moves.** Effects only touch the title, the page background, and press feedback. HP, slots, dice and text stay flat and readable in every theme. This changes DESIGN.md §1: Dark and Parchment stay flat, and other themes may add effects inside these limits.
- **Three effect levels** on `<html data-fx>`:
  - **Off:** no animation at all, and the title is static. Forced by reduced motion (the system setting or ours).
  - **Lite:** the phone default (touch screen or narrower than 1024 px). The title gets a static gradient and the background a static image. Tap ripples are allowed. Glass blur is used only on the top bar, bottom bar and sheets. Nothing loops.
  - **Full:** the desktop default (mouse and at least 1024 px wide). The title is animated, and there is one background layer of particles or waves. Glass gets a sheen that follows the pointer.
- **Settings** gets "Theme effects: Auto / Full / Off". It is a per-device setting, like the theme.
- **Cheap effects only.** Use CSS only. Animate only `transform` and `opacity`, on one fixed layer behind the content. Pause when the tab is hidden. Use no canvas, no WebGL and no JS animation loop. The one exception is a small pointer handler for the glass sheen and the water ripple.
- **Readable first.** Every theme passes WCAG AA: text and muted text reach 4.5:1 on bg, surface and surface-2, and accent reaches 3:1. A unit test checks every theme automatically. Danger, heal and warn must stay easy to tell apart.
- **Own names.** Nothing is named after a company's product: the friend's theme is "Midnight", not iOS, and the glass theme is "Prism", not Liquid Glass. D&D place names are used only as theme labels (Q44).

### Themes (15 plus System)
Palettes are starting points; contrast tests decide the final values.

| Group | Theme | Look | Title effect (full) | Background (full) | Phone (lite) |
|---|---|---|---|---|---|
| Basic | Dark (current) | Deep blue with gold | none | flat | same |
| Basic | Parchment (current) | Soft light paper | none | flat | same |
| Basic | Midnight | True black, grey layered cards, blue accent, system font, rounder corners | none (clean) | flat | same |
| Glass | Prism | Frosted see-through cards over soft colour blobs, bright edge highlights | slow light sweep across the letters | drifting colour blobs; pointer sheen on cards | static blobs, blur on bars and sheets only |
| Glass | Tidewater | Clear aqua glass, sea-blue accent | gentle wave in the letters | moving light patterns (caustics) | static caustic image; ripple on tap |
| Planes | Elemental Plane of Fire | Charcoal and ember orange; danger moves to crimson so it differs from the accent | slight burning flicker with a heat shimmer | rising embers | static ember gradient |
| Planes | Nine Hells | Blood red and brass, Avernus dust | slow hellfire pulse | drifting ash | static |
| Planes | Feywild | Twilight violet, pink accent, mint magic | iridescent shimmer, small sparkles | floating motes | static iridescent gradient |
| Planes | Shadowfell | Desaturated grey, muted accent | letters fade in and out of shadow | slow shadow wisps | static |
| Planes | Astral Sea | Silver on deep indigo | twinkling stars in the letters | slow star field | static |
| Planes | Mechanus | Brass and steel | small ticking gear beside the title | faint rotating gear lines | static |
| Places | Icewind Dale | Pale ice blue on dark slate | frost creeping over the letters | falling snow | static frosted gradient |
| Places | Underdark | Deep violet with faerzress glow, fungus cyan | soft glow that pulses | faint glowing spores | static |
| Places | Barovia | Gothic crimson and grey mist | flickering candlelight | low rolling mist | static |
| Light | Mount Celestia | Warm white and gold (light theme) | radiant shine across the letters | soft light rays | static |

Later, if wanted: Elemental Planes of Water, Air and Earth, Sigil, Chult, Eberron.

### Architecture
- **Theme registry** `src/theme/themes.ts`: id, name, one-line hint, group, light or dark scheme, swatch colours, `theme-color`, and the effects it has. The picker, Find, the `<meta name="theme-color">` update and the tests all read this list.
- **One CSS file per theme** under `src/theme/themes/`, each a `:root[data-theme='id']` block with the same tokens as now. New tokens: `--omni-font-display`, `--omni-radius-*`, `--omni-glass-alpha`, `--omni-glass-blur`, `--omni-bg-image` and `--omni-title-*`. Themes without effects set only colours.
- **`ThemeTitle` component** replaces the title text in HubFrame and SideNav. Its accessible name stays "OmniDnD", and decorative layers are `aria-hidden`.
- **`AmbientLayer`**: one fixed, `pointer-events: none` element behind the app. It renders only at the full level, and only for themes with a background effect.
- **Ripple and sheen**: one delegated pointer listener on the root that adds a short-lived span on buttons. It is on only for Tidewater (ripple) and Prism (sheen).
- **Theme choice** stays per device. Saved values that no longer exist fall back to System.
- **Print** always uses the plain print sheet, whatever the theme.

### Tasks
1. **Foundation.** Theme registry, per-theme CSS files, the new tokens, `theme-color` updates, an automatic contrast test over every theme, effect levels with the "Theme effects" setting, and fallback for unknown saved themes. Update DESIGN.md §1, §2 and §5, and add the D191 decision.
2. **Theme picker.** A grid of swatch cards grouped as Basic, Glass, Planes, Places and Light. Each card shows a mini preview (bg, surface, accent and the title font) and a check mark on the current theme. It works at 375 px and has Find entries ("theme", "dark mode", "colours").
3. **Midnight.** The friend's theme: true black, system font and rounder corners. It has no effects.
4. **Title and background framework.** `ThemeTitle`, `AmbientLayer`, pausing on hidden tabs, and the off, lite and full switches. An e2e test checks that no animations run at lite and off.
5. **Prism.** Glass surfaces, colour blobs and the pointer sheen. Text stays readable on the blurred background, with a solid fallback when the browser has no `backdrop-filter`.
6. **Tidewater.** Water glass, caustics and the tap ripple.
7. **Places and planes, part 1.** Fire, Nine Hells and Icewind Dale.
8. **Places and planes, part 2.** Feywild, Shadowfell and Underdark.
9. **Places and planes, part 3.** Astral Sea, Mechanus, Barovia and Mount Celestia.
10. **Gate.** Screenshots of every theme at 375 px and 1440 px (Dashboard, Spellbook, Combat and a sheet). The contrast test passes. A desktop run keeps about 60 fps with full effects, and a phone run shows no running animations. Manual QA list added.

### Effort and risks
- About 10 tasks. Each new theme costs about one palette, one title effect and one background, plus screenshots.
- **Contrast** is the main risk on glass and on bright themes; the automatic test catches it.
- **Battery and heat:** looping effects on phones are the cost the lite level avoids.
- **Upkeep:** every new screen must look right in all 15 themes. Token-only styling keeps this cheap, and the screenshot gate catches breaks.

---

## Risks
- **Free hosting limits:** Supabase allows 200 live connections and 500 MB of storage; records are capped at 5 MB (our limit). Long event logs grow records; a later fix is a snapshot plus trimmed history.
- **Security:** shared access depends entirely on row-level security, so every rule gets a test. Invite codes are random, hashed and expire. Emails are never shown to other members.

## Open questions
M26: Q41 (alignment label), Q42 (background scope) and Q43 (conjure and summon spells) in DECISIONS.md. Earlier answers are D168–D175.
M39: Q44 (D&D place names as theme labels), Q45 (ripple on phones) and Q46 (theme per campaign) in DECISIONS.md.
