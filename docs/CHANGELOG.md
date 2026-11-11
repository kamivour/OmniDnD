# OmniDnD — Changelog

What changed, newest first. Times are local (UTC+7).

Entries before 2026-11-02 02:30 were recorded later; their times were not saved.

## 2026-11-12 00:22 — Tasha’s spells

- Added 20 Tasha’s spells: two cantrips, Mind Whip, Spirit Shroud, Intellect Fortress, Wrath of Nature, Blade of Disaster and more.
- The ten Summon spells open a ready-made creature on Companions. Its attack follows your spell attack; stats are for the base slot level, so raise HP and damage yourself when upcast.
- Next: Tasha’s subclasses.
Checks pass.

## 2026-11-12 00:17 — Tasha’s options

- Added Custom Lineage, seven Tasha’s feats, seven maneuvers, two metamagic options, eight invocations and Pact of the Talisman.
- Rangers can take Primal Companion (Land, Sea or Sky) in place of Ranger’s Companion; its stats scale on the Companions screen. Warlocks now pick their pact boon from a list.
- Check the companion numbers against your book. Next: Tasha’s spells.
Checks pass.

## 2026-11-12 00:10 — PHB spells

- Added 39 Player’s Handbook spells the SRD lacks (smites, Hex, Hunger of Hadar, auras, Tsunami, Power Word Heal and more), on the right class lists.
- Hex shows its extra 1d6 necrotic when you cast it. Hunter’s Mark now says it adds 1d6 on weapon hits.
- Check that rider damage is applied by you when you hit. Next: Tasha’s options.
Checks pass.

## 2026-11-12 00:06 — PHB caster subclasses

- Added College of Valor, six cleric domains, Circle of the Moon, Wild Magic, Archfey, Great Old One and the seven wizard schools.
- Domain Channel Divinity options spend the shared Channel Divinity uses. Moon druid forms spend Wild Shape uses.
- Check that domain and patron spell lists are text only: add those spells by hand. Next: PHB spells missing from the SRD.
Checks pass.

## 2026-11-12 00:00 — PHB martial subclasses

- Added Totem Warrior, Battle Master, Eldritch Knight, Way of Shadow, Way of the Four Elements, Oath of the Ancients, Oath of Vengeance, Assassin and Arcane Trickster.
- Eldritch Knight and Arcane Trickster now get spell slots and a spell list at level 3. Battle Master maneuvers, elemental disciplines and totem animals are picks at level-up.
- Check that school limits (abjuration/evocation, enchantment/illusion) are your call; the app does not block other spells. Next: PHB caster subclasses.

Checks pass.

## 2026-11-11 23:52 — PHB races and Beast Master

- New races: Wood Elf, Drow, Mountain Dwarf, Stout Halfling, Forest Gnome and Variant Human, each with guide cards.
- Rangers can pick Beast Master at level 3. Its Ranger's Companion feature has a Stats button that opens the companion form.
- Variant Human's skill and feat, and racial spells like Drow Magic, are added by hand in the sheet editor for now.
- Checks pass.

## 2026-11-11 23:09 — Stats button fixes

- Steel Defender now has its Stats button on the Features page and a row on the Combat bonus tab.
- On phones, summon spells keep their full name in the list; tap the spell to find Creature stats at the top of its preview.
- The sign-in card on Campaigns has a single frame now.
- Checks pass.

## 2026-11-11 14:48 — M26 gate

- Ten manual checks for this round of fixes are in MANUAL_QA.md. Please try them at phone and desktop width.
- The welcome tour test now matches the new sign-in step.
- Checks pass.

## 2026-11-11 14:13 — Stats button for summons
- Steel Defender, Eldritch Cannon, Find Familiar, Find Steed and Conjure spells now show a small Stats button beside Use or Cast.
- It opens that creature on Companions, or the add form pre-filled if you have none yet.
- Check it on a Conjure spell: the form opens so you pick a creature.
- Checks pass.

## 2026-11-11 14:07 — All PHB backgrounds
- New character offers every PHB background, the five variants (Spy, Gladiator, Guild Merchant, Knight, Pirate) and Custom.
- Backgrounds with open choices show pickers for languages, tools and skills; leave them blank to fill in on the sheet later.
- Check the wording of the new features in Features. Guild Merchant takes a second language instead of the navigator's-tools option.
- Checks pass.

## 2026-11-11 13:57 — Clearer labels and subclass cards
- Field labels and section headings are bigger and bolder.
- Subclass is now a list of cards with an icon, short pitch and difficulty, in creation, level-up and To do.
- Check both themes at phone width.
- Checks pass.

## 2026-11-11 13:52 — Cautions stand out
- Guide weaknesses, unfinished-step lists and level-up exceptions now show in orange with a warning icon.
- Blocking level-up errors are red.
- Check the colours in both themes.
- Checks pass.

## 2026-11-11 13:49 — Sign in from the Campaigns page
- A sign-in and Create account card now sits on the Campaigns page while you are signed out.
- Hide it with the X; Settings still has the account controls.
- The welcome tour has a new step for it.
- Checks pass.

## 2026-11-11 13:41 — New devices start empty
- A fresh install no longer shows The Fool.
- The Campaigns page has a Try the sample character button to add it.
- Devices that already have the Fool keep it.
- Checks pass.

## 2026-11-11 13:35 — Pending spells show the right list

- Pending on a spell row opens Manage spells showing only that kind of pick (cantrips, or spells above cantrips).
- A Show all button brings back the full list.
- Checks pass.

## 2026-11-11 13:35 — True Neutral

- The alignment list now says True Neutral. Older characters saved as Neutral show the new name.
- Checks pass.

## 2026-11-11 13:35 — Easier typing in New character

- You can clear the Level box with Backspace and type a new number; it is checked when you leave the field.
- Enter in an ability score or HP roll moves to the next box instead of doing nothing.
- Checks pass.

## 2026-11-10 01:05 — Faster start and smaller updates

- The app's main file shrank from about 3 MB to under 300 kB. Each screen now loads the first time you open it, so first start is quicker.
- Libraries and rules data are kept in their own files. After an app update, your device downloads only the changed screens, not the rules data again.
- Works offline as before: every file is still saved on install. Watch for a brief blank screen area the first time you open a screen.
- Checks pass.

## 2026-11-09 23:25 — DM party overview

- As DM, the Party view is now a table: HP, AC, passives, saves, slots, conditions, languages, death saves, Inspiration and To do. Tap a title to sort.
- Pick the columns you want under Columns; the choice stays on your device. On a phone the table scrolls sideways with names pinned.
- Players still see cards. Nobody can edit from this view.
- Checks pass.

## 2026-11-09 23:14 — Shared campaigns done

- Roles, invites, party sync, view-only characters and the Party view are finished. Signed-out use is unchanged.
- Before trying it live, run supabase/migrations/20261109170000_party.sql in your Supabase project. Test the checks only on a throwaway project.
- Next: DM party overview.
- Checks pass.

## 2026-11-09 23:10 — Party view

- Shared campaigns now have a Party link on their card. It shows one card per player character: HP, AC, passive Perception, spell save DC, slots left, concentration and conditions.
- Tap a card to open that character, view only. Cards update after each player syncs.
- A short Party tips tour runs the first time you open the view.
- Checks pass.

## 2026-11-09 23:08 — View-only party characters

- Another player's character opens with a "View only" bar. Nothing on it changes the character; "Duplicate to play" makes your own copy to play with.
- Party characters have no Delete button on the Campaigns page.
- Next: the party view with a card per character.
- Checks pass.

## 2026-11-09 23:05 — Share and join campaigns

- Campaign settings has a Party section: share the campaign, make a 7-day invite link, see members, hand over DM, remove someone or leave. Shared campaigns show a "Shared" tag.
- Opening an invite link shows the campaign and lets you join. Party characters now sync both ways and arrive read-only.
- Check: it needs the party migration run in Supabase and two accounts to try.
- Next: view-only character screens, then the party view.
- Checks pass.

## 2026-11-09 15:54 — Shared campaign database

- The database for shared campaigns is written: members, invites that last 7 days, and party characters only their owner can change. Nothing in the app uses it yet.
- Before sharing works online, run supabase/migrations/20261109170000_party.sql once (see HOSTING.md).
- Next: Share with party and invite links.
- Checks pass.

## 2026-11-09 15:50 — Roles

- A new campaign now asks if you are the DM or a player. A new character asks who plays it; the DM option shows only in a DM campaign.
- Change the role later in Campaign Setup. Tick "Don't ask again" or use Settings → Tutorial to turn the questions off. Existing campaigns count as Player.
- Next: the shared-campaign database.
- Checks pass.

## 2026-11-09 15:35 — Tutorial finished

- The tutorial is complete: Welcome, Your character, and tips for Combat, Spells and Inventory. Skip and Replay work everywhere.
- Seven short checks are in the manual QA list. Please try the tour on your phone.
- Next: roles and shared campaigns.
- Checks pass.

## 2026-11-09 15:32 — Screen tips

- The first time you open Combat, Spells or Inventory, a short tip points at the main controls. Turn tips off in Settings → Tutorial.
- Rest and level-up are dialogs, not screens, so they have no tip yet.
- Next: the tutorial gate and manual checks.
- Checks pass.

## 2026-11-09 15:27 — Character tour

- The first time you open a character, a five-card tour points at the top numbers, the menus, To do, History with Undo, and Sheet → Edit.
- Replay it from Settings → Tutorial. Skip is remembered on this device.
- Check that each card sits clear of what it highlights on your phone. Next: short tips on Combat, Spells, Rest and Inventory.
- Checks pass.

## 2026-11-09 16:05 — Welcome tour

- On the first visit to the campaign list on a device, a short tour points at Campaigns, New campaign, New character, Find and Settings. Skip it at any time.
- Settings → Tutorial has the screen-tips switch, Replay and Reset tips. Search "tour" or "help" to reach it.
- Check the wording on your phone. Next: the tour for the character screens.
- Checks pass.

## 2026-11-09 15:45 — Tour engine

- The spotlight card for the tutorial is built: it dims the page, highlights one element, and has Back, Next and Skip tutorial.
- No tour text yet, so nothing shows. Next: the Welcome tour and Settings → Tutorial.
- Checks pass.

## 2026-11-09 15:30 — Accounts finished

- Accounts are complete: sign in, automatic sync, merging, password help, display name and delete account.
- Try the new Phase 7 checks in the manual QA list with two devices.
- Next: the tutorial.
- Checks pass.

## 2026-11-09 15:25 — Automatic merge

- If you change one thing on your phone and another on your laptop, the two versions now combine on their own. No question asked.
- If both devices changed the same thing (for example hit points), the app still asks which to keep.
- Checks pass.

## 2026-11-09 15:20 — Sync status chip

- Signed-in accounts show a small chip in the top bar: Synced, Syncing, Offline, Sync problem, or Needs your choice. Tap it to open Account settings.
- Guests see nothing new. Check it at phone width: only the icon shows until a choice is needed.
- Checks pass.

## 2026-11-09 15:15 — Automatic sync

- When signed in, your campaigns and characters now sync on their own: at sign-in, on opening the app, when you return to the tab or get back online, and a few seconds after you change something.
- If the cloud is unreachable it retries quietly. Sync now still works. If the same item changed in both places, it still asks you which to keep.
- Next: a sync status chip in the top bar.
- Checks pass.

## 2026-11-09 15:10 — Delete account

- Settings → Account has Delete account. Type DELETE to confirm; your cloud account and cloud copies are removed.
- Campaigns and characters stay on this device. Before it works online, run supabase/migrations/20261109160000_delete_account.sql once (see HOSTING.md).
- Next: automatic sync.
- Checks pass.

## 2026-11-09 15:02 — Password help

- Settings → Account has Forgot password (emails a reset link) and Change password for signed-in accounts.
- In Supabase, add your site address plus /reset-password under Redirect URLs (see HOSTING.md) or the email link will not open the app.
- Next: delete account.
- Checks pass.

## 2026-11-09 14:56 — Display name for accounts

- Signed-in accounts can set a display name in Settings → Account. Your party will see it later; your email is never shown.
- Before this works online, run the new file supabase/migrations/20261109150000_profiles.sql once in the Supabase SQL Editor (see HOSTING.md).
- Next: password reset.
- Checks pass.

## 2026-11-09 14:51 — DM is view only too

- The DM can view and duplicate players' characters but not change them; only the owner ever changes a character.
- The plan has no open questions left. Nothing is built yet.

## 2026-11-09 14:47 — Plan updated with your answers

- Tutorial shows on the first visit on each device. Party characters are view only; others can only duplicate them. One DM per campaign.
- The first DM milestone is just the party overview; other DM ideas wait in the backlog.
- One new question (Q39): can the DM change players' characters? Until you answer, the DM can only view them, like everyone else.

## 2026-11-09 14:34 — Plan for accounts, party play and tutorial

- New plan in docs/PLAN.md: M22 finishes accounts (automatic sync, password reset, display name), M23 adds a skippable tutorial, M24 adds DM or player roles and shared campaigns, M25 adds DM tools.
- Please review the seven open questions (Q32–Q38) at the end of the plan; each has a default the plan uses until you answer.
- Nothing is built yet; work starts after the testing phase.

## 2026-11-09 14:28 — Find the Edit button

- Searching Find for "edit", "fix", "override" or "correct" now points to Sheet.
- On Sheet, the Edit button lets you correct any computed number (Computed overrides) or change build choices.
- Checks pass.

## 2026-11-09 14:27 — Read a spell before picking it

- When you level up or use Manage spells, hover a spell name (desktop) or tap it (phone) to read its card before you tick it.
- Ticking still uses the checkbox beside the name, so reading a spell never picks it.
- Escape closes just the spell card and leaves the pick list open.
- Checks pass.

## 2026-11-09 14:03 — Pending spell picks on Spells

- If you skip a cantrip or spell pick at level up, a Pending button now waits on the Spells screen: cantrips under Cantrips, other spells under Level 1.
- Tap it to open Manage spells for that class and finish the pick later.
- The buttons hide while you search or filter.
- Checks pass.

## 2026-11-09 13:58 — Softer Parchment theme

- Parchment is less bright: the paper is a calmer tan and text colors are darker, so words are easier to read.
- The Theme choices in Settings now show a sun, moon or screen icon for a quick glance.
- Please try Parchment in a bright room and on your phone.
- Checks pass.

## 2026-11-09 00:46 — M21 done

- From the Dashboard, Find reaches Jump, Print, Shatter, Long rest and a map tool in two steps, by keyboard or touch.
- Please run the new M21 list in MANUAL_QA.md, especially on a phone.
- Checks pass.

## 2026-11-09 00:44 — Related links

- Small "Related" rows now sit on Skills (jump and carry), Movement and body (Athletics, falling table) and the spell cast sheet (focus and gear in Inventory).
- They only suggest. Nothing moves until you tap one.
- Checks pass.

## 2026-11-09 00:39 — Find

- New search icon beside Undo (and in the top bar outside a character). Ctrl+K or / also opens it.
- Type "jump", "pdf", a spell, a rule, "long rest" or "map" and press Enter. It goes there and flashes the section.
- On a phone the top bar now shows icons only, so it fits.
- Checks pass.

## 2026-11-09 00:10 — Tools list finished

- Credits now thanks awesome-dnd, where many tool ideas came from.
- A new command, npm run check:tools, reports tool links that no longer work. Run it by hand now and then.
- Please run the five M20 checks in MANUAL_QA, mainly on your phone. Next: Find and Related links.
- Checks pass.

## 2026-11-09 00:06 — Tools page

- Reference now has a Tools button. It lists outside tools by goal, such as maps, tokens, minis and audio.
- Filter by free only, platform, or hide AI tools, or search. Each card opens the site in a new tab.
- Check it on your phone: find a free map maker with AI hidden.
- Checks pass.

## 2026-11-09 00:03 — Tools list written

- 61 outside tools are now in the list: virtual tabletops, map makers, generators, tokens, minis, AI art and 3D, audio, builders, prep and other game systems.
- Summaries are in our own words. Nothing shows on screen yet; the Tools page comes next.
- Checks pass.

## 2026-11-08 23:59 — Tools directory data format

- The tools list now has a data format and a check that stops duplicate names or links.
- Nothing shows on screen yet; the full list and the page come next.
- Checks pass.

## 2026-11-08 18:05 — Material note on the cast sheet

- Casting a spell now shows a line about its material: "Material covered by your Flute", a warning when no focus or pouch is carried, or the gold cost and whether it is used up.
- It only warns. You can always cast.
- M19 is complete; manual checks are in MANUAL_QA.
- Checks pass.

## 2026-11-08 18:02 — Spell materials and focus in the engine

- The app can tell if a spell needs a costly material, whether it is used up, and whether your focus, instrument, holy symbol or component pouch covers it.
- Nothing shows on the cast screen yet; that is next.
- Checks pass.

## 2026-11-08 17:59 — Travel and falling tables

- Reference > Quick tables now has Travel pace, Forced march and Falling.
- Wording is short and our own. Check that the numbers match your book.
- Checks pass.

## 2026-11-08 17:57 — Movement and body on Explore

- Explore has a new "Movement and body" card: jump distances, lift limit, breath, choking rounds, days without food, climb and swim speed.
- Tap a number to see how it was worked out. An active Jump spell triples the jumps.
- Check it at phone width.
- Checks pass.

## 2026-11-08 17:55 — Body numbers in the engine

- The app can now work out jump distance, how much you can lift, how long you can hold your breath, days without food, and climb and swim speed.
- Remarkable Athlete, the Jump spell and the Athlete feat change the jump numbers. Step of the Wind shows as a reminder only.
- Nothing shows on screen yet; the Explore panel comes next.
- Checks pass.

## 2026-11-08 17:33 — Plan for M19 to M21

- Next three milestones are written as short task lists in PROGRESS: M19 jump, carry, breath, travel and spell focus checks; M20 tools directory; M21 Find search.
- Check the task lists and say if anything is missing or in the wrong order.
- Checks pass.

## 2026-11-08 17:31 — Review fixes for creation and print

- New character: a restored draft now shows "Picked up where you left off" with a Start over button. Old drafts can no longer break the page.
- Print view: tick or untick the Features and Spells pages before printing. The PDF is named after the character, and skills show a * / ** legend.
- Opening the print link for a deleted character now says "Character not found" instead of crashing.
- Checks pass.

## 2026-11-08 10:23 — Print sheet

- The Sheet screen has a Print button. It opens a paper copy of the character: abilities, skills, attacks, inventory, features and spells.
- Press Print / Save as PDF to use your browser's print dialog. The paper stays light even in the dark theme.
- Check the printed PDF against the sheet, on desktop and phone.
- Checks pass.

## 2026-11-08 10:21 — Character creation gate

- A half-built New character form now comes back after a reload, until you create the character or close the tab.
- Manual checks for the whole creation flow are listed in MANUAL_QA.
- Checks pass.

## 2026-11-08 10:17 — To do list

- A To do badge appears in the top bar, and a note on Home, whenever a character has choices left: subclass, ability increase or feat, fighting style, expertise, invocations and so on.
- Open the list to make each choice there. Spell picks link to the Spellbook. Preparing spells is optional and can be hidden.
- Check that the list clears as you choose.
- Checks pass.

## 2026-11-08 10:11 — To do list engine

- The app can now work out what a character still has to decide: subclass, ability score or feat, fighting style, expertise, invocations, and spell picks.
- Nothing shows on screen yet. The To do badge and list come next.
- Checks pass.

## 2026-11-08 10:06 — Level choices at creation

- Starting above level 1 adds a Levels step (a Level choices section on One page) for each level that gives a subclass or an ability score increase or feat.
- Subclass cards show strengths and weaknesses. Anything you skip stays open for the To do list coming next.
- Fighting styles, expertise and per-level spells are not asked here yet; spells still come from Class choices.
- Checks pass.

## 2026-11-08 09:59 — Suggestions while building

- Under Abilities, a "Suggested scores" button fills a sensible spread for your class (not shown when you roll scores). You can change every number afterward.
- Class skills and starting spells that suit your class carry a "Recommended" note with the reason.
- A "Good together" box points out race, class and background pairings that work well.
- Checks pass.

## 2026-11-08 09:57 — Choice cards

- Picking a race, class or background now shows a short guide: what it is, how hard it is to play, its strengths and its weaknesses.
- "Compare" lists every option with a one-line pitch, and you can pick from there. Turn it all off in Settings under Beginner hints.
- Subclass cards come with the level choices later in this milestone.
- Checks pass.

## 2026-11-08 09:55 — Step-by-step new character

- New character can now be built one step at a time: Name, Race, Class, Background, Level, Abilities, Choices, Review. Back and Next move between steps, and each step tells you what is missing.
- Review shows the computed sheet before you press Create. Switch to One page any time; nothing you typed is lost.
- Not yet: race and class cards, suggestions and reload-safe drafts come in the next tasks.
- Checks pass.

## 2026-11-08 09:47 — Creation settings

- Settings now has a "New characters" choice (Step by step or One page) and a "Show beginner hints" switch.
- Both are saved on this device. Nothing uses them yet; the step-by-step screen comes next.
- Checks pass.

## 2026-11-08 09:44 — Beginner guidance written

- Every class, subclass, race and background now has a short guide: pitch, difficulty, strengths, weaknesses, and pairings that work well.
- Nothing shows in the app yet; the creation screens will use it next.
- Checks pass.

## 2026-11-08 09:21 — Plan: easier character creation and printing

- Next milestone (M17): new characters can be made step by step or on one page, your pick, with beginner hints for every class, subclass, race and background.
- Hints show strengths, weaknesses, difficulty and suggested scores, skills and spells; they never choose for you and can be turned off.
- Also in M17: after a level-up, a To do badge lists anything still to decide (new spells, prepared spells, subclass, ASI) and clears itself when done.
- After that (M18): print the sheet or save it as PDF from the browser, offline.
- Shared campaign view, spell import and session recaps are parked for later. Checks pass.

## 2026-11-08 04:40 — Milestone 16 complete

- Dice roller, Parchment theme, backups, first Xanathar and Tasha content, Markdown journal and portraits are all in.
- Please run the new Phase 4 list in MANUAL_QA, mainly the offline reload and Parchment readability.
- All planned milestones are done. Next: your manual QA and picking backlog items. Checks pass.

## 2026-11-08 04:12 — Rules review answers

- Settled: potions take an action, and Ranger companions follow the 2014 book. A level 20 Barbarian keeps 6 Rage uses.
- At 0 HP, only damage left after temporary HP counts toward instant death, and damage that temp HP absorb still adds a death-save failure. The old "ask your DM" note is gone.
- The other open rulings keep their defaults. Next: the final M16 check. Checks pass.

## 2026-11-08 03:59 — Character portraits

- In Edit character you can add a portrait from a picture file. It is cropped square and shrunk on your device; the original is not kept.
- The portrait shows on the sheet, the top bar and the campaign list. Remove it to go back to the icon. Backups include it.
- Next: rules review with you. Checks pass.

## 2026-11-08 03:32 — Formatted journal text

- Journal notes, backstory, quest, NPC and location text now show **bold**, *italic*, lists, headings, quotes and web links.
- Typed HTML never runs; it shows as plain text. Only http and https links open. Saved text is unchanged.
- Next: portrait upload. Checks pass.

## 2026-11-08 03:22 — Search follows campaign books

- Rules search inside a character now hides books the campaign does not use. Core Player's Handbook entries always show.
- Xanathar and Tasha entries show up in search with their book name. Search from the main Reference page still shows everything.
- Next: formatted notes in the Journal. Checks pass.

## 2026-11-08 03:17 — Xanathar and Tasha content

- New subclasses: Cavalier, Gloom Stalker, War Magic (Xanathar) and Twilight Domain, Psi Warrior (Tasha). Eight spells and eleven feats from both books are added too.
- All text is in our own words and marked unreviewed. Check the summaries against your books, especially numbers and limits.
- This is a first slice, not every subclass. Say which ones your table needs. Next: only show each campaign's books in lists. Checks pass.

## 2026-11-08 03:02 — Backups

- Settings has a **Backups** section. **Export all data** saves every campaign and character to one file; **Restore from file** shows what is inside before it replaces anything.
- Automatic recovery points (before an import, reset, long rest or restore) are listed there too. A restore always keeps the previous data as a recovery point.
- A reminder appears in Settings and on Campaigns when there is no backup file, or it is over 14 days old. Check the wording and that restore feels safe.
- Next: Xanathar's and Tasha's packs. Checks pass.

## 2026-11-08 02:57 — Parchment theme

- Settings has a **Theme** choice: System, Dark or Parchment, a warm light paper look. System uses Parchment when your device is set to light.
- The choice is saved on this device only. Check that text and the spell colors read well on Parchment, at phone and desktop width.
- Next: backups screen. Checks pass.

## 2026-11-08 02:52 — Optional dice roller

- Settings has a new **Show dice roller** switch, off by default and stored on this device. When on, a dice button opens a tray with d4 to d100, advantage or disadvantage, your own expression like 2d6+3, and a roll history.
- Roll buttons appear on attacks (Hit, Dmg), saves and skills. Results are only shown; you still enter damage and outcomes yourself.
- Check the buttons are easy to tap at phone width. Next: Parchment theme. Checks pass.

## 2026-11-08 02:35 — Ally/enemy tracker on the Combat screen

- Combat now has a **Start tracker** panel: you and your companions, plus goblins or any creature from the list, or a quick custom one. Enter each d20 and the order sorts itself.
- **Next turn** walks the order. Tap a row for damage, heal, temp HP, conditions, Defeated and the statblock. Reaching 0 HP only shows a warning.
- Check at phone width that the rows are easy to read and tap. Start Turn and End Turn still work when no tracker is open.
- Milestone 15 is complete. Next: milestone 16. Checks pass.

## 2026-11-08 02:20 — Ally/enemy tracker: the rules behind it

- A fight can now hold you, your companions, allies and enemies, with initiative order, rounds and turns. Nothing shows in the app yet.
- Enemies can be added from the creature list or typed in; groups are numbered (Goblin 1, Goblin 2). Hit points are the average or a number you enter.
- Next turn passes six seconds each round and restores your actions on your turn. Reaching 0 HP only warns; you mark who is defeated.
- Next: the Combat screen for it. Checks pass.

## 2026-11-07 20:55 — M14 gate: multiclass and every class to level 5

- Checked a Fighter 2 / Wizard 3 and a Warlock / Sorcerer built level by level, and every class taken from level 1 to 5, each with Undo.
- A multiclass is refused when the ability minimum is not met.
- A guided new character is still there after reloading the page.
- Milestone 14 is complete. Next: milestone 15.

Checks pass.

## 2026-11-07 20:50 — Guided character builder

- New character has a "Guided build" box. Tick it to pick class skills, starting equipment, instruments (Bard) and cantrips and spells, with the counts shown.
- Class armor, weapon and tool proficiencies are added for you. Armor and shield from the kit start equipped. Prepared casters (Cleric, Druid, Paladin, Wizard, Artificer) prepare on the sheet.
- Leave the box off for the old quick, blank create.
- Check that your class's kit options match your book. Checks pass.

## 2026-11-07 20:40 — Companion templates

- The Add companion picker now has Ranger's companion beasts, Steel Defender, Eldritch Cannon and Find Familiar forms, grouped by source.
- Their AC, HP and attacks follow your level, Intelligence and proficiency bonus. A Ranger's companion has the higher of its normal HP or 4 × ranger level.
- Adding a second ranger companion or cannon warns; the Artillerist's second cannon at level 15 stays manual. Checks pass.

## 2026-11-07 20:33 — Artificer

- Artificer is a new class (Tasha's, your own-words summaries): spells from level 1, infusions you pick at level-up, and Alchemist, Armorer, Artillerist and Battle Smith specialists.
- Slots, prepared spells and multiclass rules follow the Tasha table. Tasha's source must be on in the campaign.
- Summaries are unreviewed: check infusion and specialist wording. Checks pass.

## 2026-11-07 20:27 — Tasha options

- With Tasha's optional class features on, classes gain them by level (Deft Explorer, Steady Aim, Ki-Fueled Attack and more). Ranger versions replace Natural Explorer, Favored Enemy and Primeval Awareness.
- Seven Tasha fighting styles can be picked at level-up.
- With custom origin on, the sheet editor can swap your race's ability bonuses for +2/+1 or +1/+1/+1. Undo reverses it.
- Turning a rule off keeps your choices and lists them in the campaign warning. Checks pass.

## 2026-11-07 20:16 — Feats

- With feats on in a campaign, level up can take any of 42 PHB feats instead of an ability score improvement.
- Feats apply their numbers: +1 ability, Resilient save, Skilled skills, armor training, Alert initiative, Mobile speed and Tough HP. The rest show as reminders.
- Feat requirements are shown in the text but not enforced.
- Checks pass.

## 2026-11-07 20:12 — Full caster classes

- Bard, Cleric, Druid, Sorcerer, Warlock and Wizard now work to level 20: slots, Warlock Pact Magic, Sorcery Points, Channel Divinity and Wild Shape.
- New pools you can spend and track: Divine Intervention, Mystic Arcanum and Signature Spell.
- Sorcerer slot conversion and Mystic Arcanum casting are tracked by hand for now; Fighting Style, Metamagic and Invocation picks are not in the level-up wizard yet.
- Checks pass.

## 2026-11-07 20:05 — Martial and half-caster classes

- Barbarian, Fighter, Monk, Paladin, Ranger and Rogue now show their level-based numbers: Rage damage, Sneak Attack dice, Martial Arts die, Unarmored Movement, Lay on Hands pool, Divine Sense uses.
- Barbarian and Monk Unarmored Defense now counts in armor class (Monk loses it with a shield).
- Check a Monk or Barbarian without armor. Rage stays at 6 uses past level 17 (no unlimited). Checks pass.

## 2026-11-07 19:51 — Level-up wizard

- Level up now lets you start a new class, pick a subclass, raise ability scores or take a feat, and choose new spells, all in one step you can undo.
- Anything you skip says "Decide later" and can be set afterward. Check the Spells section on a caster and a multiclass level.
- Class-specific picks (expertise, fighting styles, invocations) come with the class tasks next. Checks pass.

## 2026-11-07 19:15 — Spells on level-up

- A level-up can now add the new cantrips and spells the class table gives, copy spells into a Wizard's spellbook, and swap one known spell for another.
- Picks beyond the class table are refused; prepared spell counts follow the new level on their own.
- No screen yet: the level-up wizard comes next. Checks pass.

## 2026-11-07 18:24 — Level choices in the engine

- A level-up can now carry a subclass, an ability score improvement (+2, or +1/+1, never above 20), a feat when the campaign allows feats, expertise, and picked options such as a Fighting Style.
- Fighter and Rogue get their extra improvement levels; everything undoes in one step.
- No screen yet: the level-up wizard comes later in M14. Checks pass.

## 2026-11-07 03:26 — Multiclass rules in the engine

- Levelling up a class you do not have now adds it at level 1, only when the campaign allows multiclassing.
- It checks the 13+ ability minimums for your current classes and the new one, and grants the smaller multiclass proficiency set (including the skill or instrument pick for Bard, Rogue and Ranger).
- There is no screen for this yet; the level-up wizard comes later in M14. Checks pass.

## 2026-11-07 02:37 — SRD creatures in Reference search

- Reference search now finds all 334 SRD creatures (goblin, mage, adult black dragon…). Open "Show statblock" for AC, HP, abilities, traits, actions and legendary actions.
- Flavor text and pictures are left out. Creatures with several AC options list the extras in the AC note.
- Next: multiclass rules in the engine. Checks pass.

## 2026-11-07 02:24 — Artificer subclasses decided

- M14 will add the Artificer with Battle Smith and Artillerist; Alchemist and Armorer come later with the Tasha pack.
- The fight-tracker question (per character or shared) stays open; you will decide before M15.
- Next: M14 starts with the SRD creatures. Checks pass.

## 2026-11-07 00:08 — Plan for the remaining milestones

- Journal, Companions and Reference rechecked; all work as planned.
- Progress now lists every task left: the full level-up wizard and all SRD classes (M14), the ally/enemy tracker (M15), then the dice roller, Parchment theme, backups and Xanathar's/Tasha's packs (M16).
- Two new questions in Decisions: should the fight tracker be per character or shared, and which Artificer subclasses come first.
- Next: bundling the SRD creatures for companions and the tracker. Checks pass.

## 2026-11-07 00:04 — Edit companions

- Each companion now has an Edit button. You can change its stats, speeds, ability scores, attacks, limited uses, traits and notes.
- Custom companions can have attacks and limited uses from the start, and notes now show on the card.
- Number boxes reject typos like "4x" and say which field is wrong.
- Checks pass.

## 2026-11-06 23:50 — M13 complete

- Reference now has seven short rules tables: actions, cover, exhaustion, death saves, DCs, advantage and rests. Tap a title to open it.
- Check that the wording matches how your table plays these rules.
- Next: M14 (level-up wizard, more classes).
- Checks pass.

## 2026-11-06 23:40 — Rules search

- The Reference page has a search box. Type a name to find conditions, spells, items, features, classes or races.
- Conditions show their full rules text; other results show the kind and source book.
- Next: quick tables and short rules summaries.
- Checks pass.

## 2026-11-06 23:15 — M12 complete

- Journal and Companions both work on phone and desktop, with Undo and reload keeping changes.
- Please try the four M12 items in the manual QA list.
- Next: M13.
- Checks pass.

## 2026-11-06 23:05 — Companions screen

- The Companions page now works: add a pet, mount or summon (or start from Mastiff or Riding horse), with its own HP, conditions and uses.
- In combat, each companion gets Command buttons that spend your Action, Bonus Action or Reaction. Initiative can be entered per companion.
- Check: the card layout on a phone and whether commanding feels right. SRD creature list and Artificer templates are not in yet (Q30).
- Checks pass.

## 2026-11-06 22:40 — Companions engine

- Pets, mounts, familiars, summons and sidekicks can now be saved with a character, each with its own HP, conditions and uses.
- Their numbers can follow the owner (level, proficiency, ability), and timed summons expire on the game clock.
- Commanding one spends your action, bonus action or reaction. Nothing is visible yet: the Companions screen comes next.
- Checks pass.

## 2026-11-06 19:32 — Journal fixes

- The "Relationships & Allies" card title now shows a plain "&" instead of "&amp;".
- New session notes default to today's date in your time zone, not UTC.
- The quest checkbox is easier to tap on a phone. Journal text keeps any Markdown you type but shows it unformatted for now.
- Checks pass.

## 2026-11-06 19:13 — Journal screen

- You can now view and edit your character's personality traits, ideals, bonds, flaws, relationships, backstory, appearance, and freeform notes.
- Track active and completed quests with notes, record NPCs and landmarks in the world, and write dated session logs.
- All additions and updates support exact Undo and persist across reloads.
- Checks pass.

## 2026-11-06 19:08 — Journal engine commands and schema

- The character journal now supports narrative traits, freeform notes, open and completed quests, NPCs, locations, and dated session notes.
- All journal changes are logged through engine commands and can be undone.
- Checks pass.

## 2026-11-06 18:56 — Campaign setup milestone done

- Campaign books and optional rules are finished and verified on phone and desktop: rest variants, variant encumbrance and the potion house rule apply in play.
- Exact Undo restores prior state, and saved campaign rules survive a reload.
- Five hands-on checks for campaign setup and rule variants are in the manual QA list.
- Checks pass.

## 2026-11-06 16:49 — Campaign rules now apply in play

- Gritty and epic rests change how long short and long rests take on the clock.
- With variant encumbrance, carried weight lowers your speed and, when heavily loaded, adds disadvantage reminders for STR, DEX and CON rolls. Encumbrance Off hides load warnings.
- With the potion house rule, drinking a potion yourself in combat costs a bonus action; giving one to someone is still an action. Custom items can be marked as potions.
- Checks pass.

## 2026-11-06 13:12 — Pick books and optional rules per campaign

- Campaign settings now have checkboxes for each book (the Player's Handbook is always on) and for optional rules like feats, multiclassing and potions as a bonus action.
- You can also pick encumbrance (off, standard, variant) and rest length (standard, gritty, epic). These take effect in play in the next update.
- Turning a book on never turns on its rules; turning one off keeps what characters already have and lists it.
- Checks pass.

## 2026-11-06 13:07 — Campaign books and optional rules (behind the scenes)

- Campaigns can now store which books they use and which optional rules are on. Nothing changes on screen yet; the settings toggles come next.
- Removing a book later will never delete a character's spells, items or features from it. The app lists them and asks first.
- Checks pass.

## 2026-11-06 13:03 — Effects and conditions milestone done

- Effects on you and condition reminders are finished and checked on phone and desktop: Undo puts everything back exactly, and a reload keeps your effects.
- Five new hands-on checks are in the manual QA list, mainly comparing condition notes with your Player's Handbook.
- Next: Campaign Setup, where each campaign picks its books and optional rules. Checks pass.

## 2026-11-06 12:59 — What conditions do to your rolls

- Combat, Dashboard and Exploration show **Roll reminders** when you have a condition or exhaustion: advantage, disadvantage or automatic failure on attacks, checks and saves. The app never rolls or changes numbers for you.
- Save tiles on Home are tagged Auto-fail, Advantage or Disadvantage, and each condition shows a short note on what it does. Exhaustion lists every level you have.
- Check: situational lines such as prone (within 5 ft or farther) read clearly. Next: the M10 final check. Checks pass.

## 2026-11-06 12:39 — Add and edit effects on you

- Combat, Dashboard and Exploration now have **Add effect** and **Edit** for effects on you: set how long it lasts, when it ends (your next turn, a rest), conditions, bonuses to AC, saves and more, and damage resistances.
- The Sheet and the damage pad list resistances from active effects as reminders; you still enter damage after resistance yourself.
- Check: the editor feels quick enough at the table on your phone. Next: what each condition does to your rolls. Checks pass.

## 2026-11-06 12:29 — Effects that end on their own

- Behind the scenes, effects on you can now end at the start or end of your next turn, or when you finish a short or long rest. Ending combat clears turn-timed ones.
- Effects can also record resistances or immunities, and can be edited without removing them.
- Next: the editor to use this from Combat, Dashboard and Exploration. Checks pass.

## 2026-11-06 12:21 — Accounts ready; how to go online

- Accounts are finished on the app side. Your current version stays guest-only and works exactly as before.
- New guide, docs/HOSTING.md: create the free account database, add two settings, build and publish. GitHub Pages needs a small path change first unless you use a custom domain.
- Next: effects editor and conditions (M10). Checks pass.

## 2026-11-06 12:20 — Optional sign-in

- Settings gains an Account section with sign-in, Create account, Sync now and a "which version to keep" choice when needed.
- It only appears once the app is set up with an account server; the version you run now looks and works the same.
- Next: hosting steps and the accounts check. Checks pass.

## 2026-11-06 12:01 — Sync between devices (behind the scenes)

- Added the logic that moves campaigns and characters between this device and a future account, including deletions.
- If the same character changed on two devices, the app will ask which version to keep. It never overwrites quietly.
- Not visible yet; the sign-in screen comes next. Checks pass.

## 2026-11-06 11:58 — Account database rules

- Added the cloud database setup for future accounts: each person can only see and change their own campaigns and characters.
- Nothing is online yet; the app still works without an account.
- Next: an optional sign-in screen. Checks pass.

## 2026-11-06 11:53 — Groundwork for accounts

- The app now notes when each campaign and character last changed, and remembers deletions, so a future account can sync them between devices.
- Nothing changes for you: no sign-in, no new screens. Existing saves are upgraded on the next load.
- Next: the account database rules. Checks pass.

## 2026-11-06 11:36 — Class feature uses; M9 done

- Fighters, Barbarians, Monks, Clerics, Druids, Paladins, Rogues, Sorcerers, Warlocks and Wizards now count their limited features (Second Wind, Action Surge, Rage, Ki, Channel Divinity and more) from class level.
- Inventory and feature changes stay in step across Home, Sheet and Features, also offline and after Undo.
- Watch: a level 20 Barbarian shows 6 Rages, not unlimited (Q29). Lay on Hands points and Metamagic stay manual.
- Next: groundwork for optional accounts. Checks pass.

## 2026-11-06 11:26 — Features screen

- The Features page now lists everything your race, class, subclass, background and build give you, grouped by origin.
- Each card shows where it came from, its action cost, uses with − / + pips, a Use button and a favorite star for Home.
- Bonuses the app already applies are marked "Already counted on your sheet." Long rules text folds behind Show full text.
- Next: the M9 check-through. Checks pass.

## 2026-11-06 11:20 — Create your own items

- Inventory has a Create item button: name, type, rarity, weight, cost, a short description, charges and healing for consumables.
- Custom weapons and armor are based on a catalogue item, so they attack and protect like it and keep your proficiency.
- Custom items are saved with the character and travel with export/import. Edit or delete them under Custom items.
- Next: Features screen. Checks pass.

## 2026-11-06 11:03 — Use potions and consumables

- Potions, acid, oil, scrolls and other consumables now have Use controls in Inventory and in the Combat Items tab.
- Healing potions ask for your dice roll and heal you; in combat, drinking or giving one spends your action. Tick "An ally gives it to me" when someone else feeds it to you, which also works at 0 HP.
- Throws and other effects are still resolved at the table. Next: custom items. Checks pass.

## 2026-11-06 10:54 — Track item charges

- SRD magic items (wands, staffs, rings and more) can be added from the catalogue. Charged items show a counter with Use 1 and Set.
- At dawn or a rest, items that refill fully do so on their own; dice regains ask you to enter your roll, and you can Skip.
- Check the Inventory screen with a wand or staff. Next: consumables and potions. Checks pass.

## 2026-11-06 10:38 — Plan optional accounts

- New milestone MA after Inventory and Features: optional sign-in so each friend keeps their own campaigns and characters, with cloud sync.
- Guest mode, offline use and file export/import stay. Going online waits until you choose hosting; Supabase is the default plan.
- Work resumes on item charges. Checks pass.

## 2026-11-06 10:27 — Record and review attunement bonds

- Inventory shows recorded bonds and lets you mark or end them with shared Undo. New bonds respect the three-item limit and duplicate-copy restriction.
- Depleted and legacy records stay visible for review; missing requirements prompt a DM ruling. Rest timing and magical benefits remain manual.
- Check warnings, empty-item records and Undo on your devices. Work pauses for your review; charges are next. Checks pass.

## 2026-11-06 03:17 — Currency adjustments and carried weight

- Add or spend actual coins with a preview, saved history and Undo. Other denominations stay separate.
- Inventory computes value, coin weight and carried weight, including purchase bundles, and identifies missing weights beside shared carrying capacity.
- Check coin previews and load warnings against your table's rules. Attunement and charges are next. Checks pass.

## 2026-11-06 03:00 — Reject incomplete item files safely

- Character files must include recorded resources for every owned item. Invalid imports and failed loads leave saved data intact.
- Valid legacy item records still support editing, reload and Undo. Check error wording when importing edited files. Currency and carried weight are next. Checks pass.

## 2026-11-06 02:53 — Add and organize catalogue items

- Search the catalogue and record separate item copies with quantities, notes and containers. Purchase bundles suggest an initial count.
- Edit or remove a record with shared Undo; removing a container moves direct contents to Carried and keeps nested contents linked.
- Check Cancel, source warnings and container choices on your devices. Import validation, currency and carried weight are next. Checks pass.

## 2026-11-05 22:16 — Live item quantities and equipment

- Inventory shows each owned item, its notes and container. Adjust quantities and equipped gear without losing empty item records.
- Armor and weapons update shared AC, speed and attacks; armor proficiency and casting warnings keep DM exceptions explicit.
- Check duplicate items, outfit changes and Undo on phone and desktop. Adding catalogue items and editing notes are next. Checks pass.

## 2026-11-05 17:16 — Inventory and Features plan

- M9 starts with owned item quantities, equipment and container groups, keeping AC and attacks shared across screens.
- Currency, charges, consumables, portable custom items and Features follow as separate tasks. Review this order in PROGRESS. Checks pass.

## 2026-11-05 17:08 — Phase 1 complete

- Phase 1 now covers combat, spells, rests, character editing, Exploration, automatic backups and confirmed Reset across phone and desktop.
- Offline navigation, saved changes and Undo pass review; updates preserve open drafts.
- Check installation, keyboard flow, motion, Reset scope and full-session pace using MANUAL_QA. Inventory and Features are next. Checks pass.

## 2026-11-05 16:56 — Review and reset current resources

- Settings previews HP/resource recovery and removal of combat, conditions and effects before you confirm Reset.
- Build choices, belongings, money, time and history stay. A local backup and shared Undo preserve the previous character.
- Check Reset's scope on your own character, including Inspiration and item charges staying recorded. Phase 1 review is next. Checks pass.

## 2026-11-05 16:45 — Automatic local recovery points

- Imports and completed Long Rests now keep automatic workspace backups, covering every campaign and character. The latest 10 stay on this device.
- Failed saves preserve the original recovery point for Retry. Reset's backup support is ready; its Settings control is next.
- Check the import preview wording. Backup browsing and restore controls come in Phase 4. Checks pass.

## 2026-11-05 16:30 — Control review and clear saving states

- Settings visibly pauses preference controls during a save instead of silently ignoring changes.
- Reviewed Phase 1 controls and verified every standard combat action, including logged Undo and manual outcomes.
- Check the saving message and return focus on your device. Automatic backups are next. Checks pass.

## 2026-11-05 10:51 — Keyboard controls and readable states

- HP keypad buttons respect Enter and Space without applying changes early.
- Inputs keep clear focus rings; Escape closes desktop details after nested dialogs and previews finish.
- Damage text and used controls stay readable, with visible state labels.
- Check keyboard flow, focus and colors on your devices. Dead-button review is next. Checks pass.

## 2026-11-05 10:33 — Installable app and offline play

- Install OmniDnD from your browser and reopen character pages offline after an online visit. Local changes, reload and Undo keep working.
- Updates wait until all app windows close, preserving an open session and unsaved drafts.
- Check the installed icon, fonts, navigation and offline feel on your devices. Keyboard and contrast are next. Checks pass.

## 2026-11-05 10:18 — Full Phase 1 acceptance check

- Verified The Fool's full session from fresh resources through combat, reactions, rests and manual corrections.
- Shared values, required reloads and exact Undo stay consistent across Home, Spells, Combat, Explore and Sheet.
- Review the M7 manual checklist on your own character. Installation and offline use are next. Checks pass.

## 2026-11-05 10:07 — Exploration and M7 complete

- Explore brings utility spells, rituals, skills, passives and active effects together for the current character.
- The Dashboard clock and shared casting controls keep time, slots, preparation and effects consistent across screens.
- Check phone spacing, ritual availability and skill breakdowns on your own character. M8 hardening is next. Checks pass.

## 2026-11-05 03:53 — Minimal level-up and advancement previews

- Advance a recorded class using a roll or its average; review HP, Hit Dice, spell limits and changed resources before applying.
- Milestone campaigns hide XP. XP campaigns show readiness against the next recorded level, including a noted threshold override.
- Check the preview, campaign-method warning and Undo on your own character. Existing spending and game time stay recorded. Exploration is next. Checks pass.

## 2026-11-04 23:22 — Ability entry by campaign method

- Edit rolled bases, assign the standard array or check a point-buy purchase against 27 points. The budget stays visible while editing.
- Preview scores and modifiers with bonus sources listed separately. Saved edits keep current resources, locked HP entries and noted overrides.
- Check Save/Cancel and your campaign's method, including retained older scores. Minimal level-up is next. Checks pass.

## 2026-11-04 22:58 — Sheet Edit mode and noted overrides

- Edit identity, race, subclass, proficiencies and languages; save choices together or cancel the draft.
- Select a computed value, add a note and inspect its ✎ breakdown. Overrides carry through other screens and character export.
- Correct remaining resources without freezing future spending. Check retained grants, Reset and Undo. Ability entry is next. Checks pass.

## 2026-11-04 22:09 — Compact character header and one Undo

- Every character screen, including Spells, shares a compact status row with the latest change. Tap it for full history.
- One Undo follows character and workspace changes, including inside spell management and long history.
- Check phone spacing and whether the latest-change wording makes Undo clear. Sheet Edit mode is next. Checks pass.

## 2026-11-04 16:58 — Shorter docs and companion roadmap

- Project notes and QA lists are shorter, with a clear style for future updates.
- D80 and Q21 stay unchanged. Review D80 as Q22 at project end.
- M12 now plans creature companions, owner-derived stats and companion actions; Artificer support depends on M14. Checks pass.

## 2026-11-04 11:22 — Live Character Sheet and computed breakdowns

- Sheet shows saved abilities, saves, skills, proficiencies, defenses, attacks and casting values.
- Inspect number breakdowns and try ordinary Inspiration. Check other characters as well as The Fool.
- M7 continues with Edit mode and overrides. Checks pass.

## 2026-11-04 10:55 — Manual game clock and M6 complete

- Advance game time from Dashboard using presets or a custom duration. Due effects expire and changes support Undo.
- Check rest previews, the repeat-rest warning, Hit Dice recovery and manual slot corrections.
- M6 is complete; Character Sheet is next. Checks pass.

## 2026-11-04 03:39 — Live Dashboard and favorite actions

- Dashboard shows current resources, effects, conditions, ability summaries and recent history.
- Choose favorite spells, features and items. Check their descriptions, available actions and resource corrections.
- Standalone time controls are next. Checks pass.

## 2026-11-03 22:38 — Rest game-clock verification

- Short Rest adds one game hour and Long Rest adds eight, including midnight crossings and effect expiry.
- Check Cancel, refresh and Undo with timed effects. Checks pass.

## 2026-11-03 22:36 — Long Rest with recovery preview

- Long Rest previews recovery, Hit Dice, exhaustion, temporary HP and elapsed time before applying.
- Check the repeat-rest warning and recovery limits. Prepared casters can review spells after resting.
- Try refresh and Undo after a rest. Checks pass.

## 2026-11-03 22:20 — Short Rest with rolls and preview

- Add Hit Dice one at a time; CON and projected healing are computed. Song of Rest is offered when eligible.
- Review recovery and effect expiry before applying. Check Cancel, different die pools and Undo.
- Checks pass.

## 2026-11-03 22:04 — Combat milestone complete

- End Combat settles the final six seconds and returns surviving effects to game-time timers.
- Check resources stay intact, due effects end and Undo restores the previous fight.
- M5 is complete; rests are next. Checks pass.

## 2026-11-03 21:03 — Live effects and saved Combat history

- Effects show remaining rounds or game time, with End controls. Full history includes saved commands and Undo.
- Check timer readability, concentration links and ending individual effects. Checks pass.

## 2026-11-03 20:48 — Bonus-action spell flow verified

- Combat applies the 2014 bonus-action-spell restriction in either casting order. Show all keeps exceptions reachable.
- Check warning Cancel, overrides and one-action cantrips. Ordinary bonus-action features remain separate.
- Checks pass.

## 2026-11-03 20:32 — Reactions verified and boundary fixes

- Off-turn reaction spells, Cutting Words, opportunity attacks and Readied responses share one reaction pool.
- Try a second reaction, Cancel or override it, then start your next turn. Check depleted feature uses.
- Checks pass.

## 2026-11-03 15:55 — Live HP, concentration checks, and death saves

- HUD and Combat share damage, healing, temporary HP, concentration checks and death-save controls.
- Check separate damage instances, natural 1/20 outcomes and Undo. Open rulings remain for project-end review.
- Checks pass.

## 2026-11-03 10:49 — Live Combat actions, spells, and weapons

- Combat shows equipped weapons, selected spells, standard actions and owned features with current numbers.
- Check action costs, Dash, shared uses and self versus ally Invisibility. Targets and DM outcomes stay manual.
- Checks pass.

## 2026-11-03 10:19 — Live turn controls and movement

- Start and end turns, toggle economy and adjust movement. Later turns advance six seconds and restore turn resources.
- Check off-turn warnings, movement limits and Undo. Checks pass.

## 2026-11-03 03:02 — Combat starts from saved character state

- Start Combat opens a saved fight with the character’s current resources and computed initiative.
- Check starting, refreshing and Undo. Turn controls and actions are next. Checks pass.

## 2026-11-03 02:59 — Manage spells live; M4 complete

- Manage known and prepared spells by class, replace selections and change spell type tags.
- Check class limits, retained conflicts and Undo without changing play resources.
- M4 is complete; Combat is next. Checks pass.

## 2026-11-03 02:39 — Spell filters and saved favorites

- Search and combine spell filters, including school, casting time and favorites. Stars save across screens.
- Check combined filters, Clear and favorites after refresh or Undo. Checks pass.

## 2026-11-03 02:22 — Casting, healing, and rituals are live

- Cast from rows or previews, choose higher slots and enter rolled healing. Eligible rituals spend time instead of slots.
- Check self versus other targets, concentration changes, warning Cancel and Undo.
- Checks pass.

## 2026-11-02 21:42 — Live spell previews and accessible slot choices

- Spell previews show the selected class’s casting values and usable slot choices, including higher levels.
- Check phone previews, pinned details and characters with many slot levels. Checks pass.

## 2026-11-02 21:23 — Saved Spellbook groups and slot controls

- Spellbook shows selected spells, current casting values and saved slot pools. Slot adjustments agree with the HUD.
- Check empty spellbooks, slot corrections and Undo. Checks pass.

## 2026-11-02 15:55 — Settings live; M3 complete

- Save automation and reduced-motion preferences. Import and export characters from Settings.
- Check Assisted versus Manual warnings and motion comfort. Character reset remains scheduled for M8.
- M3 is complete; live Spellbook is next. Checks pass.

## 2026-11-02 15:44 — Reference, bookmarks, and Credits

- Reference offers edition-labeled links, shared personal bookmarks and source credits.
- Check bookmark editing, destination labels and the Credits page. Checks pass.

## 2026-11-02 15:32 — Campaign rules save and guide new characters

- Campaigns save leveling, HP and ability methods. New characters follow those choices.
- Check method descriptions and older entries: changing a method preserves existing choices and HP rolls.
- Checks pass.

## 2026-11-02 15:02 — Live Campaigns hub and character management

- Create characters in multiple campaigns, copy or delete them, and import or export character files.
- Check import previews, conflicting copies and management Undo. New characters keep optional choices unselected.
- Checks pass.

## 2026-11-02 14:26 — Local saving and undo survive refresh

- Character changes and Undo survive refresh. Save status explains retries, damaged records and conflicting windows.
- Check the messages are understandable and refresh returns the expected character. Checks pass.

## 2026-11-02 03:33 — Live HUD and command store

- HUD shows saved HP, slots and class resources, with adjustments, conditions, exhaustion and number breakdowns.
- Try temporary-HP replacement, Cancel and Undo. Saving across refresh is next.
- Checks pass.

## 2026-11-02 03:20 — All screens have routes

- Navigation reaches Companions, Credits and every planned screen. Future screens show their phase or milestone.
- Check navigation labels and placeholder messages. Checks pass.

## 2026-11-02 03:18 — Responsive shell and shared Details

- Desktop navigation collapses; selected details remain available across screens. Tablets use a drawer and phones use sheets.
- Check available space and readability with Details open at phone, tablet and desktop widths.
- Checks pass.

## 2026-11-02 02:59 — Changelog and git history

- Each finished task now has a dated entry describing what changed.
- Check this page for progress and manual follow-up. Checks pass.

## 2026-11-02 02:33 — M2 done: rules engine passes the full test scenario

- The rules engine covers the acceptance scenario: spells, combat, effects, rests, corrections and Undo.
- M2 is complete; live screens are next. Review the 2014 rulings against TEST_CHARACTER. Checks pass.

## 2026-11-02 02:30 — M2: The Fool's sheet values checked

- The Fool’s computed sheet values, Song of Rest and level-up results match the expected character.
- Compare the expected values in TEST_CHARACTER; live Sheet display comes later. Checks pass.

## 2026-11-02 — M2: every game action as an engine command

- Spells, damage, healing, turns, game time, rests and minimal level-up use logged, undoable commands.
- Check warnings and explicit overrides against the table’s rulings. Checks pass.

## 2026-11-02 — M2: command runner with undo

- Commands check requirements, explain blocks or warnings, and keep a reversible history.
- Check the warning choices and Undo behavior when live controls arrive. Checks pass.

## 2026-11-02 — M2: character sheet calculations

- Character numbers are computed from choices, including skills, HP, attacks, casting and resources.
- Each number retains its calculation parts for later explanations. Checks pass.

## 2026-11-02 — M2: The Fool's content

- The Fool’s non-SRD background, features, spells and marked cards have original summaries.
- Review the short spell and feature descriptions for rules accuracy. Checks pass.

## 2026-11-02 — M2: SRD import

- The bundled 2014 SRD supplies spells, features, classes, races, items and conditions.
- Check source labels when reviewing reference entries. Checks pass.

## 2026-11-02 — M2: data shapes and seed character

- Characters and campaigns have validated saved records, with The Fool and campaign #273 as the seed.
- Game time is independent of real time. Checks pass.

## 2026-11-02 — M1 signed off

- You approved the Dashboard, Spellbook and Combat key frames.
- The rules engine is next. Checks pass.

## 2026-11-01 — M1: low HP rolls setting

- Campaigns can allow negative HP gains or require at least one HP per level.
- Check which low-roll rule your table uses. Checks pass.

## 2026-11-01 — M1: review round 1

- Campaign frames, grouped resources, separate concentration, spell types and Combat without turn order are visible.
- Check the revised layout and labels. Checks pass.

## 2026-11-01 — M1: key frames

- Sample Dashboard, Spellbook and Combat screens are available on phone and desktop.
- Review their look and readability; live behavior comes later. Checks pass.

## 2026-11-01 — M0: project setup

- The app skeleton has its dark theme, typography and responsive foundation.
- Check readability on phone and desktop. Checks pass.

## 2026-11-01 — Planning

- Project docs describe the 2014 rules, public content policy and campaign choices.
- Review the plan and The Fool’s acceptance values. Checks pass.
