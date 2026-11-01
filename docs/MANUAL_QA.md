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

At this stage game controls still use static frame actions. Live HUD, saving, and other screens follow in their scheduled tasks.
