# Stats, statuses and gear in the existing games

What the rcjlabs games do with actors' numbers, so the stats kit (M3.4, D41) covers them. Read in the repos' files, nothing run, on 2026-10-18. Paths are each repo's own.

## The games

- **space-wrecked.** A job's numbers are data (`data/jobs.json`: the marine's hp 10, aim 70, defense 0, mobility 4, armor 1). Traits add flat points (`data/traits.json`: `"effects": { "aim": 10, "defense": -5 }`), summed by `traitBonus`. A crew member stores only its current hp; the maximum is worked out when needed (`max(1, job.hp + traitBonus.hp)`), and current is kept to it when a fight starts. The med bay heals up to the maximum each jump. Fight statuses: `mark` (aim, 2 turns) and `suppressed` are replaced when applied again; `asleep` lasts a turn; a downed crew member bleeds out over 3 turns. No gear: the weapon comes with the job. The odds are shown as their parts (`hitParts: [{why, value}]`), and the number shown is the number rolled.
- **dirtbag.** Five skills (power, fingers, endurance, technique, head), 4 to 13 at the start. Pools are 0 to 100, kept within by `clamp100`: energy, skin, fed, supplies, psyche, restored by sleep and drained by the day (`dials.ts`). One injury at a time, `{kind, tier, until: day}`, lasting 2 to 18 days by tier; scars stay. Conditions multiply into one factor. Gear is a count or a wear level per thing, with no slots, its effects in code. Shown in words, not numbers.
- **ludus.** Six stats, 8 to 95, with a ceiling a scar lowers. Morale and fatigue are 0 to 100 pools. An injury takes a flat penalty from every stat for some weeks. Four gear slots (weapon, offhand, helm, armor); a piece adds fractions (`atk .05`), scaled by its wear, and halved outside the gladiator's style; the kit's totals are kept within bounds. Equipping counts a piece as worn against those owned: it stays in the stock. The UI says the kit's total and "Ill-suited to his style".
- **wasteland-protocol.** Stats are written onto the character sheet by matched apply and remove pairs (`c.maxHp += 15; c.hp += 15`, then back). Statuses are turn counters, set to the longer of old and new (`Math.max`). At most 3 scars. Two gear slots; equipping moves the item out of the stash and puts the old one back; a scar can block a slot.
- **spliceworld.** Stats are worked out from a frame, its parts and traits, with rows that explain them ("12 from frame + parts, minus 2 for hauling 100 mass"). Six or seven part sockets, each part granting stats and a move. Statuses stack to a cap (venom 5, bleed 4), or are replaced (regen), or the strongest wins (thorns). An injury lasts hours of real time, and a new one never shortens the old.
- **landnam.** Four stats, about 1 to 6. Health's maximum is `8 + might × 2`, stored; when might grows, maximum and current both rise by 2. Injuries are a list, each with a stat penalty and the days it takes to heal, so they stack. Healing comes at camp, if fed.
- **2060td.** Every modifier multiplies: rank, officer, research, the day's conditions. An upgrade keeps the damage taken: `hp += next.maxHp − maxHp`.
- **project-ascent.** Five stats worked out from contributions with caps, so 100 is the most by construction; a debuff applies after. The body page lists "Base 10", each contribution, then the debuff.
- **sandbagged.** Pump, skin, psyche and flow are small pools. Three gear slots for a run; a new piece replaces the one in its slot. Effects are flat deltas.
- **afterglass, rule-or-drool, chooser-of-the-dead, football-manager-simulator.** Traits and conditions that multiply; meters of 0 to 100 that end a run at either edge; injuries counted in weeks; sick and well counters by night.

## What most of them share

1. **The maximum is worked out, the current amount stored.** space-wrecked, spliceworld and project-ascent work maximums out when read.
2. **A maximum that rises raises the current amount by the same** (wasteland, landnam, 2060td): the damage taken is kept, as D41 has it. A maximum that falls keeps the current amount within it. None scales the current amount by its share.
3. **Pools of 0 to 100,** or small whole numbers in the card games.
4. **Healing at rest points** (sleep, a jump, camp, a week), not every tick.
5. **Durations are whole numbers counted down** at turns, days or weeks. What lasts for good is a list of its own (scars) or a large number.
6. **A status applied again takes the longer duration,** the most common rule. Next: stacks up to a cap. Then: every factor multiplied.
7. **One item a slot,** a new one taking the old one's place (ludus 4, wasteland 2, sandbagged 3, spliceworld 6 or 7).
8. **A number shown as its parts,** which add up to the number the game uses.

## Where they differ

- **Adding or multiplying.** Small whole-number stats add flat points (space-wrecked, landnam, sandbagged). The sims multiply (ludus, 2060td, afterglass, dirtbag). spliceworld and wasteland mix both.
- **Written onto the sheet, or worked out when read.** wasteland writes and has to undo exactly; space-wrecked and ludus work it out.
- **Time:** turns, days, weeks, or real time.
- **One injury or a list.** dirtbag, ludus and spliceworld keep one; landnam keeps a list.
- **Gear and the stock.** wasteland moves the item out of the stash; ludus counts it as worn but keeps it in stock; sandbagged's gear lasts a run.
- **Who may wear what.** wasteland locks a mod to a class; ludus only takes points off for the wrong style. Nobody blocks a slot for a two-handed weapon; ludus takes points off instead.

## Open questions

1. **Effects over time** (venom, bleed, regeneration) recur in the fight games. Sheets react to events but don't go through every actor, so a status that hurts each turn needs either a kit effect that does or a script.
2. **Who may wear what** needs a condition about "the actor wearing it", which conditions can't name yet: their facts take fixed arguments.
