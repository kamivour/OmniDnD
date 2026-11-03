# OmniDnD — Manual QA

Check these items in a normal browser after each completed milestone. Unchecked items need a human check; automated results are recorded in CHANGELOG.md.

## Phase 1 — M3: shell layouts

- [ ] At 375 px, open Home, Combat, Spells, and Inventory from the bottom navigation. Open More, choose Sheet, then return to All campaigns.
- [ ] Open Companions from the sidebar or More. Inventory, Features, Companions, and Journal should each say "Coming in Phase 2". Credits should open from its route without a Not found page.
- [ ] At desktop width, collapse and expand the sidebar. Click a spell or resource to open Details. Close and reopen Details, then switch screens and confirm the selected detail remains available.
- [ ] At 640–1023 px, open a spell on both touch and mouse input. Details should open as a drawer on the right. Check the slot picker and Cast button, then close with Escape, the close button, or the backdrop.
- [ ] Use Tab and Enter to open a detail. Close it and confirm focus returns to the opener. After changing screens, closing an old detail should focus the Details button.
- [ ] Resize through 375, 768, 1024, and 1440 px with Details open. Confirm readable content, no horizontal scrolling, and reachable navigation.
- [ ] Load and refresh the app in a normal browser. Confirm the dark theme, fonts, and icons load consistently. This machine intermittently denies Chromium test sockets, so the optional HTTP-forwarding test run does not prove native browser networking.

## Phase 1 — M3: live HUD

- [ ] On first use in a new browser profile, check the HUD shows HP 11/19, L1 slots 0/4, L2 slots 2/2, and Bardic Inspiration 3/5. AC is 13, initiative +3, and speed 30 ft.
- [ ] Open HP, apply 5 damage, then use the toast's Undo. HP should return to 11, with an Undo confirmation.
- [ ] Restore a level 1 slot from the HUD, switch between Home, Spells, and Combat, and confirm the HUD keeps the new count. Adjust Bardic Inspiration and undo it too.
- [ ] Give yourself 10 temp HP, then try replacing it with 5. Cancel should keep 10 and return to Apply in the open editor with 5 still entered. Do anyway should set 5, close the editor, and restore the HP button. Undo should restore 10.
- [ ] Open AC, initiative, and speed. Check their calculation breakdowns. Overrides are scheduled for Character Sheet edit mode in M7.
- [ ] Add Poisoned from the HUD status control, close it, and undo the change. Check conditions stay separate from concentration and effects on you.

## Phase 1 — M3: local saving

- [ ] Change HP and slots from the HUD. Wait for "Saved locally", refresh, then close and reopen the app in the same browser. Confirm the HUD keeps those values.
- [ ] After a refresh, use "Undo last command" in the toolbar. Refresh again and confirm the undo remains saved.
- [ ] Check the save indicator and Undo button remain readable and reachable at 375 px, including when Details is open.
- [ ] In a throwaway browser profile, open two windows before changing anything. Save a change in the first window, then edit the stale second window. The second should show "Save conflict"; it must not overwrite the first window's saved change. Reloading the stale window warns about its unsaved change.

## Phase 1 — M3: campaigns and character management

- [ ] Open a character, adjust its HP from the HUD, return to All campaigns, and confirm the card shows the same HP after a refresh.
- [ ] Make a named copy. Change the copy's HP and confirm the original stays unchanged. The copy should keep choices and current resources while starting its own game-action history.
- [ ] Delete the copy: first Cancel, then confirm deletion. Refresh, use Undo management, and confirm the character and its saved history return. Cancel and close buttons should restore keyboard focus.
- [ ] Export a character, then import that JSON. Review the preview before adding it. An existing character ID should create a separate copy; existing characters must remain intact. Conflicting campaign rules should create a separate imported campaign.
- [ ] Create a blank Half-Elf Bard with Charlatan background in #273. For level 1, use bases STR 11, DEX 14, CON 12, INT 12, WIS 12, CHA 18; choose DEX and CON for the two racial bonuses. The form should compute CON 13, CHA 20, and max HP 9. Create it and confirm the HUD shows 9/9 after refresh. Optional build choices remain unselected.
- [ ] Check import/copy/delete controls and creation fields at 375 px and desktop width. Invalid creation choices should show useful errors, which clear when you correct the inputs.

## Phase 1 — M3: campaign settings

- [ ] Create a campaign. Confirm defaults are XP, average HP, allow negative level HP, standard array, and PHB. Refresh and confirm the campaign remains.
- [ ] Open #273 settings. Change HP to Average and abilities to Point buy. Confirm retained-entry notes appear for The Fool. Save, refresh, and confirm The Fool's HP, ability scores, and resources stay unchanged. Undo management should restore the settings after another refresh.
- [ ] Create a level 2 character in a standard-array campaign. Repeated scores should fail validation. Assign 15, 14, 13, 12, 10, and 8 once each; confirm HP is computed without asking for a roll.
- [ ] Change a campaign to point buy and average HP. Confirm new characters use numeric bases from 8 to 15 with a 27-point budget. Change to rolled methods and confirm roll fields appear. Saved existing characters must retain their choices.
- [ ] For a character with low HP rolls and negative CON, change the campaign's low-roll floor. Its existing max HP must stay unchanged; new characters and later levels use the new floor. Confirm Undo management restores the earlier settings.
- [ ] Check Save, Cancel, sources, and retained-entry notes at 375 px and desktop width. Sources stay read-only until M11.

## Phase 1 — M3: Reference and Credits

- [ ] Open Reference from the hub and from a character. Check the eight link cards. Open the Basic Rules, SRD PDF, and 5e.tools cards; confirm each goes to its 2014 destination in a new tab.
- [ ] Add a named HTTP or HTTPS bookmark. Refresh and open Reference from another character; the same bookmark should appear. Edit its title and URL, remove it, then use the toast's Undo.
- [ ] Remove a bookmark, refresh, and use Undo management. Confirm the bookmark returns. The character's HP and game-action Undo should remain unchanged.
- [ ] Enter a `javascript:` or `file:` URL. Save should show a useful error and keep existing bookmarks unchanged. Correct the URL and save. Cancel, Escape, and the close button should return focus to the editor's opener; removing a bookmark should focus Add bookmark.
- [ ] Open Credits from both the hub and a character. Check the SRD attribution, icon authors/source links, and local Lucide/Inter/Cinzel license notices. Back to Reference should preserve the current character context.
- [ ] At 375 px and desktop width, check long bookmark titles and URLs wrap without horizontal scrolling. Use Tab/Enter to open and save the bookmark editor.

## Phase 1 — M3: Settings and final milestone check

- [ ] Open Settings from the hub and from a character. Change Assisted to Manual, wait for Saved locally, refresh, and confirm Manual stays selected. Undo management should restore Assisted after another refresh.
- [ ] Give a character 10 temp HP, then replace it with 5. Assisted should ask first; Cancel should retain 10. Manual should replace it without a rule warning. Game-action Undo should restore the earlier temp HP independently of preference Undo.
- [ ] Turn Always reduce motion on. Open and close a preview or dialog; motion should stop. Refresh and confirm the preference remains. Turn the switch off and enable reduced motion in the OS; the app should still reduce motion.
- [ ] Use Tab, arrow keys, and Space to change preference controls. Focus should stay on the control after saving. Check Settings at 375 px and desktop width.
- [ ] From hub Settings, select a character and export JSON. From character Settings, export the active character. Import the file, inspect the preview, close it without saving, then import and add it. Existing IDs should create a copy. Refresh and undo the import with Undo management.
- [ ] Import malformed JSON and confirm an error appears without changing saved characters. Exported files contain one character and its campaign/history; device preferences and bookmarks stay local.
- [ ] Recheck navigation, HUD adjustments, campaign/character management, Reference, and Settings in one normal browser session. Refresh between changes and confirm saved values agree across screens. Dashboard, Spellbook, and Combat bodies still use approved static frames until M4–M6.

M3 is complete. The hub, blank character creation, campaign settings, Reference, Settings, HUD, and local saving are live. Automated checks cover failed-write rollback, Retry, and rejecting damaged records without erasing them. Installability and offline operation remain M8 work.

## Phase 1 — M4: spell groups and slots

- [ ] Open The Fool's Spellbook. Confirm DC 15, attack +7, cantrips 2/2, known spells 6/6, and saved slots matching the HUD. A fresh seed has level 1 slots 0/4 and level 2 slots 2/2.
- [ ] Use − and + on both slot rows. Confirm the HUD changes immediately. Refresh, then Undo last command; both the row and HUD should restore the previous value after another refresh.
- [ ] Tap a pip to set the remaining count. Tapping a filled pip clears that pip and later pips; tapping an empty pip fills through it. Use Tab and Space on a pip too, then undo the adjustment.
- [ ] Open a newly created blank Bard. Confirm no spells from The Fool appear, limits match that character, and the level 1 slot row is available even with no selected spells.
- [ ] At 375 px and desktop width, confirm slot controls fit without horizontal scrolling and every control remains reachable. Concentration's Active badge should match saved state and disappear when concentration ends from the HUD.

Spell groups and standard slot adjustments are live. Casting, favorites, and Manage are the next M4 tasks. Pact Magic Spellbook support remains Phase 3; pact slot adjustments already exist in the HUD.

## Phase 1 — M4: spell previews

- [ ] At desktop width, hover a spell to read its registry summary, then use keyboard focus and Enter to pin its details. At 375 px, tap the name and close with the close button or Escape; focus should return to that spell.
- [ ] Pin a level 1 spell while level 1 slots are empty. It should select level 2 if available. Restore a level 1 slot from the HUD, choose level 2 manually, then spend the final level 2 slot. Selection should fall back to the available level 1 slot. Deplete that too; the leveled Cast control should become disabled. Cantrip Cast controls remain available without slots.
- [ ] Keep a pinned detail selected, navigate to another screen, then reopen Details. Slot availability and casting stats should still reflect the current character, including changes made from the HUD.
- [ ] If your character knows an attack spell, check the row and preview show the engine's spell attack bonus. Saving throw spells should show the character's save DC. The full-reference link should open in a new tab.
- [ ] Check the same pinned detail at tablet width and after resizing to 375 px. Confirm no clipped controls or horizontal scrolling, and verify selected-slot counts against the HUD.
- [ ] For a high-level character, confirm all available slot levels wrap into reachable options rather than shrinking into tiny targets.

Preview controls now track live availability. Applying casts through the engine is the next M4 task.

## Phase 1 — M4: casting

- [ ] With The Fool's fresh seed slots, press a row's Cast button. The flow should choose level 2 because level 1 is depleted, show upcast information and derived dice, and spend exactly one level 2 slot after confirmation. Refresh and undo; slots should restore in both HUD and Spellbook.
- [ ] Cast a cantrip. It should use no slot. Cast from a phone preview and from pinned desktop details as well as the row action.
- [ ] Cast Healing Word with Apply to me off: HP should stay unchanged. Then turn it on, enter a rolled dice total within the displayed range, and check the computed healing preview before confirming. Invalid totals should keep the flow open without spending a slot. Undo should restore both HP and the slot.
- [ ] In pinned details, cast self healing once and confirm the rolled total clears before the next cast. Spell dice and modifier should reflect the chosen slot and casting class.
- [ ] Cast Invisibility with Apply to me off, then with it on. Concentration should track the spell in either case; the personal effect should appear only when applied to you. Replacing concentration and Undo should update effects and resource counts together.
- [ ] For a known eligible ritual such as Comprehend Languages, deplete normal slots and choose Cast as ritual. Confirm no slot is spent and the game clock advances by the normal casting time plus ten minutes. The ritual option should be absent for an ineligible class or during combat.
- [ ] Trigger a rule warning, such as an already-used action. Cancel should keep choices, counts, and focus on the open flow's confirmation button. Do anyway should cast once, close the flow, and restore the original row/preview opener. If a pinned confirmation becomes disabled after the last slot, focus should move to a usable workspace control.
- [ ] Check phone and desktop flows for readable upcast text, reachable choices, visible errors, and no horizontal scrolling. Hits, saves, and other creatures' results remain decisions at the table.

## Phase 1 — M4: filters and favorites

- [ ] Combine name search, level, school, casting time, concentration/ritual, and type filters. Search should ignore surrounding spaces and letter case; multiple type selections match either tag. Clear should reset every filter without changing spells, resources, or the log.
- [ ] Star a spell by click and by keyboard Space. Refresh, then Undo last command; the star should restore its previous state without changing HP or slots.
- [ ] Enable Favorites, remove the last visible favorite, and confirm focus returns to the Favorites filter so you can turn it off. Check 44 px star targets and readable rows at 375 px and desktop width.
- [ ] If the character knows spells with longer casting times, check the minute/hour filter options. An empty tag override should display and filter as Utility.
- [ ] With standard slots depleted, Castable now should retain cantrips and eligible known/prepared rituals outside combat. Other leveled spells should hide until slots are restored.

## Phase 1 — M4: Manage spells and final milestone check

- [ ] Open Manage for The Fool. Confirm 2/2 cantrips and 6/6 known spells. Search available spells by name, school, or source; the selected list must stay visible while searching.
- [ ] Try adding a seventh known spell. Cancel should retain all choices and resources; Do anyway should add one spell and log an override. Refresh, then use Undo last command. Confirm the previous selection returns without changing HP, slots, concentration, or other favorites.
- [ ] Replace a known spell. Pick the replacement explicitly; the count should remain 6/6 and one Undo should restore the old spell. Cancel replacement should make no saved change. Removing and replacing cantrips should use their separate count.
- [ ] On a prepared caster, check learned cantrips and prepared spells have separate counts. For a Wizard, add a spell to the book before preparing it. Removing a prepared spell from the book should warn and retain the separate prepared choice until you change it.
- [ ] If testing imported choices, confirm off-list, disabled-source, and over-level spells remain visible and removable. An unsupported class association should offer cleanup without inventing new spell choices or limits. Manage must not silently trim existing selections.
- [ ] Edit a spell's tags, choose several types, then change Main type. Check the row label, tint, and type filters after closing Manage. Clear every tag: the spell should display as Utility. Reset tags should restore the registry defaults. Refresh and Undo each kind of change.
- [ ] Use keyboard controls through Manage, a rule warning, replacement, and the nested tag editor. Cancel should preserve the current flow. Closing tags should return to its Edit tags button; Done should return to Manage. Confirm the footer stays reachable at 375 px and desktop width without horizontal scrolling.
- [ ] In one normal browser session, adjust slots, cast from a row and preview, replace concentration, star/filter spells, and change selections/tags. Refresh between changes and verify HUD and Spellbook agree. Undo should restore each saved command exactly.

M4 implementation is complete; the checklist above is the manual follow-up. Standard-slot Spellbook casting and management are live; Pact Magic Spellbook controls remain Phase 3. Native browser networking and offline operation need separate checks because automated browser runs on this Windows host use the real-HTTP forwarder. Offline/PWA work remains M8.

## Phase 1 — M5: combat start

- [ ] Open Combat with no saved fight. Check No active combat and the computed initiative reference (+3 for The Fool). There should be no turn-order list or initiative-roll input.
- [ ] Start combat. Check Round 1 and Before your first turn. HP, slots, resources, concentration, and the game clock should stay unchanged. Starting combat does not start your turn.
- [ ] Navigate to Spells and back, then refresh. The same round/status should remain. Undo last command should remove the started fight and retain all previous character values after another refresh.
- [ ] Start combat by keyboard at desktop and 375 px widths. Focus should move to the updated combat status; no controls should overflow the viewport.

Combat startup and turn economy are live. The action preview remains separate while the remaining M5 controls are wired to saved state.

## Phase 1 — M5: turns and economy

- [ ] Start combat, then Start Turn. Check Round 1, Your turn, all three economy controls available, and full computed movement. The first turn must not advance the clock.
- [ ] Tap Action, Bonus, and React to spend each; tap again to restore it. Confirm HP, spell slots, and feature uses stay unchanged. Use −5 to spend movement and +5 to give it back; refresh and verify the saved values.
- [ ] Spend the reaction and some movement, then End Turn. They should stay spent while waiting. Start Turn again: check Round 2, six seconds added to the game clock, and all economy/movement restored. Undo should restore the exact previous waiting state and clock after refresh.
- [ ] While waiting, spend React. It should work without an off-turn warning. Try Action or movement: Cancel should preserve values and return focus to the same control, including a native phone tap. Do anyway should apply one logged override.
- [ ] Spend all movement, then try another −5. Cancel should retain zero remaining; Do anyway should keep the displayed remainder at zero rather than negative. Undo should restore the previous used amount. A condition that reduces speed should immediately change the displayed maximum.
- [ ] At 375 px and desktop width, use keyboard Enter/Space through Start Turn, End Turn, and economy toggles. Focus should remain on the changing turn button; warnings should preserve usable focus. Check there is no horizontal scrolling.

## Phase 1 — M5: action tabs, spells, and weapons

- [ ] Before starting combat, preview a weapon and a standard action. Their actual action buttons should be disabled with Start combat guidance. Previewing must not spend anything.
- [ ] With The Fool, start combat and your turn. Rapier should show +4 and 1d8+2 piercing; Dagger should show +4 and 1d4+2 piercing. Attack once: one action and one log entry, with HP, slots, and feature uses unchanged. A second attack should warn; Cancel preserves everything and Do anyway records an override. Refresh and Undo both actions.
- [ ] Preview Dash, then choose Take Dash. Movement should increase from 30 to 60 for this turn. End Turn removes the extra allowance; Undo End Turn should restore it exactly. The next turn starts with normal movement. Neither Dash nor its preview changes the HUD's speed.
- [ ] On Spells, spend Action and check action spells disappear from the default view while eligible bonus/reaction spells remain. Show all spells should restore the full list without a saved command. Casting from that view should retain normal warnings and Cancel behavior.
- [ ] Cast Healing Word from Bonus, a phone preview, and pinned details. The saved seed should choose level 2 because level 1 is empty. Apply to me, enter a total of 2 for its two dice, and check HP 11 becomes 18. Spellbook and HUD slots should agree; refresh and Undo should restore the whole cast.
- [ ] Use Bardic Inspiration from Bonus. Cutting Words in React and in pinned details should read the same reduced shared pool. This feature spends a bonus action, but must not claim that a bonus-action spell was cast. At zero uses, Use should disable while the explanation remains readable.
- [ ] Cast ordinary level-2 Invisibility on yourself, then attack or cast a cantrip. Your personal Invisibility and its linked concentration should end together. Invisibility cast on an ally should survive your attack. For an upcast self effect, the self effect should end while concentration remains with a note for possible other targets; end concentration manually if none remain. Undo should restore the exact previous state.
- [ ] Open a blank character: no spells, weapons, or Bard features should be inherited from The Fool. Items should state that its actions are coming in Phase 2. At 375 px, tablet, and desktop widths, check previews, pinned details, warning cancellation, disabled-resource reasons, keyboard focus, and horizontal scrolling.

Action tabs, HP, and concentration-save tracking are live. Effect countdowns and the Combat log remain scheduled M5 work; their current preview is labeled. Target results, contests, additional attacks from features, and readied-spell holding remain decisions at the table.

## Phase 1 — M5: HP, concentration saves, and death saves

- [ ] Check The Fool starts at HP 11/19 in both HUD and Combat. Apply 5 damage from Combat, heal, give temporary HP, and clear them. Refresh between changes; counts and Undo should agree everywhere. Use a copy for the 0-HP cases below.
- [ ] From both HUD and Combat, give 10 temporary HP and try replacing them with 5. Cancel must retain the open editor, entered 5, old 10 temporary HP, and Apply focus. Do anyway applies once, closes the editor, and restores its opener. Undo should restore 10 after refresh. Recheck the desktop HUD popover as well as phone sheets.
- [ ] While concentrating, take two separate damage instances. The banner should show the current spell, the oldest DC, and two pending checks. Navigate to another screen and refresh: both checks should remain. Pass removes only one; Fail ends concentration and its linked personal effects. Undo restores the exact checks and effects. The app must never choose Pass or Fail for you.
- [ ] At HP 19 with 30 temporary HP, take 22 damage while concentrating. HP should stay 19, temporary HP become 8, and the save DC should be 11. Dropping to 0 instead should end concentration without leaving a save request. Replacing or manually ending the concentrated spell must remove old requests.
- [ ] At 0 HP, enter natural d20 9 with Other bonus or penalty 1. It should record one success and clear both inputs. Natural 1 gives two failures; natural 20 restores 1 HP and resets the tracker regardless of a pending external modifier. Undo should restore the previous counters and unconscious state. At stable or dead states, illegal death-save actions should disable.
- [ ] Reach three successes at 0 HP, give 8 temporary HP, then record 3 damage with Critical hit at 0 HP checked. Temporary HP should become 5, stability end, and two failures be recorded despite unchanged HP. A third failure should show Dead and disable ordinary healing; Undo must restore the prior state.
- [ ] Open the HUD HP editor while dying and choose Natural 20. The editor should remain usable at HP 1, with keyboard focus inside it after the tracker disappears. Test this on phone and desktop, including typed rolls and shortcut buttons.
- [ ] Create a pending save in Assisted, switch to Manual, and return. The saved check should remain behind Review concentration saves. Resolve it explicitly, then take more damage in Manual: no new automatic reminder should appear. Switching modes must not erase saved checks or HP history.
- [ ] For Q21, already-zero HP plus temporary HP can produce competing instant-death interpretations. The current remainder-based default shows a DM-review note in Assisted when outcomes differ. Confirm the table's ruling; this default is not a settled ruling. Manual suppresses the reminder. Undo remains available.

Current concentration and HP are live across character routes. Remaining effect countdowns and Combat log presentation are still previews until their scheduled M5 task.
