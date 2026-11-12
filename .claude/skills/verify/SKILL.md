---
name: verify
description: How to launch OmniDnD and drive it in a real browser to check a change at its surface (project recipe for /verify).
---

# Verify OmniDnD in the running app

## Launch

```
npm run dev -- --port 5180     # leave running; app at http://localhost:5180
```

Drive it with a plain Playwright script (`require('<repo>/node_modules/@playwright/test')`, `chromium.launch()`), at 375 px and 1440 px. Keep scripts and screenshots outside the repo.

## Gotchas

- A new browser has no characters. Seed the sample Fool before load:
  `context.addInitScript(() => localStorage.setItem('omnidnd.sample', '1'))`, then open `/characters/the-fool/...`.
- A tour covers each screen on its first visit (Home, Combat, ...). Click **Skip tutorial** every time it shows, or clicks time out.
- New character opens a **Who plays this character?** dialog (pick **Me**) and starts in **Step by step**. Click **One page** to fill the whole form at once.
- Windows sometimes blocks Chromium loopback: blank page, `ERR_NETWORK_ACCESS_DENIED`, HMR WebSocket errors. Retry `goto` and reload while the body text is empty. This is the machine, not the app.
- Wait for the "Saved locally" status after each command before reading the page.
- Each browser context has its own storage, so characters made in one script run are gone in the next.

## Flows worth driving

- **Companions:** `/characters/the-fool/companions` → Add companion → pick a Template → card region `Companion: <name>`. Icons are lucide SVGs; read the `lucide-*` class on the `svg` in the card `h2`.
- **Encounter tracker:** Combat → Start combat → region "Encounter tracker" → Start tracker → Add combatant (search creatures). Rows are `ol > li`.
- **Content text (features, spells):** Home → article "Campaign #273" → New character → fill Name, Race, Class, Background, Level, `<ABILITY> base`, `Level N roll (dX)`, subclass radio `input[value="subclass.<class>.<name>"]` → Create character. Feature summaries show on `/features`. Spell summaries show in the spell detail sheet: `/spells` → Pending button → tick spells → Done → tap the spell name.
- Reference search lists spells and features by name only; it shows rules text for conditions only. Do not use it to check summaries.
- **Undo:** button "Undo last command" in the top bar reverts the last command.
