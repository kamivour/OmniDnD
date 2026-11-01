# Test Character — The Fool

Seed character (`data/characters/the-fool.json`) and acceptance test. Source: user's character record, 2026-11-01. Player name is intentionally left out (public repo).

## 1. Campaign #273

| Setting | Value |
|---|---|
| Ruleset | 5e 2014 |
| Sources | PHB, Xanathar's, Tasha's |
| Leveling | **Milestone** (no XP anywhere) |
| HP per level | **Rolled** |
| Ability scores | **Rolled** |

## 2. Build

| Field | Value |
|---|---|
| Race | Half-Elf (PHB) |
| Class | Bard 3, College of Lore |
| Background | Charlatan (PHB, not SRD → `data/content/`) |
| Alignment | Chaotic Neutral |
| Ability scores (final) | STR 11 · DEX 15 · CON 13 · INT 12 · WIS 12 · CHA 20 |
| Ability split | Base STR 11, DEX 14, CON 12, INT 12, WIS 12, CHA 18 + Half-Elf CHA +2, DEX +1, CON +1. Confirmed (DECISIONS D34). |
| HP entries | L1 max 8 · L2 rolled 4 · L3 rolled 4 → max HP **19**. Confirmed (DECISIONS D34). |
| Saves proficient | DEX, CHA |
| Skills (10) | Charlatan: Deception, Sleight of Hand · Bard: Acrobatics, Perception, Persuasion · Skill Versatility: Intimidation, Investigation · Lore: Insight, Performance, Stealth |
| Expertise | Deception, Sleight of Hand |
| Armor / weapons | Light armor · simple weapons, hand crossbow, longsword, rapier, shortsword |
| Tools | Flute, lute, drum, disguise kit, forgery kit |
| Languages | Common, Elvish, Celestial |
| Feats | None |
| Spells | Cantrips: Vicious Mockery, Minor Illusion · L1: Healing Word, Dissonant Whispers, Faerie Fire, Disguise Self · L2: Suggestion, Invisibility |
| Spell history | Tasha's Hideous Laughter replaced by Invisibility |

### Inventory

| Item | Qty | Notes |
|---|---|---|
| Rapier | 1 | Equipped |
| Dagger | 1 | Equipped |
| Leather armor | 1 | Equipped |
| Flute | 1 | Spellcasting focus |
| Backpack | 1 | Container |
| Bedroll | 1 | |
| Costume | 2 | |
| Candle | 5 | |
| Rations (1 day) | 6 | |
| Waterskin | 1 | Full |
| Fine clothes | 1 | |
| Disguise kit | 2 | 1: nobleman's elegant suit · 2: brown bear costume (looks very real) |
| Deck of marked cards | 1 | Charlatan con tool |
| Belt pouch | 1 | |
| Signet ring | 1 | From the dead nobleman (False Identity). Confirm it is carried. |

Currency: 49.5 gp total, denominations unknown → stored as 49 gp, 5 sp. Not owned: forgery kit (proficiency only), lute, drum.

### Journal seed

- **Appearance:** 22, male, Medium, 1.82 m, 84 kg, purple-orange eyes, long black hair (half-up, loose topknot, face-framing strands), marbled light-and-dark skin.
- **Personality:** Quiet and observant without the mask. "Sly, irrelevant and fearless once the Fool takes the stage."
- **Ideal:** "No magic or authority is absolute. Every trick has a flaw, and every flaw can be discovered."
- **Bond:** "I seek my missing shifu who vanished somewhere beyond the ocean."
- **Flaw:** "Curiousity killed the cat."
- **False Identity:** Veyne Lobien. The Fool met a dying nobleman on a sea expedition, promised to deliver his last words to his daughter, and took his signet ring and personal details.

## 3. Current live state (as of 2026-11-01)

Seed loads with this state. Tests start from a **fresh** state instead (§6).

| Tracker | Value |
|---|---|
| HP | 11 / 19, temp 0 |
| L1 slots | 0 / 4 |
| L2 slots | 2 / 2 |
| Bardic Inspiration | 3 / 5 |
| Hit Dice | 3 / 3. Confirmed (DECISIONS D36). |
| Conditions / concentration / effects | None |

## 4. Expected computed values (engine unit tests)

| Value | Expected | Why |
|---|---|---|
| Modifiers | STR +0, DEX +2, CON +1, INT +1, WIS +1, CHA +5 | floor((score − 10) / 2) |
| Proficiency bonus | +2 | Level 3 |
| Max HP | 19 | (8 + 1) + (4 + 1) + (4 + 1) |
| Max HP if CON became 14 | 22 | CON +2 applies to all 3 levels |
| Saves | STR +0, DEX +4, CON +1, INT +1, WIS +1, CHA +7 | JoAT does **not** apply to saves |
| Initiative | +3 | DEX +2 + JoAT +1 |
| Skills | Acrobatics +4, Animal Handling +2, Arcana +2, Athletics +1, **Deception +9**, History +2, Insight +3, Intimidation +7, Investigation +3, Medicine +2, Nature +2, Perception +3, Performance +7, Persuasion +7, Religion +2, **Sleight of Hand +6**, Stealth +4, Survival +2 | Non-proficient get JoAT +1 |
| Passive Perception / Investigation / Insight | 13 / 13 / 13 | 10 + skill |
| Spell save DC / attack | 15 / +7 | 8 + 2 + 5 / 2 + 5 |
| AC | 13 | Leather 11 + DEX 2 |
| Rapier | +4 to hit, 1d8+2 piercing | Finesse uses DEX |
| Dagger | +4 to hit, 1d4+2 piercing, thrown 20/60 | Finesse, light |
| Hit Dice | 3d8 | |
| Speed / senses | 30 ft / Darkvision 60 ft | |
| Spell slots | L1: 4, L2: 2 | Bard 3 |
| Known | 2 cantrips, 6 spells | Bard 3 |
| Bardic Inspiration | 5 uses, d6, long rest | CHA mod; short rest only from Bard 5 |
| Song of Rest | +1d6 | Bard 2+ |
| Carrying capacity | 165 lb | STR × 15 |
| XP field | Hidden | Campaign uses milestone |
| Level up to 4 (rolled, enter 5) | Max HP 25, Hit Dice 4d8 | Adds one entry: 5 + CON 1. Old entries unchanged. |

## 5. Spells and features (house-style summaries)

**Vicious Mockery** — Cantrip Enchantment · A · 60 ft · WIS save · Instant
V
Fail: 1d4 psychic and disadvantage on its next attack roll before the end of its next turn. Success: nothing.
Scaling: 2d4 at character level 5, 3d4 at 11, 4d4 at 17.

**Minor Illusion** — Cantrip Illusion · A · 30 ft · 1 min
S, M
Create one sound or one image of an object (fits in a 5-ft cube). Image has no sound/light/smell; physical touch reveals it. Investigation vs DC 15 to discern.

**Healing Word** — L1 Evocation · BA · 60 ft · Instant
V
One creature you can see regains 1d4 + 5 HP. No effect on undead or constructs.
Upcast: +1d4 per slot level above 1.

**Dissonant Whispers** — L1 Enchantment · A · 60 ft · WIS save · Instant
V
Fail: 3d6 psychic; target must use its reaction (if available) to move its speed away from you. Success: half damage, no movement.
Moving away can provoke opportunity attacks. Upcast: +1d6 per slot level above 1.

**Faerie Fire** — L1 Evocation · A · 60 ft · DEX save · Conc, 1 min
V
20-ft cube. Fail: outlined in light (dim light 10 ft). Attacks vs it have advantage if the attacker can see it; it can't benefit from invisible.

**Disguise Self** — L1 Illusion · A · Self · 1 h
V, S
Change your look, clothes, and gear; ±1 ft height. Body type stays. Touch reveals it. Investigation vs DC 15 to discern.

**Suggestion** — L2 Enchantment · A · 30 ft · WIS save · Conc, 8 h
V, M
Target that hears and understands you follows a reasonable-sounding course of action. Fail: it obeys until done or the spell ends. Immune if it can't be charmed. Obviously harmful requests end the spell.

**Invisibility** — L2 Illusion · A · Touch · Conc, 1 h
V, S, M
Target and what it carries become invisible. Ends for a target when it attacks or casts a spell.
Upcast: +1 target per slot level above 2.

| Feature | Activation · Uses · Recharge | Effect |
|---|---|---|
| Bardic Inspiration | BA · 5 (CHA) · Long | Creature within 60 ft that can hear you gets a d6. Within 10 min it adds it to one attack, check, or save. |
| Jack of All Trades | Passive | +1 (half proficiency) to ability checks without proficiency, incl. initiative. |
| Song of Rest | Short rest | You and allies who spend Hit Dice regain +1d6 HP. |
| Expertise | Passive | Double proficiency: Deception, Sleight of Hand. |
| Cutting Words | R · uses Bardic Inspiration | Creature within 60 ft you can see makes attack, check, or damage roll: subtract your d6. Use after the roll, before the result. Immune if it can't hear you or can't be charmed. |
| Lore Bonus Proficiencies | Passive | Insight, Performance, Stealth. |
| Darkvision | Passive | See in dim light within 60 ft as bright; darkness as dim (no color). |
| Fey Ancestry | Passive | Advantage on saves vs charmed; magic can't put you to sleep. |
| Skill Versatility | Passive | Intimidation, Investigation. |
| False Identity | Passive | Second identity (Veyne Lobien) with documents and contacts; can forge documents from samples. |

## 6. Acceptance scenario

Start: **fresh** state — full resources, HP 19/19, no previous long rest, game clock Day 1 08:00. Check HUD, Dashboard, Spellbook, Combat, and Exploration show identical values after **every** step. Reload the page after steps 3, 8, and 12; state must persist.

1. **Start combat**, start your turn. (No initiative: the DM runs the order, D42.)
2. **Cast Faerie Fire (L1).** → L1 slots 4 → 3. Action used. Concentration = Faerie Fire, 1 min (ends in round 11). No effect on you: Faerie Fire targets enemies (D41).
3. End turn. Start next turn. **Cast Invisibility (L2) on an ally.** → L2 2 → 1. Concentration = Invisibility; Faerie Fire concentration ended. Log shows both casts.
4. End turn. On an enemy's turn, **use Cutting Words.** → Bardic Inspiration 5 → 4. Reaction used.
5. **Try a second reaction** (Opportunity Attack) before your next turn. → Warning "Reaction already used". Cancel leaves state unchanged. "Do anyway" logs an override.
6. **Start your turn.** → Reaction available again.
7. **Take 12 damage while concentrating.** → HP 19 → 7. CON save prompt DC 10. Choose Pass → Invisibility stays.
8. **Bonus-action spell rule:** cast Healing Word (BA) on self, enter 1. → HP 7 → 13 (1 + 5); L1 slots 3 → 2. Then try Dissonant Whispers → warning. Then Vicious Mockery → allowed.
9. **End combat.** Advance clock 1 h. → Invisibility expires (logged, concentration cleared). **Short Rest:** spend 1 Hit Die, enter 2 → +3 (2 + CON 1). Song of Rest, enter 2 → +2. HP 13 → 18. Hit Dice 2 / 3. Bardic Inspiration stays 4. Slots stay L1 2, L2 1.
10. **Long Rest.** Preview: HP 18 → 19, L1 2 → 4, L2 1 → 2, Bardic Inspiration 4 → 5, Hit Dice 2 → 3 of 3. Apply. Clock +8 h.
11. **Long Rest again immediately.** → Warning "Less than 24 h since last long rest".
12. **Hit Dice cap:** take 15 damage, short rest spending all 3 Hit Dice, advance clock to ≥ 24 h after last long rest, long rest. → Only 1 Hit Die recovered (1 / 3 available).
13. **Undo** the last long rest. → Exact previous state (HP, slots, Hit Dice, clock).
14. **Manual correction:** set L1 slots to 2 used with `−`. → Logged. Undo restores. No other value changes.
15. **Damage DC check (unit test only):** 22 damage while concentrating → DC 11. 8 damage → DC 10.
16. **Seed state check:** load the seed (not fresh) → HUD shows HP 11/19, L1 0/4, L2 2/2, BI 3/5. Casting Healing Word offers only the L2 slot (upcast 2d4 + 5).
