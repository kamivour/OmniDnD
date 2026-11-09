# OmniDnD — Agent Guide

D&D 5e **2014** character companion for future campaigns and friends' characters. Responsive web app / PWA; no backend. The Fool is the acceptance fixture, not the limit of supported characters.

## Read first (in this order)

1. [docs/PROGRESS.md](docs/PROGRESS.md) — where we are, what to do next ([docs/PLAN.md](docs/PLAN.md) details M22–M25)
2. [docs/SPEC.md](docs/SPEC.md) — what to build, screen by screen, plus rules engine
3. [docs/DESIGN.md](docs/DESIGN.md) — visual direction, tokens, key frames
4. [docs/DATA.md](docs/DATA.md) — data layers, schemas, sources, summary style
5. [docs/DECISIONS.md](docs/DECISIONS.md) — decided items + open questions
6. [docs/TEST_CHARACTER.md](docs/TEST_CHARACTER.md) — The Fool, expected values, acceptance scenario

## Hard rules

- **2014 rules only.** Never apply 2024 rules (new exhaustion, weapon mastery, revised spells, etc.). If unsure which edition a rule is from, add an open question to DECISIONS.md. Do not guess.
- **All state changes go through engine commands** (`castSpell`, `applyDamage`, ...). UI never mutates character state directly.
- **Engine is pure TypeScript** in `src/engine/`. No React, DOM, or storage imports. Unit-tested with Vitest.
- **Every command is logged and undoable.**
- **No rulebook copying. The repo is public.** Write short summaries in your own words (style in DATA.md). Non-SRD entries live in `data/content/` (own words only). Anything copied goes in gitignored `data/private/`.
- **User enters choices, app computes numbers.** Never make the user type a value the engine can derive.
- **One milestone at a time.** Future screens exist as placeholders only. Do not build Phase 2+ modules early.
- **DM outcomes stay manual.** Hits, saves, target behavior, rulings: player enters them. App warns, never silently decides.
- **New screens and sections register a Find entry** in `src/ui/find/places.ts` (title, route, anchor, synonyms). `places.test.ts` fails when a nav route has none.

## Workflow per task

1. Pick the next unchecked task in PROGRESS.md (current milestone only).
2. Build it. Add or update tests.
3. Done means: tests pass, typecheck passes, works at 375 px width and at desktop width.
4. Update PROGRESS.md: tick the box, add one line to the Session log.
5. Add an entry at the top of [docs/CHANGELOG.md](docs/CHANGELOG.md): `## YYYY-MM-DD HH:MM — Title` in local time (`date "+%Y-%m-%d %H:%M"`), then short plain-language bullets for the user (what changed, anything to watch for, what's next).
6. Made a non-obvious choice? Add it to DECISIONS.md "Decided".
7. Hit an unknown? Add it to "Open questions" with a safe, reversible default, then continue. Ask the user only when no safe default exists.
8. Commit the task on `main`: one commit per finished task, made after tests, typecheck and lint pass, with a Conventional Commits message (`feat(engine): …`, `docs: …`). Never push unless the user asks.

## Docs style

- **CHANGELOG:** 2–4 short bullets per entry in plain language: what the user can now see or do, and what they should check. No test counts or tooling details (loopback errors, Radix, screenshots, focus handling). End with “Checks pass.” or say what failed.
- **PROGRESS session log:** one line per task, about 25 words at most.
- **DECISIONS:** only product or rules choices the user might disagree with, in 1–2 sentences each. Implementation and test-setup notes belong in code comments or tests.
- **DATA.md:** keep the schemas; keep each prose note to 1–2 sentences.
- **MANUAL_QA.md:** at most 10 items per milestone, only things a person must judge: look, feel, or rules.

## Commands

```
npm run dev         # Vite dev server (http://localhost:5173)
npm test            # Vitest, once (src/**/*.test.ts)
npm run test:watch  # Vitest, watch mode
npm run typecheck   # tsc -b (app + node configs)
npm run lint        # ESLint (also enforces engine purity)
npm run format      # Prettier (Markdown is not formatted)
npm run e2e         # Playwright: builds, serves on :4173, runs at 375 px and 1440 px
npm run build       # typecheck + production build to dist/
npm run generate:icons # regenerate install icons from favicon.svg (uses Playwright Chromium)
npm run check:tools # report dead links in the tools list (by hand, needs internet)
npm run check:party # live party row-level security check (throwaway Supabase project only)
npm run import:srd  # regenerate data/srd/ from the pinned SRD source (--from <dir> for a local copy)
```

If Windows intermittently denies Chromium loopback sockets (`ERR_NETWORK_ACCESS_DENIED`, Winsock 10013), run browser checks with `OMNI_E2E_FORWARD_HTTP=1`. In PowerShell: `$env:OMNI_E2E_FORWARD_HTTP='1'; npm run e2e`. This forwards actual local server responses through Playwright's request client; it does not mock the app. Native browser networking and offline operation still need separate checks. Default tests use normal browser HTTP.

First run on a new machine: `npm install` then `npx playwright install chromium`.

Styling: only token classes exist (`bg-surface`, `text-accent`, `rounded-card`, `text-hp`, ...). Tailwind's default palette is disabled. Tokens live in `src/theme/tokens.css`; the Tailwind mapping is in `src/index.css`.
