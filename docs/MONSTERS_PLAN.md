# M50 design: Monsters in the Compendium

## Goal

The Compendium gets a **Monsters** tab. It covers every stat block and its lore from four monster books the user owns, NPCs included:

| Book | Code | Pages | Stat blocks (approx.) |
|---|---|---|---|
| Monster Manual | MM | 354 | ~450 (incl. Appendix A beasts and Appendix B NPCs) |
| Volo's Guide to Monsters | VGM | 226 | ~140 (incl. NPCs) |
| Mordenkainen's Tome of Foes | MTF | 258 | ~140 |
| Monsters of the Multiverse | MPMM | 288 | ~260 |

That is about 1,000 stat blocks but only about 700 distinct creatures, because MPMM reprints most VGM and MTF monsters.

## Decisions (D269–D272)

- **One creature, many book tags.** The extractor keeps every copy in its per-book work files. The app gets one entry per creature, tagged with each book and page it appears on. The stats come from the newest printing: MPMM before VGM and MTF. The creature shows when any of its tagged books is on for the campaign.
- **MPMM is allowed.** It is a 2022 book for the 2014 rules, not part of the 2024 revision.
- **Lore is included.** Each creature family keeps its lore sections and sidebars. Lore from every book is kept and tagged by book, because the books word it differently. Identical paragraphs are kept once.
- **Packs stay on the device.** Each person imports the pack file on each device. Nothing syncs. The copyright question stays open for the user.

## Hard constraint: book text never becomes public

The repo is public and the app is publicly hosted.

- Extracted text, work files and the finished pack live only in `data/private/monsters/`, which is gitignored.
- The production build never contains a pack. A build test fails if a pack canary string appears in `dist/`.
- The app loads monsters at **runtime**. A person imports the pack in Settings > Monster packs, and it is stored in IndexedDB, local only.
- Packs never upload to Supabase.
- Committed code holds the extractor and the parser only.
  - Parser tests use made-up stat blocks written for the tests.
  - Committed code holds no book file names and no local paths. The PDF path is a command argument.
- MM monsters that are in the SRD keep their public data in `data/srd/creatures.json`. The pack adds MM's lore, its page tags and the creatures the SRD lacks.

## Findings from probing the PDFs

- All four PDFs carry a text layer, so no new OCR is needed. Pages are never rendered for extraction. A 124 MB PDF reduces to about 1 MB of text.
- The text is OCR output. Expect `dl0` for `d10`, `l` and `I` for `1`, `0` for `O` in names, `ft` and `fl` ligature mistakes, split words such as `In· telligence` and `sl ashing`, and small-caps names such as `ELD ER0BLEX`.
- In two-column layouts the ability header row and its values come apart. Parse the six `N (±M)` tuples in order.
- `pdftotext` 4.00 (Xpdf) and `pdftoppm` (MiKTeX) are installed, but Xpdf gives no coordinates. `pdfjs-dist`, a devDependency in pure Node, gives positions and font sizes for each text run.

## Pipeline (`scripts/monsters/`, Node + TypeScript)

Each stage caches its output in `data/private/monsters/work/<book>/`. Stages can run alone and give the same result each time.

1. **Extract.** pdfjs reads each page.
   - It splits text runs into columns by x position, then sorts them top to bottom.
   - It drops running headers, footers and page numbers.
   - It writes `pages.json`: lines with font size, bold and caps flags. Headings are found from font size.
2. **Chapters.** Read each book's table of contents to find the page ranges of the bestiary chapters, the NPC appendices and the monster-lore chapters. Skip player race options, introductions and indexes.
3. **Ground-truth names.** Build the list of expected creature names from each book's contents, index or appendix lists. The list fixes OCR'd titles and measures coverage.
4. **Segment.**
   - A stat block starts at a name line followed by `Size type, alignment`, and ends before the next block or the next lore heading. Blocks split across columns or pages are joined.
   - The text between a family heading and its stat blocks becomes that family's lore sections. Sidebars become sections too.
5. **Clean.** Apply OCR fixes in context only.
   - Number fixes apply only inside dice, bonus and score tokens.
   - Word fixes use the known vocabulary: spells, conditions, damage types, skills, languages, creature types and the ground-truth names, with edit distance ≤ 2.
   - Rejoin hyphenated and split words with a dictionary.
6. **Parse.** Map each block to the existing `CreatureDef` in `src/engine/schema/refs.ts`:
   - header, AC, HP and its formula, speeds;
   - abilities, saves and skills;
   - damage and condition lists, senses, languages;
   - CR, XP and proficiency bonus;
   - traits, actions, bonus actions, reactions, legendary, lair and mythic sections;
   - attack bonus and damage dice for each action.
7. **Validate with math.**
   - HP is the average of its formula. The formula's flat bonus is dice count × CON modifier.
   - Each printed modifier matches its score.
   - XP and proficiency bonus match the CR.
   - Saves and skills are modifier + PB, or + 2×PB for expertise.
   - Passive Perception is 10 + Perception.
   - Attack bonuses are PB + STR or DEX modifier, and damage bonuses use the same modifier.
   - Spell save DC is 8 + PB + modifier.
   - Every ground-truth name has a block.
   - Auto-fix only when exactly one OCR substitution makes every check pass. Anything else goes to review.
8. **Cross-check.**
   - The MM blocks that are also in the SRD form a free gold set of about 330. The parser must match `data/srd/creatures.json` on at least 98% of fields before running the other books.
   - Compare VGM and MTF blocks with same-name MPMM reprints. Differences can come from printing changes or OCR and are listed for review.
9. **Review.** `review.html` shows flagged blocks with their failed checks, parsed fields and printed pages. Keep verified field patches, source transcriptions and index corrections in `data/private/monsters/overrides/<book>.json` so they apply on each run.
10. **Merge and pack.**
    - Match duplicates by normalized name, plus an alias file for renamed creatures.
    - Write `data/private/monsters/monsters.pack.json`: `{format: 1, version, extractedAt, canary, creatures[], lore[], supplements[]}`.
    - Each creature carries `books: [{source, page}]` and `loreIds`. SRD creatures get only book tags and lore (`supplements`).
    - A `manifest.json` records the counts per book, fallbacks to older printings and the creatures left out.

Run `npm run monsters -- pack` to merge all reviewed books into the pack. Run `npm run monsters -- validate --book MM` for the stat and index checks. Run `npm run monsters -- review --book MM --pdf <path>` to also render the flagged pages in `data/private/monsters/work/MM/review.html`.

## App changes

- **Sources.** Add `MM`, `VGM`, `MTF` and `MPMM` to `SourceSchema` and the campaign book choices. Retag the SRD creatures from `PHB` to `MM`, keeping `srd: true`.
- **Pack schema.** `MonsterPackSchema` in the engine validates on import.
- **Storage.** The local-only Dexie table `userPacks` holds the pack. Pack entries are marked "From your monster pack".
- **Settings > Monster packs.** Import file, a list showing counts, and Remove. Import errors say plainly what is wrong.
- **Dev only.** The dev server serves `data/private/monsters/monsters.pack.json` as `virtual:dev-monster-pack` when no pack is saved; a build gets an empty module and fails on any `data/private/` import. The canary test proves the production build excludes it.
- **Registry.** Pack creatures merge into the creature catalog, filtered by the campaign's books. The encounter tracker and Reference get them through that catalog.
- **Compendium > Monsters tab.**
  - Search by name.
  - Filters: CR range, type, size, book, legendary, NPC.
  - Sort by name or CR, grouped by CR.
  - The detail view uses `CreatureStatblock`, with book and page tags, the family lore below and "Add to encounter" when a fight is open.
  - The list is virtualized.
  - Without a pack, the tab shows the SRD monsters and a one-line import hint.
- **Find.** Add an entry in `places.ts` for Compendium Monsters, with the synonyms monster, npc, creature and stat block.

## Tasks

1. **T1 Extract.** Stages 1–3 for all four books. Report page counts, chapter ranges and the expected names for each book.
2. **T2 Parser.** Stages 4–6. Unit tests use made-up blocks. Reach ≥ 98% field match on the SRD gold set.
3. **T3 Validate and review.** Stages 7–9 on all four books. Reach zero blocking errors and full name coverage.
4. **T4 Merge and packs in the app.** Stage 10, the sources, the pack schema, the Dexie table, Settings import and remove, dev auto-load and the canary test.
5. **T5 Monsters tab.** Tab, filters and sort, detail with lore, encounter link and the Find entry.
6. **T6 Verify.** Check at 375 px and 1440 px in two themes, plus import errors, book filtering and performance with the full pack. Update the docs.
