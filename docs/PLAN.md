# OmniDnD — Plan: accounts, party play, tutorial

Proposed 2026-11-09. Nothing here is built yet. Work starts after the live-site testing phase and the user's approval of this plan. Build one milestone at a time, in the order below.

| ID | Milestone | Needs | Exit criteria |
|---|---|---|---|
| M22 | Accounts, finished | MA | Signed-in players stay in sync without pressing anything, can reset a password, and have a name others can see |
| M23 | Tutorial | — | A new person learns the menus in about two minutes, can skip at any time, and can replay any part later |
| M24 | Roles and shared campaigns | M22 | A DM and players share one campaign; everyone sees every party character; anyone allowed can fix a mistake, and the change shows who made it and can be undone |
| M25 | DM tools | M24 | A DM can see the whole party at a glance and run rests, time and rewards for the party, with every change logged |

The tutorial comes before party play because friends are testing now, and it builds the tour system that M24 and M25 then add their own steps to.

---

## M22 — Accounts, finished

**Already built (MA):** email and password sign-in, Sync now, one private cloud row per campaign or character, conflicts that ask which copy to keep (D122), guest mode unchanged.

**Missing:** automatic sync, a way back in after a forgotten password, a display name, account deletion, and fewer conflicts.

### Tasks

1. **Profiles table.** New migration: `profiles (user_id pk, display_name 1–40 chars, tutorial jsonb, created_at)`. Row-level security: you read and write only your own row (M24 widens read access to party members, for the name only). Add a static schema test like the existing one.
2. **Display name.** Asked once, right after Create account, and editable in Settings → Account. It is shown to your party, never your email.
3. **Password help.**
   - Add Forgot password: Supabase sends a reset email that opens a new `/reset-password` route to set a new password.
   - Add Change password for signed-in users.
   - Add both reset URLs to the Supabase redirect list (HOSTING.md step).
4. **Delete account.**
   - Settings → Account → Delete account. You type `DELETE` to confirm.
   - A database function deletes the account, and your cloud rows go with it.
   - Everything stays on this device as guest data. A backup is made first.
5. **Automatic sync** (replaces D124).
   - Sync runs on sign-in, on app open, when the tab comes back into view, and when the device is back online.
   - It also runs about 3 seconds after the last saved change, and at most every 30 seconds while you keep editing.
   - Only one tab syncs at a time. After an error, it retries after 5 s, then 30 s, then every 2 min.
   - Sync now stays.
6. **Sync status in the top bar.** States: Synced · Syncing · Offline, saved on this device · Needs your choice. Tapping it opens Settings → Account. A successful sync shows no message.
7. **Fewer conflicts (automatic merge).** Each event already stores patches (`src/engine/schema/log.ts`). Rules:
   - If both sides changed a character but touched **different paths**, apply this device's new events on top of the cloud copy, with no question.
   - If any path overlaps, or a merged result fails validation, ask as today (D122).
   - Campaign records merge field by field the same way.
   - This needs the id of the last synced event, stored per record.
8. **Gate.**
   - Two browsers on one account: a change on one shows on the other within about 5 s of focusing it.
   - Offline edits upload on reconnect.
   - Edits to different fields merge; edits to the same field ask.
   - Guest builds are unchanged.
   - Manual QA added.

---

## M23 — Tutorial

### Who sees it
- **Guests:** the Welcome chapter on the first visit on a device.
- **New accounts:** the Welcome chapter after Create account, unless it was already finished or skipped as a guest. In that case it is marked done in the profile.
- **Returning accounts on a new device:** nothing. Progress syncs through `profiles.tutorial`.

### How it looks
- **Spotlight:** the page dims, one element is highlighted, and a card explains it.
- **Card contents:**
  - a title and 1–2 sentences in plain words;
  - Back and Next;
  - a step count such as "3 of 7";
  - **Skip tutorial**, on every card.
- **Placement:** the card docks at the bottom of the screen on phones (thumb reach) and beside the highlighted element on desktop.
- **Reading only:** the tutorial never makes you tap the real control. It explains and moves on, so you cannot get stuck.
- **Each step points at a `data-tour` id.** A step can name a phone target (bottom nav) and a desktop target (sidebar). If the target is missing, the card shows centered instead of stalling.
- **Skip:** closes at once, with no confirmation. A short note says "Replay any time from Settings → Tutorial".

### Chapters
Each chapter has at most 8 steps and starts only when its screen exists, so nobody tours an empty character.

| Chapter | Starts | Covers |
|---|---|---|
| A. Welcome | First visit to the campaign list | What the app does (it tracks, you and the DM decide); Campaigns; New campaign; New character; Find (Ctrl+K or `/`); Settings (theme, account, backups); where to replay the tutorial |
| B. Your character | First time a character opens | HUD (HP, AC, slots, conditions; tap to change); each menu in one line (Dashboard, Sheet, Spells, Combat, Exploration, Rest, Inventory, Features, Journal, Companions); To do badge; history row and Undo; Sheet → **Edit** to fix any number |
| C. Screen tips | First visit to Combat, Spells, Rest, Inventory or level-up | 2–4 steps for that screen. Combat: start turn, act, enter damage, end turn, "you enter hits; the app never decides". Spells: slots, Cast, Manage spells, Pending picks, tap a name to read it. Level-up: choices, and skipped ones wait in To do |
| D. Party and DM | Added in M24 and M25 | Party view, invites, others' changes show their name, DM tools |

### Settings and Find
- **Settings → Tutorial:**
  - "Show screen tips" switch (on by default);
  - Replay buttons, one per chapter;
  - "Reset tips".
- **Find:** the words tutorial, tour, help and guide open Settings → Tutorial.

### Rules
- Tutorial state is not character state. It does not go through engine commands, Undo or backups.
  - It is device state, synced to the profile when you are signed in.
  - This is a narrow exception to D121, which keeps device preferences off the cloud.
- **Accessibility:**
  - The card is a dialog. Focus moves to it, arrow keys move between steps, and Escape skips the chapter.
  - The highlighted element is named for screen readers.
  - No animation with reduced motion.
  - It works at 375 px, and the target is scrolled into view.
  - The tutorial never shows in print.
- **Built in house** on floating-ui, which the app already uses, so it follows the theme tokens. No tour library.
- **One step list** in `src/ui/tutorial/steps.ts`. Add a rule to AGENTS.md: a new screen adds its tips, like Find entries.

### Tasks
1. Tour engine: spotlight, card, placement, progress storage per device; unit tests for step order and missing targets.
2. Chapter A and the Settings → Tutorial section, plus Find entries.
3. Chapter B (character workspace).
4. Chapter C screen tips, and the "Show screen tips" switch.
5. Sync tutorial progress through `profiles.tutorial` (needs M22).
6. **Gate.**
   - A new guest sees Welcome.
   - Skipping on step 1 never shows it again, and Replay works.
   - Every `data-tour` target exists at 375 px and at 1440 px (e2e).
   - Manual QA reads the wording.

---

## M24 — Roles and shared campaigns

### Role dialog
- **New campaign.** First, a separate dialog asks "How will you use this campaign?"
  - **I'm the DM:** you run the game and see the whole party.
  - **I'm a player:** you play your own character.

  The answer is saved as your role in that campaign and can be changed in Campaign Setup. Existing campaigns become Player.
- **New character.** A separate dialog asks "Who plays this character?"
  - **Me:** the default for players.
  - **Another player:** you build it now and they claim it when they join.
  - **The DM (NPC or sidekick):** offered only when you are the DM.
- **Guests:** they can pick a role too. Sharing asks them to sign in first.

### How sharing works
1. **Share.** The campaign owner opens Campaign Setup → Party → **Share with party**. This moves the campaign and its characters into the shared space.
2. **Invite.** Invite players makes a join link (`/join/CODE`). The link lasts 7 days and can be replaced or revoked.
3. **Join.** A signed-in friend opens the link. They see the campaign name, the DM and the members, then press **Join as player**. They bring an existing character or create a new one, which opens the "Who plays this character?" dialog.
4. **Members list.**
   - Shows each member's name, role and characters.
   - The owner or DM can remove a member, and members can leave.
   - A leaving player keeps a private copy of their character. The party copy stays, marked "left", and can no longer be edited.

### Who can do what
This uses the default campaign setting, **Party can fix each other's characters: on**.

| Action | Character's player | Other players | DM |
|---|---|---|---|
| See every party character | Yes | Yes | Yes |
| Change live state (HP, slots, conditions, rests) | Yes | Yes, when the setting is on | Yes |
| Change the build (level, abilities, spells known) | Yes | Yes, when the setting is on | Yes |
| Delete the character or remove it from the campaign | Yes | No | Yes |
| Change campaign books and optional rules | No | No | Yes (the owner, if there is no DM) |
| Read a private journal entry | Yes | No | No |

- **Every change shows who made it.**
  - The history row shows the author's initials.
  - The character's player sees "3 changes by others since you last looked", which links to the history.
- **Opening someone else's character** shows a banner: "Ana's character. Your changes show your name." When the setting is off, it is view only.

### Data and sync
- **New tables:**
  - `shared_campaigns`
  - `campaign_members (campaign_id, user_id, role)`
  - `campaign_invites` (code stored hashed, expiry, revoked)
  - `party_entities` (like `sync_entities`, keyed by campaign, plus `owner_id` and `changed_by`)
- **Access rules:**
  - Row-level security uses `is_member(campaign)` and `can_edit(campaign, owner)` checks.
  - Joining goes through one database function, `join_campaign(code)`, so codes cannot be listed or guessed in bulk.
  - The app never holds a service key.
- **Authorship:** each log event gains an optional `by { userId, name }`. The persistence layer stamps it; the engine only stores it, so it stays pure. This is a schema version bump with a migration.
- **Live updates:** while a shared campaign is open, the app listens for changes (Supabase Realtime), so they show within about 2 seconds. The M22 automatic sync is the fallback.
- **Offline:** shared campaigns are cached on the device like today, and edits wait for the connection.
- **Undo with several editors:**
  - Undo reverses your own latest change on that character.
  - If someone changed the same values after you, it warns: "Ana changed this after you. Undo anyway?"
  - If the reversal no longer fits, it is blocked with a reason.
  - This uses the same path check as the M22 merge.

### Screens
- **Campaign card:**
  - a role badge (DM or Player);
  - a "Shared · 4 members" chip;
  - a sync dot.
- **Characters list:** groups "Mine" and "Party", with each player's name.
- **Party view** (`/campaigns/:id/party`; takes over the backlog item). It shows one card per character:
  - HP bar and temp HP;
  - AC;
  - conditions and concentration;
  - slots left;
  - passive Perception;
  - spell save DC;
  - To do count.

  It is a list on phones and a grid on desktop. Tapping a card opens the character. It gets a Find entry and a tutorial step.

### Tasks
1. Role dialogs for campaigns and characters (works for guests too); store the role; migration for existing campaigns.
2. Database: shared tables, access rules, `join_campaign`, and profile names readable by party members; static schema tests, plus a test script against a throwaway Supabase project.
3. Event authorship (`by`) in the log, with a schema migration.
4. Share a campaign, invite links, join flow, members list, leave and remove.
5. Party sync: upload and download of shared records, live updates, automatic merge and conflict questions that name the other editor.
6. Editing others' characters: banner, permission setting, "changes by others" notice, multi-editor Undo.
7. Party view.
8. Tutorial chapter D (party part) and Find entries.
9. **Gate.**
   - Three test accounts (DM and two players) share a campaign.
   - A player fixes another player's HP, and the owner sees the change with the name and can undo it.
   - Access rules block non-members.
   - Offline edits merge.
   - Guest mode is unchanged.

---

## M25 — DM tools

The app still never decides outcomes: DM tools record what the DM says, as logged commands on each character. Proposed tools, most useful first:

1. **DM party overview.** Party view plus:
   - passive Insight and Investigation;
   - all saves;
   - languages;
   - exhaustion and death saves;
   - Inspiration.

   You can sort it and pick what shows.
2. **Party actions:**
   - Long rest for the chosen characters.
   - Short rest: each player gets a To do item to spend Hit Dice, because that choice is theirs.
   - Advance the game clock for the whole party, using a campaign clock that the characters follow.
3. **Rewards:** give Inspiration, XP or a level-up go-ahead, coins, or items to one or more characters.
4. **DM notes and handouts:** private DM notes per campaign; handouts appear in players' Journals.
5. **Optional approval:** a campaign setting, off by default, where players' build changes wait for the DM's OK.
6. **Later (own milestone):** a shared encounter tracker where the DM runs initiative and players see whose turn it is. D141 already keeps encounters as separate records for this.

### Tasks
1. DM party overview.
2. Party rest and the campaign clock.
3. Rewards.
4. DM notes and handouts.
5. Optional build approval.
6. Gate: one DM session runs rests, time and rewards for three characters; each player sees the changes with the DM's name and can undo their own.

---

## Risks
- **Free hosting limits:**
  - Supabase allows 200 live connections, 500 MB of storage, and 5 MB per record (our own limit).
  - Long event logs grow records over time. A later fix is to keep a snapshot and trim old history.
- **Security:**
  - Shared access depends entirely on row-level security, so every rule gets a test.
  - Invite codes are random, hashed and expire.
  - Emails are never shown to other members.
- **Many hands, one sheet:** confusion is the main risk. Authorship on every change, the "changes by others" notice and Undo are the answer, and none of them is optional.

## Open questions
These are also listed in DECISIONS.md. Each has a safe default that the plan uses until answered.

| Q | Question | Default |
|---|---|---|
| Q32 | Should guests see the tutorial, or only new accounts? | Guests too, on their first visit |
| Q33 | May other players change a party member's build, or only live state? | Both, when the campaign setting is on; the DM always can |
| Q34 | How does Undo work when several people edit one character? | Undo your own latest change; warn when someone changed the same values after you |
| Q35 | How many DMs can a campaign have? | Any number of co-DMs, chosen by the owner |
| Q36 | What happens to a character when its player leaves the campaign? | The player keeps a private copy; the party copy stays, marked "left" and view only |
| Q37 | Which DM tools come first? | Overview, party rest and clock, rewards (M25 tasks 1–3) |
| Q38 | Should there be a "?" help button in the top bar? | No; use Settings → Tutorial and Find |
