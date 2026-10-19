# Research: aliases and timed jobs in the earlier games

What the games before the engine did for a quest's targets and for jobs that take time (M3.10, [D48](../decisions.md)). It builds on [missions.md](missions.md), M3.9's survey, and leaves out what that says. Paths are each repo's under `rcjlabs/`; the repos were read, never run. "My reading" marks a gap seen in the code that no note of the repo's records.

## Spliceworld: jobs sealed at launch

- **Three kinds, one rule.** Board jobs (`campaign/operations.js:345-434`), missions against rival labs (`campaign/caper.js:140-225`) and expeditions (`campaign/outfit.js:72-123`) all follow "Launching decides the outcome NOW, seeded, and stores it."
- **Launch** checks its refusals in a fixed order, the charge last, "so a launch that was going to be refused for a better reason still says the better reason" (operations.js:377-404). Every roll happens then, the injury for a failure included, from a stream of seed, label and a counter (`util/rng.js:26-30`). A mission also fixes the creature's fate and when a held agent is free again (caper.js:173-210).
- **Saved** as `{opId, chimeraId, startedAt, until, chance, outcome}` (operations.js:418-427).
- **Durations** are real hours: jobs 1.5 to 15, espionage 3, 8 or 18, expeditions 4 to 48; the longer, the better the odds.
- **Odds shown:** the row's best odds; each creature's own odds with reasons ("+22 Aquatic anatomy", ui.js:1584-1596, from `opOdds`); a running job's "odds were N%" from the stored chance. Jobs are held to 15–95%: "a board that can be made certain is a board that stops being read" (`data/notes/missions.md:20`).
- **Offline:** nothing runs in the background. On load every job past its `until` resolves, oldest first, stamped with `until`, never now (operations.js:470-489).
- **Nothing to claim:** the first unread result is the report card, the rest go to the news ticker (`campaign/campaign.js:238-266`).
- **Calling it off** gains nothing, loses nothing, and starts the cooldown from now (operations.js:447-460). A job can't be hurried.
- **How many at once:** one crewed job per creature fit to work, up to 3; 3 board charges, one back every 8 hours; one mission and one expedition.
- **What went wrong:**
  - a migration that wrote `operations = []` "passed everything", as the tests checked the save's shape, not that the job in flight kept its clock and sealed outcome (PROGRESS.md:20775-20788);
  - resolvers stamped now: after a week away, a fresh 4.5-hour lock and a newborn animal (14994-15018);
  - a second result overwrote an unread report (campaign.js:241-247);
  - my reading: neither `startOperation` nor the crew picker refuses a creature away on an expedition or a mission. "Who is away" is answered in four places: `expeditionCrew`, `missionCommitted`, `freeCrew`, `homeChimeras`.

## Targets

- **Space-Wrecked** (`src/sim/quests.js`): a quest job's client, site, pay and fight seed come from a stream keyed on the quest and `tries`, which counts every job done or lost, so the offer changes when any job ends (`tests/quests.test.js:56-69`). It is worked out on each read, never saved. An event's node is chosen by rule (a free node of its kind, else empty space, never the way in or another quest's node, 170-183) and written on the node itself, as the sector is "saved whole". A companion's loyalty quest opens as they join and ends cold as they are let go (`src/sim/recruits.js:142-144`); my reading: a death would not end it (`src/sim/campaign.js:390-401`).
- **Ludus** (`src/ludus.jsx`): roles go by score, not dice: the best veteran–rookie pair (23009-23026), the man with the most fans (23146-23155), the most defiant valuable man (16008-16013). Ids go in the event's data and are looked up again as it runs: "The moment passes; one of them is no longer in the yard" (23028-23029). Bookings name a random man with fame 25 or more for a festival 2 to 6 weeks out (10829-10858); missing it repays twice the advance.
- **Landnam** (`src/sim`): a standing effect hits the friendliest or angriest neighbour, ties to the first listed (`neighbours.ts:105-114`); wounds pick their victims as they land, from a stream keyed on the day and the effect (`events.ts:218-271`). A feud saves the pair's ids and settles silently when one is gone (`minds.ts:153-161`).
- **Wasteland Protocol** (`game.js`): delayed consequences name a set character, DEBT always Vela. Booking SURVIVOR from any recruit was pulled: Kess would "repay the squad for something she had nothing to do with; that is a content bug" (10603-10611). Three consequences roll `Math.random` as they land.
- **Dirtbag:** each crew member asks one favour a window, on a day the seed picks (`app/src/sim/favours.ts:12-37`); expedition partners are anyone past a bond tier, best first (`app/src/sim/expeditions.ts:84-90`). The old build's audit: when the rival was replaced, "a stranger greets you like an old friend"; the partner slot was hard-wired to "Dex"; the injured rival still competed (`docs/audit/meta.md`).
- **project-ascent** (`src/engine/challenges.ts:240-397`): a bounty's target comes from the climber's own log, and an accepted bounty saves its filled-in spec "so an accepted bounty survives a reload".
- **Afterglass** (`prototype/src/slice/sim.js:2351-2548`): a sleepwalker is one of the living, saved as id, name and hour; if gone by dusk the errand ends `gone`. The first ones died in 7 to 10 seconds, "too fast to answer" (HISTORY.md:288).
- **2060td** (`src/meta/town.ts:1243-1299`): research and training are real-time timers with no odds, finishing while the game is closed, income capped at `OFFLINE_CAP_HOURS`; one research at a time.
- **climbing-world-traveler** (docs only): `@here`, `@partner`, `@local` and `@rival` in an event's effects are "NPC ids resolved at fire time" (`docs/schemas.md:572-574`), and an event fires only when its slot can be filled. Placeholders or explicit `target` fields was left open until "the event validator cannot check them statically" (756).

## What they share

- **Each purpose has its own stream**, so a new roll doesn't shift the others. An outcome is stored as it is decided, or worked out the same way on every read.
- **Targets are chosen by rule:** the best by a score, the first match, or the best first. Dice among the matches are rarer.
- **Targets are saved as ids** and looked up again when used, with a line for when they are gone.
- **Clocks are in the game's units** (weeks, days, map nodes). Only Spliceworld and 2060td use real hours, and both settle the time passed as the game loads.
- **Nothing has to be claimed,** and the odds shown come from the function that rolls.

## What went wrong across them

- A target left by a way nobody handled: death, a sale, a foe gone from a rival's roster.
- The named target wasn't needed to do the job.
- What belonged to a role stayed when another record took it.
- Clocks ran out before the player saw them.
- Results were stamped with when the player looked, not when the thing ended.
- A migration dropped jobs in flight and passed tests that checked only the save's shape.
- "Who is busy" was answered in more than one place.

## What the engine has already

- **Made records** (D44): the roster's recruits are records like any other, listed by `content.ids` as they are made, and a member who leaves stays a record. `roster/left` is the one way out, with its why.
- **Conditions** are three-valued: a test that can't be answered is unknown, never true.
- **`roll`'s table** (`packages/core/src/logic/module.ts`) is what a roll and its preview both read.
- **The time module's timers** fire effects at a tick, in order, settle time passed while the game was closed when its clock follows real time, and cap it.
- **The quests kit** (M3.9) keeps each quest's entry, hears every event and checks its quests as it does.

## Open questions

1. A slot's record named in log lines and objective text: read live from its name when the journal is read, which shows a renamed member's new name; or written as the stage is reached.
2. A cooldown between a repeat's runs, as Spliceworld's board has, or content's own flag and timer.
3. Odds moved by stats, and the player picking who goes (Spliceworld's crew picker), which come together.
