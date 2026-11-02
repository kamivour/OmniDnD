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

The hub, blank character creation, HUD, and local saving are live. Campaign settings can display saved rules; saving settings and creating campaigns come next. Dashboard, Spellbook, and Combat content still uses the approved static frames until M4–M6. Automated checks cover failed-write rollback, Retry, and rejecting damaged records without erasing them.
