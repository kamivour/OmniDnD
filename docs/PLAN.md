# OmniDnD — Plan: accounts, party play, tutorial

Proposed 2026-11-09. User answers to the open questions are recorded as D168–D174. Nothing here is built yet; work starts after the live-site testing phase. Build one milestone at a time, in the order below.

| ID | Milestone | Needs | Exit criteria |
|---|---|---|---|
| M22 | Accounts, finished | MA | Signed-in players stay in sync without pressing anything, can reset a password, and have a name others can see |
| M23 | Tutorial | — | A first-time visitor on a device learns the menus in about two minutes, can skip at any time, and can replay any part later |
| M24 | Roles and shared campaigns | M22 | A DM and players share one campaign; everyone sees every party character live; each player changes only their own |
| M25 | DM party overview | M24 | The DM sees the whole party's key numbers at a glance |

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
| Change the character (live state or build) | Yes | No | No (Q39) |
| Duplicate it into your own space | Yes | Yes | Yes |
| Delete it or remove it from the campaign | Yes | No | Remove only |
| Change campaign books and optional rules | No | No | Yes (owner, if no DM) |
| Read a private journal entry | Yes | No | No |

- Opening someone else's character shows the full sheet with all screens read-only and a banner: "Ana's character · view only." with a **Duplicate** button. Commands are disabled, not hidden, so the layout matches.
- To fix a mistake, a player tells the owner; the owner makes the change. (A later idea, not planned: "suggest a fix" that the owner accepts.)
- If Q39 is answered "the DM can change characters", add event authorship (`by { userId, name }` on each log event) and multi-editor Undo (D170) to this milestone.

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

## Risks
- **Free hosting limits:** Supabase allows 200 live connections and 500 MB of storage; records are capped at 5 MB (our limit). Long event logs grow records; a later fix is a snapshot plus trimmed history.
- **Security:** shared access depends entirely on row-level security, so every rule gets a test. Invite codes are random, hashed and expire. Emails are never shown to other members.

## Open question
| Q | Question | Default |
|---|---|---|
| Q39 | Can the DM change players' characters? | No: view only like other players; the DM can duplicate, and the player makes the fix |
