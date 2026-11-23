# M46 combat design

Open the [interactive mockup](mockups/combat-hit.html) or compare the [375 px preview](mockups/combat-hit-phone.png) and the [1440 px preview](mockups/combat-hit-desktop.png). M46 waits for owner review. The mockup uses a sample character and stores changes only until you close or reload it.

## Log a hit

**Took a hit** opens from Home or Combat. Enter one or more amounts and damage types. Critical is a record of the hit for the existing 0 HP rules. The amounts already include any dice you rolled for the critical. Choose a known source or add a note if useful. Untyped damage stays available for the existing quick damage workflow.

The preview shows the original amounts, the effect of each defense, temporary HP consumed and the resulting HP. Combine parts of the same damage type before rounding. Apply any verified 2014 defenses before temporary HP. Leave situational defenses with an explicit table choice when their requirements cannot be derived. [2014 Basic Rules on damage and healing](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat#DamageandHealing)

Logging applies the whole hit once. The entry collapses to a summary and focus moves to the follow-ups. Reuse the existing log and its single Undo control. Each confirmed follow-up has its own log entry. The first logged hit or initiative roll opens Combat with turn tracking available.

## Follow-ups and effects

- **Concentration.** Show the DC from damage after defenses, including damage absorbed by temporary HP. Offer Pass and Fail only while the spell still needs a save. A failed save ends the tracked concentration through its own command.
- **0 HP.** Preview existing death-save failures and instant death using D151 and D152. A death save taken later remains a player-entered result.
- **Other effects.** A source the app recognizes can suggest an effect. A free-text source can be paired with a condition chosen by the player. Record effects only after confirmation.
- **Effects on me.** Show what each confirmed effect changes and when it ends. The player can end an effect early. Timed effects use the existing game clock.

## Build and verify after review

| Task | Acceptance |
|---|---|
| Typed hit command | One logged and undoable update. Verify mixed types, immunity, vulnerability, resistance, temporary HP, critical and 0 HP cases. |
| Follow-up queue | Preserve the hit and the DC across reload. Confirm or dismiss suggestions independently. |
| Effects panel | Match the Sheet and existing condition state. Expiry, manual ending and Undo update each view. |
| Combat entry | Log a hit or initiative outside Combat, then open the same turn controls available today. |
| Browser gate | Verify a complete hit and Undo sequence at 375 px and 1440 px. Review text, touch targets and keyboard focus. |
