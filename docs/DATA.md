# OmniDnD — Data

## 1. Approach: hybrid, not a rulebook dump

| Layer | What | Changes | Storage |
|---|---|---|---|
| **A. Reference** | Spells, classes, features, items, conditions, races, backgrounds | Rarely (app updates) | JSON packs bundled with the app |
| **B. Build** | Who the character is: race, class levels, known spells, proficiencies, owned items, choices | Between sessions | IndexedDB |
| **C. Live state** | What is happening now: HP, slots used, uses spent, effects, combat, clock | Every few seconds in play | IndexedDB |
| **Event log** | Every command with undo patches | Every command | IndexedDB |

Full rule text we cannot store → short own-words summary + link to the external page.

The data model supports many campaigns and characters, including future friends' characters. The Fool is the first acceptance fixture, not a restriction on supported characters.

## 2. Reference sources

| Source | Use | License |
|---|---|---|
| SRD 5.1 from [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (`src/2014/en`, the data behind the [D&D 5e API](https://www.dnd5eapi.co/)), pinned to one commit | Import **once at build time** with `npm run import:srd` (`scripts/import-srd.ts`) → `data/srd/*.json` (committed). Mapping rules: D50 | CC BY 4.0. Attribution required (below). |
| [Open5e](https://open5e.com/) | Backup / cross-check for SRD data | Check license per document |
| `data/content/<kind>.json` | Non-SRD entries the app needs (PHB-only, Xanathar's, Tasha's): name, metadata, **own-words** summary (≤ 40 words), URL. **No copied text.** | Committed (repo is public). Mechanics and names only, expressed in our words. |
| `data/content/summaries.json` | Own-words `summary`, `summaryReviewed`, `url` for SRD entries, merged onto the entry by id | Our own work |
| `data/private/` | Anything copied or pasted from books, personal notes | **Gitignored.** Never committed. |
| `data/mechanics/<kind>.json` | Machine-readable mechanics the text lacks (activation, uses, recharge, dice, modifiers, tags, effect templates), merged onto the entry by id. Text fields are rejected | Our own work |
| External links | Full text: D&D Beyond, 5e.tools (2014) | Link only |

- **No runtime API calls.** The app works fully offline.
- Some test-character content is not in the SRD (e.g., Charlatan background, Dissonant Whispers). The import script reports missing IDs; add them to `data/content/`.
- `src/data/registry.ts` builds one registry from all layers (D51). An overlay field replaces the entry's field whole, and the merged entry must still pass its schema, so a bad overlay fails at load and in `npm test`.
- Repo is public: before committing, check that no file outside `data/srd/` contains book text.
- Phase 1: write summaries for The Fool's spells and features first. Other SRD entries show their SRD text until summarized.

**SRD attribution (show on Reference → Credits):**

> This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

Also credit game-icons.net (CC BY 3.0) and Lucide (ISC).

## 3. IDs and tags

- Stable kebab IDs with kind prefix: `spell.faerie-fire`, `feature.bard.cutting-words`, `item.rapier`, `condition.prone`.
- SRD entries reuse API indexes, with class prefixes for features/subclasses and one combined entry for features split by level (D50). Non-SRD entries follow the same kebab style (D49).
- `ruleset: '5e-2014'` on every entry. Loader rejects anything else.
- `source: 'PHB' | 'XGE' | 'TCE' | 'HB'`. Separate `srd: boolean` (true → SRD text may be shown).
- Campaign Setup filters by `source`.

## 4. Schemas

**Source of truth: the zod schemas in `src/engine/schema/` (D47).** The sketch below shows the shape; when it and the code disagree, the code wins. Game time is stored in seconds (D46).

```ts
type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
type Recharge = 'short' | 'long' | 'dawn' | 'none';
type Cost = 'action' | 'bonus' | 'reaction' | 'free' | 'none';

interface Summary {
  effect: string;          // main line, ≤ 40 words
  fail?: string; success?: string; hit?: string;
  upcast?: string; scaling?: string;
}

interface RefBase {
  id: string; kind: string; name: string;
  ruleset: '5e-2014'; source: 'PHB' | 'XGE' | 'TCE' | 'HB'; srd: boolean;
  summary: Summary;
  summaryReviewed?: boolean;  // false until the user checks an agent-written summary
  fullText?: string;          // SRD entries only
  url?: string; iconId?: string;
}

interface SpellDef extends RefBase {
  kind: 'spell';
  level: number;              // 0 = cantrip
  school: string;
  casting: { cost: Cost | 'minutes' | 'hours'; amount?: number; trigger?: string };
  range: string;              // '60 ft' | 'Self' | 'Touch'
  components: { v: boolean; s: boolean; m?: string };
  duration: { text: string; seconds?: number; concentration: boolean };  // seconds absent: instantaneous / until dispelled
  ritual: boolean;
  save?: Ability; attack?: 'melee' | 'ranged';
  classes: string[];
  tags: SpellType[];          // display only (D39); tags[0] = main type, sets the row colour; [] → 'utility'
  effect?: EffectTemplate;    // effect created on cast (Faerie Fire, Invisibility)
}

type SpellType = 'damage' | 'control' | 'healing' | 'buff' | 'debuff' | 'utility';

interface FeatureDef extends RefBase {
  kind: 'feature';
  origin: 'race' | 'class' | 'subclass' | 'background' | 'feat' | 'item' | 'homebrew';
  activation: 'passive' | Cost | 'special';
  trigger?: string;                     // reactions: "creature within 60 ft makes attack/check/damage roll"
  uses?: { max: Formula; recharge: Recharge | RechargeByLevel };
  usesFrom?: string;                    // spends another feature's uses (Cutting Words → Bardic Inspiration)
  die?: DieByLevel;
  modifiers?: Modifier[];               // passive math, e.g. JoAT
  hook?: string;                        // complex logic in src/engine/hooks/<id>.ts
}
```

Class, subclass, race, background, item and condition entries are in `src/engine/schema/refs.ts`. Points the sketch does not show: a subrace is a full race entry with `subraceOf: 'race.<parent>'`; ammunition items carry `bundle` (arrows come 20 per purchase); weapon `damage` is dice, a flat number (blowgun 1), or absent (net), and `damageType` is present exactly when `damage` is.

`Formula`, `RechargeByLevel`, `DieByLevel` are small declarative forms (e.g., `{ abilityMod: 'CHA', min: 1 }`, `{ 1: 'long', 5: 'short' }`, `{ 1: 'd6', 5: 'd8', 10: 'd10', 15: 'd12' }`). More complex logic uses a code hook, not a custom expression language.

```ts
interface Campaign {
  id: string; name: string;                        // "#273"
  ruleset: '5e-2014';
  leveling: 'xp' | 'milestone';
  hpMethod: 'average' | 'rolled';
  hpLevelFloor: 'none' | 'one';                    // D44: 'none' (default) lets roll + CON go below 1
  abilityMethod: 'standard-array' | 'point-buy' | 'rolled';
  sources: ('PHB' | 'XGE' | 'TCE' | 'HB')[];
  optionalRules: Record<string, boolean>;          // all false unless the user enables them
}

interface CharacterBuild {
  id: string; schemaVersion: number; name: string; portrait?: string;
  raceId: string; subraceId?: string; backgroundId: string; alignment?: string;
  classes: { classId: string; subclassId?: string; level: number }[];
  xp?: number;                                     // only used when campaign.leveling = 'xp'
  abilityScores: {
    base: Record<Ability, number>;                 // entered per campaign method
    bonuses: { source: string; ability: Ability; value: number }[];  // racial, ASI, feat, item
  };                                               // final = base + bonuses (computed)
  hpEntries: { level: number; classId: string; value: number; method: 'max' | 'average' | 'rolled';
               floor?: 'none' | 'one' }[];
                                                   // one per level; level 1 = 'max'; locked once added
  proficiencies: { saves: Ability[]; skills: string[]; expertise: string[];
                   armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  spells: { classId: string; known: string[]; prepared?: string[] }[];
  spellTags?: Record<string, SpellType[]>;         // per-character tag override, edited in Manage (M4)
  favorites: string[];
  featureIds: string[];                            // extras only (feats, DM grants, homebrew); granted features are derived (D48)
  choices: Record<string, unknown>;
  items: { instanceId: string; itemId: string; container?: string; notes?: string }[];
  journal: { personality?: string; ideals?: string; bonds?: string; flaws?: string;
             backstory?: string; appearance?: Record<string, string>; notes?: string };
  overrides: { path: string; value: unknown; note: string }[];
  campaignId: string;
}

interface LiveState {
  characterId: string;
  hp: number; tempHp: number; deathSaves: { success: number; fail: number };
  inspiration?: boolean;                          // ordinary Inspiration, distinct from class uses
  hitDiceSpent: Record<string, number>;            // { d8: 1 }
  slotsUsed: number[];                             // index = spell level
  pactSlotsUsed?: number;
  featureUsesSpent: Record<string, number>;
  concentration?: { spellId: string; slotLevel?: number; endsAt?: number;
                   effectId?: string;              // effectId only when the spell targets you
                   pendingSaves?: { id: string; dc: number }[] };
  effects: ActiveEffect[]; conditions: string[]; exhaustion: number;
  items: Record<string, { qty: number; charges?: number; equipped: boolean; attuned: boolean }>;
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };
  clock: { seconds: number };                      // game seconds since Day 1 00:00 (D46); 1 round = 6 s
  lastLongRestEnd?: number;                        // game seconds
  combat?: {
    round: number;                                 // no initiative order (D42); Start Turn advances it
    turnActive: boolean;                           // between Start Turn and End Turn
    economy: { actionUsed: boolean; bonusUsed: boolean; reactionUsed: boolean;
               movementUsed: number; objectInteractionUsed: boolean;
               dashCount?: number;                // extra movement allowances, removed at End Turn
               bonusActionSpellCast: boolean;      // bonus-action spell rule
               otherSpellCast: boolean };          // any spell but a 1-action cantrip
  };
}
```

**Campaign ↔ character (D38):** one campaign has many characters. `CharacterBuild.campaignId` is the only link; the hub lists characters by grouping on it.

**Concentration vs effects (D41):** `concentration` is the caster's own state; `effects` holds only effects targeting this character. Faerie Fire cast on enemies sets `concentration` and adds nothing to `effects`.

**Pending concentration saves (M5):** Assisted damage records one `{ id, dc }` request per damage instance, using damage after reductions and before temporary HP. Pass removes one request; Fail ends concentration and linked effects, replacement/end/expiry clears old requests, Manual creates none, and Undo restores the exact state without legacy rewrites.

**Store "used", not "remaining".** Maximums are computed from the build, so a level-up or override never desyncs live values.

**Ordinary Inspiration (M7):** absent `live.inspiration` reads as false; only `setInspiration` writes it, and Undo restores absence exactly. Bardic Inspiration is a separate feature-use pool; neither chooses advantage or DM outcomes automatically.

**Sheet explanations (M7):** additive `Stat.parts` sum to the displayed total, including HP's minimum-one adjustment; optional `Stat.notes` explain formulas, rounding, caps and locked entries. Scalar explanations from `sheetBreakdowns` are never persisted.

**Noted overrides (M7):** `build.overrides` recognizes canonical paths such as `/abilities/CHA/mod`, numeric values and owned feature dice; unrecognized or unsafe entries remain untouched. Calculation-stage overrides feed dependent values, while transient `Stat.override` metadata supplies the ✎ marker and original calculated value.

**Remaining corrections (D101):** a remaining-resource path stores the provenance below in its existing `value` field and changes the corresponding spent counter through a command. Later changes to that counter clear the active annotation; Reset can restore its previous spending, and Undo restores both counter and note.

```ts
interface RemainingCorrection {
  kind: 'remaining-correction';
  remaining: number;
  spentBefore: number;
  spent: number;
  max: number;                 // remaining + spent = max
}
```

**Defenses (M7):** optional feature metadata records resistances, immunities, vulnerabilities, saving-throw advantages and magical-sleep protection from owned features. Missing metadata means not recorded; it never automatically reduces damage or decides saves.

**Dash (M5):** optional `combat.economy.dashCount` adds allowances based on current speed and reads as zero when absent. End Turn removes it and Undo restores it, without rewriting older saves.

**Max HP is never stored.** It is computed from `hpEntries` + current CON modifier + modifiers (e.g., exhaustion 4 halves it).

**HP floors (D69):** new entries save the campaign floor; legacy entries use its fallback until a campaign-method change locks their previous floor. Raw rolls and methods stay intact, and current CON still applies to every level.

### Planned companion data (M12; not part of the current schemas)

- **Reference data:** import SRD 5.1 creature statblocks, such as Mastiff, into `data/srd/`. Non-SRD companions use user entry or short own-words content in `data/content/`; copied text stays in `data/private/`.
- **Derived values:** templates cover Eldritch Cannon, Steel Defender, Ranger companions and Find Familiar, using owner class level, proficiency and ability modifiers only where the selected 2014 rule requires them. Familiar forms otherwise use their fixed SRD statblocks; Ranger variant selection remains Q23.
- **Creation and control:** source rules determine feature/spell uses, spell-slot costs, duration, maximum count and game-clock expiry, plus the owner's command cost shown in the economy bar. The user chooses actions and enters rolls or DM outcomes; the engine computes derived numbers and spends resources.
- **Live state:** each companion has its own HP, damage, healing, conditions and uses, and is destroyed or dismissed at 0 HP. Creation, commands and all changes are logged and undoable.
- **Ownership and persistence:** companion definitions/choices and live state belong to the owning character's save and export. The concrete schema, migration and command shapes will be designed in M12; the schemas above do not yet contain companion fields.
- **Edition and dependency:** Artificer companions use the 2014-compatible `TCE` Artificer, never 2024 rules or Eberron: Forge of the Artificer (2025). M12 plans companion support; Cannon and Steel Defender automation depends on Artificer class support in M14.

## 5. Commands and event log

```ts
type Command = (ctx: { build; live; refs; campaign }, payload) =>
  { result: 'ok' | 'blocked' | 'warn'; reasons: string[]; next?: { build; live } };

interface LogEvent {
  id: string; characterId: string; realTime: string; gameSeconds: number;
  command: string; text: string;            // "Cast Faerie Fire (L1 slot)"
  patches: Patch[]; inversePatches: Patch[];  // Immer
  override?: boolean;                       // user chose "Do anyway"
  undoneBy?: string;
}
```

- Commands run with Immer `produceWithPatches` on `{ build, live }`.
- `warn` result → UI confirms → re-run with `force: true` → event marked `override`.
- **Undo** applies the last non-undone event's inverse patches and appends an `undo` event. Linear undo only.
- Keep the last 500 events per character.

Combat displays history newest first, with override/undone markers and the clock before each command; historical rounds are not inferred. Undo skips undo records and previously undone commands.

Short Rest previews use unsaved drafts and discarded command results; Apply records dice, optional Song of Rest, recovery, expiry and time in one `completeShortRest` event. Optional `songOfRestSource` distinguishes self from another bard without rewriting old records.

Long Rest previews preserve warnings without saving; Apply uses normal command feedback and records an override only after an explicit choice. Opening prepared-spell review changes nothing; edits use separate commands.

Dashboard Quick Access uses reference-ID favorites for spells, features and items, resolving actions for each applicable class or owned item instance. The manager can remove unavailable references without rewriting unrelated entries; displayed pools stop at zero while raw overspending stays saved until explicitly corrected.

Dashboard's shared Game Clock converts chosen durations to seconds and dispatches `advanceTime`; Exploration will reuse it and the same saved clock (D91). Previews never save, and unsafe elapsed-time or deadline arithmetic Blocks before mutation.

## 6. Persistence

- Dexie database `omnidnd`. Tables: `builds`, `live`, `events`, `campaigns`, `settings`, `userPacks`, `backups`.
- Write after every command. Zustand store mirrors the active character for the UI.
- `schemaVersion` on every saved record. Migrations in `src/db/migrations/` as pure functions (vN → vN+1), unit-tested.
- **Export:** `{ app: 'omnidnd', schemaVersion, exportedAt, build, live, events, campaign }` (`ExportFileSchema`; the seed `data/characters/the-fool.json` uses the same shape, D49). **Import:** zod-validate → migrate → preview → save.
- **Auto backups:** before import, before reset, after each long rest. Keep the last 10.
- **Stored rows (M3):** `{ id, schemaVersion, data }`; event rows also have `characterId` and a stable `order`, with compound primary key `[characterId + id]`. This keeps identical imported event IDs on different characters separate.
- **Atomic saves:** builds, live states, logs and campaigns save together; success feedback waits for completion. Startup validates records and remaining Undo history, preserving invalid data with a load error.
- **Window conflicts:** each save checks `workspaceRevision`; stale windows retain unsaved changes with an explicit conflict message. Retry never forces an overwrite.
- **Management history:** creation, duplication, deletion and import use a separate 500-event `managementEvents` log saved with character data. Undo warns before replacing subsequent character changes; exports retain the single-character shape.
- **Shared history order:** optional device-local `activityOrder` references order character and workspace changes for the shared Undo; exports and game events stay unchanged. Older untracked histories keep their own order, with character history first when the relative order is unknown.
- **Import collisions:** matching character IDs add a copy; conflicting campaign rules add a campaign. Copies retain values and choices but start fresh action histories, as explained in the import preview.
- **Reference bookmarks (D70):** device-wide `bookmarks` stores unique `{ id, title, url }` entries with HTTP(S) URLs, managed through commands and durable Undo. Missing legacy data reads as empty, malformed data causes a load error, and character exports omit bookmarks.
- **Device preferences (D71):** commands save and undo `automation` (default `assisted`) and `reducedMotion` (default `false`); invalid data fails loading without erasure. OS or saved motion preference enables reduced motion, and character exports omit device preferences.

## 7. Summary style (house style)

Short, mechanical, no flavor. Same shape for every spell:

```
Faerie Fire                                     PHB
L1 Evocation · A · 60 ft · DEX save · Conc, 1 min
V
20-ft cube. Fail: target outlined in light (dim light 10 ft).
Attacks vs it have advantage if the attacker can see it; it can't benefit from invisible.
```

Rules:
- Header: `L<n> <School> · <Time> · <Range> · <Save/Attack> · <Duration>`. Cantrip = `Cantrip <School>`.
- Second line: components; material only if costly or consumed.
- Effect ≤ 40 words. Then optional `Fail:` / `Success:` / `Hit:` / `Upcast:` / `Scaling:` lines.
- Use exact numbers and dice, address "target" and "you", and omit "you can choose to" or lore.
- Casting badges: `A` action, `BA` bonus action, `R` reaction, else `1 min` / `10 min` / `1 h`.
- Features use the same shape: `Activation · Uses · Recharge`, then effect.

## 8. Folder layout

```
src/
  engine/       pure TS: calc/, commands/, validate/, hooks/, rules2014.ts
  engine/schema/  zod schemas + inferred types (D47)
  data/         pack loaders, registry (import schemas from engine/schema)
  state/        Zustand store wrapping engine
  db/           Dexie, migrations/
  ui/           components/ (design system), screens/, layout/
  theme/        tokens.css
data/
  srd/          generated by import script
  mechanics/    our machine-readable overlays, one file per kind
  content/      non-SRD own-words entries + summaries.json overlay (committed)
  private/      gitignored
  characters/   seed characters (the-fool.json)
scripts/        import-srd.ts, srd/map.ts (pure mappers, unit-tested)
tests/          e2e/ (Playwright)
docs/
```
