# Choice events in the existing games

What the rcjlabs games do with choice events: an event with a few choices, each with a cost, odds and outcomes, some of whose consequences land later. This is so M3.7 covers them. Read in the repos' files on 2026-10-19, with nothing run; landnam-ue and mythos-clash were left out. Paths are each repo's own. Where a line infers rather than reports what the code says, it says so.

## The games

- **space-wrecked** (`data/events.json`, `src/sim/events.js`, `tools/validate-events.js`). The closest to the engine.
  - **Records:** 29 events as JSON, 7 of them quest steps. An event has an id, a kind, a title, text and 1 to 4 choices. A choice has a label, `needs` and 1 to 4 outcomes, each with a chance, text and effects. The validator caps titles and labels at 24 characters, text at 240, and outcome text at 160.
  - **Costs:** `needs` (credits, supplies, parts, berth) only gates, so the price is written again as a negative effect in every outcome. The validator keeps the two in step, and asks that every event has a choice that needs nothing, "so the ship is never stuck". A choice the crew can't pay for is shown locked with its reason ("Needs 3 supplies."), from the same function choosing checks.
  - **Odds:** whole-number chances that add up to 100. One roll from 0 to 99 is made on choosing, on the campaign's saved stream, and only for a choice with more than one outcome. The first tap shows "70%: +10 credits, a salvaged part.", the second chooses, and the result says "Rolled 24: the 70% came up."
  - **Picking:** each node gets its event when the sector is made, from a shuffled deck per node kind, so nothing repeats in a sector until the kind runs out. An open event blocks every jump until it is settled.
  - **Chains and delays:** quests start from a choice and name events with `done` and `cold` choices. Nothing is queued: heat builds and drives raids that land "raidWarning days later".
- **dirtbag** (`content/knocks.ts`, `road.ts`, `scene.ts`, `epics.ts`). Typed data with no closures.
  - **Records:** a knock is a title, a situation and options, each with a label, an outcome line and effects. Text runs 20 to 80 words, filled with `{ who }`.
  - **Costs:** a negative effect (`cash: -12`), or minutes on a roadside stop.
    - **Not checked:** knocks don't check money; cash can go below 0 ("It goes on the card").
    - **Shown locked:** holiday options, with the reason.
    - **Hidden:** favours ("a yes you can't afford isn't offered").
  - **Odds:** one fixed outcome an option. Walk-outs run in stages, each option adding risk, and end on a threshold of the total, with the starting risk read from state (late, no headlamp, rain, low energy).
  - **Picking:** seeded per night or drive. A knock's odds are 0.11 times a multiplier for where you're parked.
    - **Cooldowns:** in days: 4 for a knock, 5 for a hitchhiker, 3 for a stop, 10 for a walk-out.
    - **Limits:** at most one encounter a day, and the last 3 knocks are passed over.
    - **Weighting:** the hitchhikers met least are 3 times likelier.
  - **Delays:**
    - **Knocks:** a knock you helped comes back 14 to 28 days later (seeded), once ever, saved as `{ id, opt, day, done }`.
    - **Calls:** a faction call comes back as an echo 30 days later, keyed to the answer given.
    - **Not told:** nothing on screen says what's coming (inferred).
- **afterglass** (`prototype/src/slice`). Numbers in data, the effects in code.
  - **Costs:** `cost: { food: 6 }` is paid on answering and shown as "costs 6 food; gives 4 glass; Dread +1". An answer the keep can't pay for is locked: "That takes 6 food, and the keep has 3." Some answers show only while a rule is on.
  - **Timed choice:** a visitor waits a quarter of a day, then takes the last answer, and the card says so with a draining bar.
  - **Odds:** only one answer has odds, `risk: 0.33`, shown in words ("a third of the time") and rolled on answering.
  - **Delays:** tied to the next occasion, not counted. The next raid comes harder, riders add to the next raid, barrels last until the season ends. "The Day panel" shows them until they come.
  - **Picking:** half of days bring a visitor, picked evenly among those who can come, from a stream of their own, so a keep "meets the same raids … with them or without".
- **wasteland-protocol** (`game.js`). Code.
  - **Records:** an event has a title, an optional cast, `when` and choices as closures. The open event is saved by its title.
  - **Costs:** written only in the label ("(Cost: 40 Scrap)"). A choice that can't be paid for is disabled, and the cost is paid inside its code. No odds. Its random targets use `Math.random`, which isn't seeded.
  - **Delays:** `CONSEQUENCE_POOL` has five kinds (debt, ambush, pursuit, resupply, survivor), booked as `{ kind, dueAt: nodesCleared() + n }` with fuses of 3 to 6 nodes. Each lands on a screen of its own before the map. The board shows "⚠ A debt comes due · 3 nodes", and settling early cancels it.
    - **What went wrong:** fuses counted in sectors meant "0.32 consequences resolved per run against 5.3 events seen … six in seven debts … were never collected", as runs ended first. The fix counts in nodes, adds a test that "no term outlives a run" (8 nodes at most), and keeps the old rule for old saves.
  - **Picking:** owed follow-ups come first, once each, then a weighted draw, with faces already met three times as likely and the last 4 events left out. Its tests find bookings by matching regular expressions against the code of each choice.
- **landnam** (`src/data/events.ts`, `eventCards.ts`). Typed data shaped like JSON: 103 cards.
  - **Conditions:** 22 kinds, all ANDed: terrain, season, day, stores, flags, home or afloat, sickness, neighbours' anger, lore, buildings, tallies and more.
  - **Costs:** nothing gates a choice. A cost is a negative effect, kept at 0 or more.
  - **Odds:** a check is 2d6 and the band's best stat against a difficulty, shown as "Wits · 58%", rolled on choosing from a stream made for that card, day and choice. A test keeps every check between 10 and 95 percent for a fresh band. Effects aren't shown.
  - **Picking:** after a travel day, a 0.19 chance times several modifiers, then a weighted draw among the cards that can come. Weight 0 means only the calendar plays it, and "once" is a flag.
  - **Delays:** flags only: seed corn sets `sowed`, and the harvest card needs autumn and `sowed`. A comment says the flag "was set, paid for, and read by NOTHING" until the harvest card was written.
- **ludus** (`src/ludus.jsx`). Code.
  - **Costs:** only in the label ("· 80d"). An event the house can't afford is withheld, or refused when chosen.
  - **Odds:** hidden.
  - **Picking:** weekly, with weights of 1, 2, 4 and 8, cooldowns in weeks, and events never seen three times as likely.
  - **Delays:** `scheduleArc(d, id, weeks, data)` stores `{ id, fire: week + n, data }`, and an arc can quietly lapse when it comes due.
- **spliceworld** (`data/operations.json`): an operation's chance is a base, moved by what it demands, with each reason shown (`{ text, delta }`) and kept within 15 and 95 percent. The outcome is rolled and sealed at launch and opened when the hours pass: "Deciding at resolution instead would let a reload reroll."
- **rule-or-drool:** JSON cards. A side can queue a card for later (`enqueue: [{ id, delay }]`, the delay counted in cards), saved as `queue: [{ id, dueAt, from }]`. The oldest due card whose condition still holds is played, and stale ones are dropped. A returning card comes with a receipt: "Sent by card 23: 'Trust the software'". 295 card sides send one, about 14 cards later on average. A choice's preview shows which meters it touches, as dots without a direction.
- **Others:**
  - **climbing-world-traveler:** a design only: weighted outcomes, `requires` on options, a 30-day cooldown per event.
  - **sandbagged:** data events with one outcome a choice.
  - **chooser-of-the-dead:** day modifiers with no choices.
  - **2060td:** offers that land anyway after 30 real minutes.
  - **No events:** project-ascent, football-manager-simulator and who-am-i-.

## What most share

1. **Records:** a title, a text and 2 to 4 choices, each with a line saying what happened.
2. **A small effect vocabulary:** resources, wounds, standing by faction, flags, recruits and fights.
3. **Odds rolled on choosing,** or at launch, on a seeded stream, so a reload can't roll again. Wasteland is the exception.
4. **Ways to keep from repeating:** decks, cooldowns, memory of recent events and a boost for those unseen.

## Where they differ

- **Data or code.** Wasteland, Ludus and part of Afterglass are code, and their tests match patterns in code to find what an event does.
- **A choice that can't be paid for:**
  - **Locked, with its reason:** space-wrecked, afterglass and wasteland.
  - **Hidden:** ludus and dirtbag's favours.
  - **Not checked:** landnam and dirtbag's knocks.
- **Costs** are paid on choosing in Afterglass and Wasteland. Space-Wrecked writes them again into every outcome.
- **Odds:**
  - **Shown exactly:** space-wrecked, landnam and spliceworld, the last with its reasons.
  - **In words:** afterglass.
  - **Hidden:** ludus and rule-or-drool.
  - **Moved by stats:** landnam and spliceworld only.
- **What a delay counts:** nodes (wasteland), cards (rule-or-drool), weeks (ludus), days (dirtbag) or real hours (spliceworld). Afterglass's waits for the next occasion. Landnam's are flags that later cards read.
- **Telling the player:** wasteland shows a countdown, rule-or-drool gives a receipt when a consequence lands, and dirtbag says nothing.

## Open questions

1. Which of the differences above are an author's choice for each event, and which are the engine's for every game.
