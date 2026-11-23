# M47 — Party character viewer

Give a campaign member’s character the same visual language as an owned character sheet. The reader should answer two questions quickly at the table. What does this character have left, and what does this spell, item or companion do?

M47 expands the original five basic lists into a compact reader with shared sheet components and clickable details. The reader keeps the existing separation between party snapshots and playable characters. [Current reader](../src/ui/party/PartyCharacterView.tsx), [character frame](../src/ui/layout/AppFrame.tsx)

## Layout and navigation

| Area | 375 px phone | 1440 px desktop |
|---|---|---|
| Header | Back to party, then portrait, character name, class and level, and a small **View only** label beside the owner’s name. HP, AC and active conditions sit directly below. | Same identity in one compact header. Include passive Perception and concentration when relevant. Keep **Duplicate to play** as a secondary action. |
| Sections | One scrollable row with **Sheet**, **Spells**, **Inventory**, **Features** and **Companions**. The selected section stays visible as the row scrolls. | The same sections in a slim row. Use the space for lists and details, keeping the header familiar. |
| Entry details | Tap anywhere on a row to open a scrollable sheet with a meaningful title and a visible close button. | Click a row to pin the description on the right. The list keeps its position and filters. Tablet uses the existing overlay pattern. |

Example of the phone Spells section before opening a description

```text
‹ Party
Mira Vale · Paladin 4 / Warlock 2
Ana · View only      HP 24/38 · AC 17

Sheet  [Spells]  Inventory  Features  →

Spell slots       L1  1/3
Pact Magic        L1  2/2

Search spells
Cantrips
  Eldritch Blast · 1 action · 120 ft  ›
Level 1
  Bless · Prepared · Concentrating    ›
```

Give rows an icon, an informative summary and a chevron or equivalent visual cue. Keep 44 px touch targets and visible keyboard focus. Enter opens the selected entry and Escape closes it. Closing returns focus to the opener or, if a sync update removed it, to the section heading. Make a section linkable using `?view=spells`, for example. Existing character links remain valid. Links to owned-character gameplay routes resolve to an appropriate reader section or Sheet for other members. Register the reader sections with Find and keep results scoped to the active character and campaign.

## What each section shows

### Sheet

Start with an at-a-glance summary. Show HP and temporary HP, AC, speed, initiative, proficiency, conditions, concentration and passives. Follow with abilities and saves, then skills and proficiencies. Put longer groups such as an untrained skill list behind a disclosure on phone. Use the existing calculated Sheet for every value. The header is a compact summary, so expanded sections should avoid repeating it verbatim.

### Spells

Put spell slots above the list. Show remaining out of maximum by level, including `0/4` for a depleted pool. Show Pact Magic separately with its slot level and remaining count. Use the same calculations as the owned character so temporary slots and tracked corrections agree. Cantrips and feature-granted casts have their own labels. Free uses and Mystic Arcanum appear separately when supported by the character’s data.

Group rows by level. Each row shows the spell’s name, casting time, range and useful state such as **Prepared**, **Always prepared**, **Concentrating** or **In spellbook**. Keep an unprepared Wizard spell readable and label spell sources when the same spell comes from multiple classes. Search by name and optionally filter by class or source when there are multiple. A noncaster gets a short empty state. A character with an innate spell and zero ordinary slots still shows that spell.

Open a spell to see its description, components, range, duration, save or attack, source and upcast notes where available. DC and attack use the character’s applicable casting source. Start with `spellbookModel` and `SpellCard`. Reuse the engine’s existing spell selection and resource information where the display adapter lacks a label. [Spellbook model](../src/ui/spells/spellbook-model.ts), [read-only spell card](../src/ui/components/cards.tsx)

### Inventory

Show **Equipped** first as a quick filter, then list **Carried** gear and expandable containers. Keep item counts, units, equipped and attuned labels, and charges where recorded. Search by name across containers. Results retain their path, such as `Bag of Holding › Potion of Healing`. A zero-quantity entry can still be inspected under **Depleted**. Keep two copies of the same item distinct by instance so each opens the right charges, quantity and container location.

Open any item to see its description and applicable facts. Examples include weapon damage, type, range and property explanations, armor AC, attunement, remaining charges and container capacity. Resolve custom equipment and replicas from the shared character’s registry. Reuse the inventory grouping model and the Compendium’s item facts. Personal annotations and the coin total stay off the reader in the first release. [Inventory model](../src/ui/inventory/inventory-model.ts), [Compendium detail](../src/ui/compendium/CompendiumDetail.tsx)

### Features

Group traits by source and use the same row and detail pattern. Show the name, source and remaining uses when tracked. The detail explains what it does, what it costs and when it recharges. A passive feature simply opens its description. Use composite identity when the same feature appears through more than one source.

### Companions

Show active companions first as compact cards with name, form, status, current and maximum HP, AC, and movement. A secondary group contains dismissed and destroyed companions from the shared record. Tapping a companion opens its attacks, traits, senses and conditions where recorded, plus limited uses, command cost and expiry if applicable. Resolve scaled numbers from the owner’s Sheet. Read summon forms, cannon types and expiry from the shared state and owner’s game clock. Use the same details for a familiar, Steel Defender, Homunculus or custom companion. [Companion calculations](../src/engine/calc/companions.ts), [companion forms](../src/engine/calc/companion-profiles.ts)

## Ownership and sync

- Keep the `partyOwner` branch in `AppFrame` and the existing campaign membership gate. Players and DMs get the same reader permissions. Reuse presentational cards and read-only state adapters. Put any editor or command controls in the owned screen that supplies them.
- Keep the reader’s interactions to navigating sections, searching, opening descriptions and the existing **Duplicate to play** action. Duplication creates a separate owned character through the existing flow. The inspected character comes from the same shared snapshot as before. Private journals and command history stay with the owner. [Shared snapshot](../src/sync/party.ts)
- Read the viewer from the current cached record. If the owner updates a spell slot, item or companion, the open section and its dialog refresh with the new values. Keep detail selection by ID and handle entries removed by sync with a short message and a predictable close action. Keep browse controls usable offline with an **Offline · cached copy** label. Campaign removal takes effect when the device learns it on sync.
- Start with the current shared fields, permissions and local cache. The first release fits the existing schema and transport. Any future field-level sharing preference belongs to a separate task.

## Build sequence

| Task | Deliverable | Acceptance |
|---|---|---|
| T1 — Reader frame and Sheet | Compact header, section navigation and read-only detail container | Party links and direct character routes reach the reader. The owned character still opens its playable screen. View only and Back to party remain easy to find. |
| T2 — Spells and resources | Shared slot counts, source labels and clickable spell descriptions | Mixed Paladin/Warlock slots remain separate. A depleted pool, prepared spell, always-prepared spell, unprepared spellbook entry and free cast all read correctly. |
| T3 — Inventory | Search, equipped filter, container groups and full item detail | Open a weapon, two copies with different charges, a nested bag item and a custom item. Each detail matches its own inventory instance. |
| T4 — Features and companions | Source-grouped features plus companion cards and stat blocks | A feature’s remaining uses and a companion’s scaled stats, status and action cost match the owner’s view. |
| T5 — Reader gate | Responsive, keyboard, offline and permissions coverage | At 375 px and 1440 px, browse every section and confirm the cached record does not change. Owner updates refresh an open detail. The reader still works after offline reload. |

Extend the existing Playwright reader scenario. Use The Fool’s recorded slots as the simple fixture and add a Warlock multiclass, duplicate inventory items and a scaled companion to cover the edge cases. Test remote removal, Back to party, deep links, owner and DM boundaries, and the existing duplicate flow. Use the available shared-sync fixtures for automation and the disposable two-account setup for the live check. [Existing reader test](../tests/e2e/party-view-only.spec.ts)
