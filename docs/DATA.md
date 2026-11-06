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

`Formula`, `RechargeByLevel`, `DieByLevel` are small declarative forms (e.g., `{ abilityMod: 'CHA', min: 1 }`, `{ byLevel: { 2: 1, 17: 2 } }`, `{ perLevel: 1 }`, `{ 1: 'long', 5: 'short' }`, `{ 1: 'd6', 5: 'd8', 10: 'd10', 15: 'd12' }`). More complex logic uses a code hook, not a custom expression language.

```ts
interface Campaign {
  id: string; name: string;                        // "#273"
  ruleset: '5e-2014';
  leveling: 'xp' | 'milestone';
  hpMethod: 'average' | 'rolled';
  hpLevelFloor: 'none' | 'one';                    // D44: 'none' (default) lets roll + CON go below 1
  abilityMethod: 'standard-array' | 'point-buy' | 'rolled';
  sources: ('PHB' | 'XGE' | 'TCE' | 'HB')[];
  optionalRules: Record<string, boolean | string>; // flags off unless enabled; encumbrance and rests hold an option name
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
  customItems?: ItemDef[];                         // player-made items (id item.custom.*), saved with the character (D119)
  journal: { personality?: string; ideals?: string; bonds?: string; flaws?: string;
             relationships?: string; backstory?: string; appearance?: Record<string, string>;
             notes?: string;                                   // all text is Markdown-friendly, shown as typed
             quests?: { id: string; title: string; status: 'open' | 'done'; notes?: string }[];
             npcs?: { id: string; name: string; location?: string; relationship?: string; notes?: string }[];
             locations?: { id: string; name: string; notes?: string }[];
             sessionNotes?: { id: string; date: string; title?: string; text: string }[] }; // M12; lists absent in older saves
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
  items: Record<string, { qty: number; charges?: number; rechargePending?: true; equipped: boolean; attuned: boolean }>;
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

**Inventory (M9):** quantity counts individual items; `bundle` describes purchase size and its listed weight/cost. Zero quantity preserves the instance and other recorded fields, while equipped benefits use only positive quantities (D109–D110).

**Containers (M9):** `container` points to another item instance; display groups follow immediate containers and show nested paths. Accepted legacy circular or non-container links stay visible for review without rewriting saved records.

**Inventory editing (M9):** catalogue additions create separate instances; edits preserve item identity, equipment, attunement and charges while changing the chosen quantity, notes or location. New locations require present containers without cycles, while unchanged accepted legacy links remain recorded.

**Item use (M9):** `data/mechanics/items.json` gives each consumable a `use`: activation (`action`, `special`, `none`), an attack flag, and any healing dice plus bonus (D118).

**Custom items (M9):** custom weapons and armor copy stats from a catalogue item and record it as `baseItemId`, which also counts for weapon proficiency. Import rejects duplicate or non-custom ids.

**Item charges (M9):** `data/srd/magic-items.json` imports SRD magic items with charges from a table checked against the item text; new items start full. A dice regain sets `rechargePending` until the entered roll is applied or skipped (D117).

**Currency and weight (M9):** saved coin counts stay separate; value uses 2014 exchange rates and coins weigh 50 per pound. Weight counts each positive item instance once, divides purchase-bundle weights by bundle size, and marks missing weights as incomplete; capacity comes from the shared Sheet calculation.

**Attunement (M9):** each owned instance's recorded bond counts toward the three-item limit, including depleted records, until explicitly ended. Recording a bond preserves time, equipment, resources and item properties; contact, focused rests, prerequisites, curses and ending conditions remain explicit table checks (D114, Q27).

**Active effects (M10):** `{ id, name, sourceId?, endsAt?, concentration, conditions, modifiers, defenses?, endsOn?, note? }`. `endsOn` is `{ event: 'turn-start' | 'turn-end', round }` or `{ event: 'short-rest' | 'long-rest' }`; defenses are reminders only (D125).

**Concentration vs effects (D41):** `concentration` is the caster's own state; `effects` holds only effects targeting this character. Faerie Fire cast on enemies sets `concentration` and adds nothing to `effects`.

**Pending concentration saves (M5):** Assisted damage records one `{ id, dc }` request per damage instance, using damage after reductions and before temporary HP. Pass removes one request; Fail ends concentration and linked effects, replacement/end/expiry clears old requests, Manual creates none, and Undo restores the exact state without legacy rewrites.

**Store "used", not "remaining".** Maximums are computed from the build, so a level-up or override never desyncs live values.

**Ordinary Inspiration (M7):** absent `live.inspiration` reads as false; only `setInspiration` writes it, and Undo restores absence exactly. Bardic Inspiration is a separate feature-use pool; neither chooses advantage or DM outcomes automatically.

**Sheet explanations (M7):** additive `Stat.parts` sum to the displayed total, including HP's minimum-one adjustment; optional `Stat.notes` explain formulas, rounding, caps and locked entries. Scalar explanations from `sheetBreakdowns` are never persisted.

**Base-score edits (M7):** explicit edits validate all six bases using the campaign's current method; other edits preserve recorded bases even after a method change (D69). Bonuses, overrides, locked HP entries and current resources stay recorded while dependent numbers recalculate.

**Level-up (M7):** one command adds one class level and a locked HP entry; recorded XP, spending and game time stay unchanged. Previews are never saved, and Apply rejects a character or campaign that changed after review.

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

### Companions (M12)

```ts
// build.companions?: Companion[]   live.companions?: Record<id, CompanionLive>   (absent in older saves)
type OwnerNumber = number | { base?; ownerLevel?; classId?; ownerAbilityMod?; ownerProficiency? };
interface Companion {
  id; name; type: 'pet'|'mount'|'familiar'|'summon'|'sidekick'; kind?; iconId?;
  ac: OwnerNumber; maxHp: OwnerNumber; speed: { walk?, fly?, swim?, climb?, burrow? };
  abilities: Record<Ability, number>;
  attacks: { name; bonus: OwnerNumber; damage?: { dice?; bonus?: OwnerNumber; type }; range?; note? }[];
  traits: string[]; uses: { id; name; max; recharge }[];
  limit?: { key; max }; durationSeconds?; sourceId?; notes?;
}
interface CompanionLive {
  status: 'active'|'dismissed'|'destroyed'; hp; tempHp; conditions[]; usesSpent: Record<useId, n>;
  endsAt?; initiative?;
}
```

- **Ownership:** definitions and live state belong to the owning character's save and export; every definition has a live entry and the reverse.
- **Derived values:** formulas follow the owner's level (or one class's level), proficiency and ability modifiers (`calc/companions.ts`).
- **Play:** damage, healing, temp HP, conditions, uses, initiative, dismiss, resummon and commanding are engine commands, all logged and undoable. Timed companions leave play on the shared clock; short, long and dawn uses recharge with rests.
- **Creatures:** `kind: 'creature'` entries (size, type, AC, HP, speeds, abilities, saves, skills, defenses, senses, CR, traits, actions, reactions, legendary actions) come from the SRD import into `data/srd/creatures.json` and show in Reference search.
- **Still to come:** templates for Steel Defender, Eldritch Cannon, Ranger companions and Find Familiar. Artificer templates depend on M14 and use the 2014-compatible `TCE` class only.

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

Dashboard and Exploration share the Game Clock, which converts chosen durations to seconds and dispatches `advanceTime` (D91). Previews never save, and unsafe elapsed-time or deadline arithmetic Blocks before mutation.

## 6. Persistence

- Dexie database `omnidnd`. Tables: `builds`, `live`, `events`, `campaigns`, `settings`, `userPacks`, `backups`, `sync`.
- Write after every command. Zustand store mirrors the active character for the UI.
- `schemaVersion` on every saved record. Migrations in `src/db/migrations/` as pure functions (vN → vN+1), unit-tested.
- **Export:** `{ app: 'omnidnd', schemaVersion, exportedAt, build, live, events, campaign }` (`ExportFileSchema`; the seed `data/characters/the-fool.json` uses the same shape, D49). **Import:** zod-validate → migrate → preview → save.
- **Auto backups (D108):** save the whole workspace before import/reset and after a completed long rest; keep the latest 10 on this device. Backup and command save together; Retry preserves the original recovery point.
- **Backup retention:** use local save order, independent of clock changes; unrelated, damaged or newer-format backup records stay untouched. Backups exclude themselves, user packs and unrelated settings; a backup browser and restore controls remain Phase 4.
- **Character Reset (D107):** refills tracked HP/resources and clears combat, conditions, effects and exhaustion without advancing time or replacing the build. Inventory, money, Inspiration, item charges and prior rest time stay; Undo restores the exact character, including expired resource-correction notes.
- **Stored rows (M3):** `{ id, schemaVersion, data }`; event rows also have `characterId` and a stable `order`, with compound primary key `[characterId + id]`. This keeps identical imported event IDs on different characters separate.
- **Atomic saves:** builds, live states, logs and campaigns save together; success feedback waits for completion. Startup validates records and remaining Undo history, preserving invalid data with a load error.
- **Window conflicts:** each save checks `workspaceRevision`; stale windows retain unsaved changes with an explicit conflict message. Retry never forces an overwrite.
- **Management history:** creation, duplication, deletion and import use a separate 500-event `managementEvents` log saved with character data. Undo warns before replacing subsequent character changes; exports retain the single-character shape.
- **Shared history order:** optional device-local `activityOrder` references order character and workspace changes for the shared Undo; exports and game events stay unchanged. Older untracked histories keep their own order, with character history first when the relative order is unknown.
- **Import collisions:** matching character IDs add a copy; conflicting campaign rules add a campaign. Copies retain values and choices but start fresh action histories, as explained in the import preview.
- **Reference bookmarks (D70):** device-wide `bookmarks` stores unique `{ id, title, url }` entries with HTTP(S) URLs, managed through commands and durable Undo. Missing legacy data reads as empty, malformed data causes a load error, and character exports omit bookmarks.
- **Device preferences (D71):** commands save and undo `automation` (default `assisted`) and `reducedMotion` (default `false`); invalid data fails loading without erasure. OS or saved motion preference enables reduced motion, and character exports omit device preferences.
- **Sync metadata (MA, D121):** `sync` holds one `{ kind: 'campaign' | 'character', entityId, changedAt, deleted, fingerprint }` row per entity, id `kind:entityId`. Saves stamp only entities whose content fingerprint changed; removed entities keep a deletion marker. Loading back-fills rows for older saves. After a sync each row also stores `baseRevision` (cloud revision it matches) and `syncedFingerprint` (content at that revision).
- **Cloud rows (MA):** `sync_entities` stores `{ kind, entity_id, revision, deleted, changed_at, schema_version, payload }` per account; the payload is the campaign, or `{ build, live, events }` for a character. A write succeeds only if the cloud still has the revision this device last saw; rows from another schema version are left alone.
- **Offline app:** production builds cache app code, reference data, fonts and icons after an online visit; character data and history remain in Dexie. Updates wait for all open app windows to close (D106).

```ts
// backups table: StoredRecord<WorkspaceBackup>; schemaVersion remains 1.
type WorkspaceBackup = {
  kind: 'omnidnd-workspace-backup';
  payloadVersion: 1;
  reason: 'before-import' | 'before-reset' | 'after-long-rest';
  capturedAt: string; // Real UTC time, for display only.
  order: number; // Monotonic device-local save order.
  source: ActivityReference;
  workspace: WorkspaceRows; // Campaigns, characters, histories, preferences and bookmarks.
};
```

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
  db/           Dexie, migrations/, sync metadata
  sync/         optional account sync: provider interface, planner, Supabase client
  ui/           components/ (design system), screens/, layout/
  theme/        tokens.css
data/
  srd/          generated by import script
  mechanics/    our machine-readable overlays, one file per kind
  content/      non-SRD own-words entries + summaries.json overlay (committed)
  private/      gitignored
  characters/   seed characters (the-fool.json)
scripts/        import-srd.ts, srd/map.ts (pure mappers, unit-tested)
supabase/       migrations/: account database schema and row-level security (MA)
tests/          e2e/ (Playwright)
docs/
```
