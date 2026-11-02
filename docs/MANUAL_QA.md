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
- [ ] Give yourself 10 temp HP, then try replacing it with 5. Cancel should keep 10; Do anyway should set 5. Undo should restore 10. Closing the warning should return focus to the HP button.
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
