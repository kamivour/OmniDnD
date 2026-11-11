# OmniDnD — Design

## 1. Direction: Minimal Dark HUD

- Flat dark surfaces. Color carries meaning only (accent, magic, danger, heal).
- Small monochrome icons for spells, items, features, conditions.
- Game feel comes from crisp hover states and tight previews, **not** effects.
- No glows, textures, particles, parallax, or page transitions.
- Information first: no decorative art that hides data.

Secondary themes later (Phase 4): Classic Parchment, Light. All colors are CSS variables, so a theme is one variable set.

## 2. Tokens

Defined as CSS variables on `:root`; Tailwind reads them (`bg-surface`, `text-accent`, ...). Components never use raw hex.

| Token | Dark value | Use |
|---|---|---|
| `bg` | `#101521` | App background |
| `surface` | `#1A2332` | Cards, panels |
| `surface-2` | `#222D40` | Hover, raised, popovers |
| `border` | `#2C3850` | Dividers, card borders |
| `text` | `#E6E8EE` | Primary text |
| `text-muted` | `#8B95A8` | Labels, secondary text, icons at rest |
| `accent` | `#CFAE72` | Primary buttons, selection, focus ring |
| `magic` | `#64CDD2` | Spell slots, concentration, spell effects |
| `danger` | `#DF7580` | Damage, low HP, destructive actions |
| `heal` | `#7FC08F` | Healing, success |
| `temp` | `#8FA8E0` | Temp HP |
| `warn` | `#E0A458` | Warnings, overrides |

**Spell type colours (D39).** Used only for spell rows, type chips, and the type filter. Row box = 4 px left border + 8 % tint of the type colour; the meta line starts with the type name in the type colour, so colour is never the only signal.

| Token | Dark value | Type |
|---|---|---|
| `type-damage` | `#E5767F` | Damage |
| `type-control` | `#B79AF0` | Control |
| `type-healing` | `#7FC08F` | Healing |
| `type-buff` | `#7FB2EA` | Buff |
| `type-debuff` | `#E0A458` | Debuff |
| `type-utility` | `#A3ADBF` | Utility |

- Radius: 8 px cards, 6 px buttons/chips, full for pips.
- Spacing: 4 px grid.
- Shadow: popovers and sheets only (one soft shadow). No other shadows.
- Contrast: text ≥ 4.5:1 on its surface. Check `text-muted` on `surface-2`.

## 3. Typography

- **Inter** for everything: body, UI, numbers (`font-variant-numeric: tabular-nums`).
- **Cinzel** for the character name and screen titles only.
- Sizes: 12 / 14 / 16 / 20 / 28 px. HP number in Combat: 40 px.
- Self-host fonts (offline PWA).
- Field labels are 14 px semibold in full text colour. Section headings (`SectionLabel`) are 14 px bold uppercase. Muted text is for hints only.
- Cautions use `Caution`: warn colour, a triangle icon and medium weight. Blocking errors use danger colour with the octagon icon.

## 4. Icons

- **UI chrome:** Lucide (ISC license).
- **Content (spells, items, features, conditions):** [game-icons.net](https://game-icons.net) SVGs, CC BY 3.0 → credit on Reference → Credits page.
- Monochrome, `currentColor`. 20 px in lists, 40 px in detail panels. Muted at rest, `accent` on hover/selection.
- Each data entry has optional `iconId`. Missing → fallback by spell school / item category / feature type.
- Subclass choices (creation, level-up, To do) are separate cards: 40 px icon (`subclass.<class>.<name>`), name, difficulty and a one-line pitch; "Decide later" is the last card.
- Bundle only used icons as local SVG files. No runtime fetching.

## 5. Motion budget

Only these animations exist. Anything else needs a DECISIONS.md entry.

| Element | Motion | Duration |
|---|---|---|
| Hoverable card / button | lift 2 px + border → `accent` | 120 ms |
| Preview popover | fade + scale 0.97 → 1 | 120 ms (open delay 250 ms) |
| Bottom sheet | slide up | 180 ms |
| Slot pip / resource pip | fill ↔ empty | 150 ms |
| HP bar | width change | 200 ms |
| Used action / depleted item marker | dim to 40 % opacity | 120 ms |

`prefers-reduced-motion` or the Settings toggle sets all durations to 0.

## 6. Interaction patterns

- **Preview vs Pin.** Hover (desktop) / tap (mobile) / focus (keyboard) → preview. Click → pin full detail in the right panel (desktop) or full-height sheet (mobile).
- **Popovers never cover the row's own action button.** Use Floating UI flip/shift. Max width 320 px.
- **Breakdown tooltips** on every computed number.
- **Toasts** after commands show short feedback for 5 s; character Undo stays in the shared status row. Hub management feedback may offer Undo.
- **States** (never color alone; always add icon or text):
  - available — normal
  - used / depleted — empty or dimmed pips and visible status text; enabled labels and focus rings remain opaque
  - concentrating — `magic` left border + "C" chip
  - active effect — `magic` chip with timer
  - warning / override — `warn` color + ✎ or ⚠ icon
- **Touch:** targets ≥ 44 px. Main combat buttons ≥ 56 px tall on mobile.
- **Keyboard:** everything focusable, 2 px `accent` focus ring, Enter/Space activate, Esc closes.

## 7. Layout grid

| Breakpoint | Layout |
|---|---|
| ≥ 1024 px | Sidebar 220 px (collapsible to 64 px) · main · right detail panel 360 px. HUD top bar. |
| 640–1023 px | Icon sidebar 64 px · main · detail panel as overlay drawer. |
| < 640 px | HUD header (≤ 2 rows) · main · bottom nav (5 items). Sheets instead of popovers. |

## 8. Key frames

Build these first as static screens with fixture data (milestone M1). They set the visual language for every other screen. User signs off before wiring logic.

### Hub frames (no HUD)

The app opens here (D38). Narrow centered column, no HUD, no character nav.

```
CAMPAIGNS                                   [+ New campaign]
┌──────────────────────────────────────────────────────────┐
│ Campaign #273                              [Settings]    │
│ Milestone · HP rolled · Abilities rolled                 │
│ ◇ The Fool   Half-Elf · Bard 3 (Lore)      HP 15/19  ›   │
│ [+ New character]                                        │
└──────────────────────────────────────────────────────────┘
```

- **Campaign settings / New campaign:** one form; radio groups for Leveling, HP per level, Ability scores; Sources list (PHB locked). Phase 2 options appear disabled with their milestone.
- **New character:** Basics grid (2 columns ≥ 640 px) · Ability table (Base / Bonus / Score / Mod) · HP table (Level / Hit die / CON / HP, footer = Max HP + Hit Dice). Computed cells show `—` until their inputs are complete.

### Frame A — Dashboard (desktop)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ◆ The Fool · Bard 3 (Lore)  HP ▓▓▓▓▓▓▓░ 15/19  AC 13  Init +3  Spd 30   │
│   L1 ●●●○  L2 ●●  BI ●●●●●   [C Faerie Fire ✕]  [Poisoned]  [Short][Long] │
├──────────┬───────────────────────────────────────────┬────────────────────┤
│ Home     │ SPELL SLOTS               CONCENTRATION   │ DETAIL (pinned)    │
│ Sheet    │ Level 1  [−] ●●●○ 3/4 [+] Faerie Fire 7rd✕│                    │
│ Spells   │ Level 2  [−] ●●   2/2 [+] EFFECTS ON YOU  │ Level 1 spell slots│
│ Combat   │ FEATURES & TRAITS         None            │ 3 of 4 left        │
│ Explore  │ Bardic I.[−] ●●●●○4/5 [+] CONDITIONS      │ Each one casts ... │
│ ──────── │ HIT DICE (D8)             Poisoned  [+ add]│                    │
│ Inventory│ Hit Dice [−] ●●●  3/3 [+]                 │                    │
│ Features │ QUICK ACCESS                              │                    │
│ Journal  │ [◇ V.Mockery] [◇ Healing W] [◇ Cutting W] │                    │
│ Reference│ STR +0  DEX +2  CON +1  INT +1  WIS +1  CHA +5                 │
│ Settings │ Passive Perc 13 · Inv 13 · Ins 13         │                    │
│ Campaigns│ RECENT LOG  Cast Faerie Fire (L1)        │                    │
└──────────┴───────────────────────────────────────────┴────────────────────┘
```

- Resource rows (D37): label (dotted underline = has a description) · `PipStepper`. Pips never act on tap; only − and + change the count.
- Label hover → tooltip card; click → pins it in DETAIL. Mobile: tap → bottom sheet.

### Frame B — Spellbook (desktop) + preview

```
Search [____________]  [Level ▾] [A] [BA] [R]  [Conc] [Ritual] [Castable now]
Type: [Damage] [Control] [Healing] [Buff] [Debuff] [Utility]   [Clear]

CANTRIPS
▌◇ Vicious Mockery     Damage · A 60 ft  WIS       [Cast]
▌◇ Minor Illusion      Utility · A 30 ft  1 min    [Cast]

LEVEL 1                         [−] ●●●○ 3/4 [+]
▌◇ Healing Word        Healing · BA 60 ft          [Cast ▾]
▌◇ Dissonant Whispers  Damage · A 60 ft  WIS       [Cast ▾]
┃◇ Faerie Fire         Debuff · A 60 ft DEX C [Active] [Cast ▾] ┐ hover
▌◇ Disguise Self       Utility · A Self  1 h       [Cast ▾] │
                                                            ▼
                        ┌──────────────────────────────────────┐
                        │ ◇ Faerie Fire            PHB         │
                        │ L1 Evocation · A · 60 ft · DEX save  │
                        │ Conc, 1 min · V                      │
                        │ 20-ft cube. Fail: outlined in light. │
                        │ Attacks vs target have advantage if  │
                        │ attacker sees it; no invisibility.   │
                        │ Click to pin · D&D Beyond ↗          │
                        └──────────────────────────────────────┘
```

`▌` = left border + tint in the main type colour. `┃` = concentrating spell: full `magic` outline + "Active" badge (D43). The preview shows all type tags as small outlined chips.

Mobile: same list full width; tap row → bottom sheet with the preview + big Cast button + slot-level picker.

### Frame C — Combat (mobile, 375 px; design this first)

```
┌─────────────────────────────────┐
│ The Fool  HP 15/19 ▓▓▓▓▓░  AC 13│
│ L1 ●●●○ L2 ●○ BI ●●●●○  [C FF ✕]│
├─────────────────────────────────┤
│ Round 3 · Your turn  [End Turn] │
│ Start Turn next round restores… │
│ [Action ○] [Bonus ●] [React ●]  │
│ Move 15 / 30 ft      [−5] [+5]  │
├─────────────────────────────────┤
│ [ − Damage ] [ + Heal ] [ Temp ]│
├─────────────────────────────────┤
│ Actions│Spells│Bonus│React│Items│
│ ◇ Rapier  +4 · 1d8+2 P [Attack] │
│ ◇ Dagger  +4 · 1d4+2 P [Attack] │
│ ◇ Vicious Mockery WIS 15 [Cast] │
│ Dash  Disengage  Dodge  Help    │
│ Hide  Ready  Search  Use Object │
├─────────────────────────────────┤
│ Concentration: Faerie Fire 7 rd │
│ Effects on you: None            │
│ Full log + Undo in shared header│
├─────────────────────────────────┤
│ Home  Combat  Spells  Inv  More │
└─────────────────────────────────┘
```

Combat desktop (D42): no turn order. Two columns at `lg`: center = turn header, economy, HP, action tabs · right aside "Status and log" = concentration, effects on you, full log. The aside widens at `xl`.

## 9. Core components (build once, reuse everywhere)

`HudBar`, `PipRow` (slots/uses, display only), `PipStepper` (`[−] pips left/max [+]`; the only control that spends or restores a pool), `ResourceCard` (description card for a pool: left/max + short lines), `StatChip` (with breakdown tooltip), `HpControl` (damage/heal/temp + number pad), `EconomyBar`, `SpellRow`, `FeatureRow`, `ItemRow`, `PreviewPopover` / `PreviewSheet` (one API, picks by breakpoint), `DetailPanel`, `ConfirmWarn` (Cancel / Do anyway), `Toast` (with Undo), `LogList`, `EffectChip`, `ConditionChip`, `Icon` (game-icons + fallback).
