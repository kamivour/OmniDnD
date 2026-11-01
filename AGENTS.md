# OmniDnD — Agent Guide

Personal D&D 5e **2014** character companion. Responsive web app / PWA. No backend.

## Read first (in this order)

1. [docs/PROGRESS.md](docs/PROGRESS.md) — where we are, what to do next
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

## Workflow per task

1. Pick the next unchecked task in PROGRESS.md (current milestone only).
2. Build it. Add or update tests.
3. Done means: tests pass, typecheck passes, works at 375 px width and at desktop width.
4. Update PROGRESS.md: tick the box, add one line to the Session log.
5. Add an entry at the top of [docs/CHANGELOG.md](docs/CHANGELOG.md): `## YYYY-MM-DD HH:MM — Title` in local time (`date "+%Y-%m-%d %H:%M"`), then short plain-language bullets for the user (what changed, anything to watch for, what's next).
6. Made a non-obvious choice? Add it to DECISIONS.md "Decided".
7. Hit an unknown? Add it to "Open questions" with a safe, reversible default, then continue. Ask the user only when no safe default exists.
8. Commit the task on `main`: one commit per finished task, made after tests, typecheck and lint pass, with a Conventional Commits message (`feat(engine): …`, `docs: …`). Never push unless the user asks.

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
npm run import:srd  # regenerate data/srd/ from the pinned SRD source (--from <dir> for a local copy)
```

First run on a new machine: `npm install` then `npx playwright install chromium`.

Styling: only token classes exist (`bg-surface`, `text-accent`, `rounded-card`, `text-hp`, ...). Tailwind's default palette is disabled. Tokens live in `src/theme/tokens.css`; the Tailwind mapping is in `src/index.css`.
