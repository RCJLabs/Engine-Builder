# M7.5's kits: grid tactics, a ranked squad, tower defense, a builder

A survey of the portfolio for M7.5 (2026-10-27), read only, nothing run. Earlier notes cover the rest: [space-wrecked.md](space-wrecked.md) (acts 1–2, ranks, win rates), [tilemaps.md](tilemaps.md) (map text, sight, cover, four-way moves, ported in M7.2; door state and rubble left for M7.5), [rooms.md](rooms.md) (afterglass's floors, slots and stairs), [kits-ii.md](kits-ii.md) (rosters and ranks), [encounters.md](encounters.md) and [combat.md](combat.md) (fights resolved, odds shown, 2060td's fixed rate and tick-stamped commands).

## Recommendation: four milestones, in the order Proof #3 needs them

1. **Tactics (large).** Proof #3's boarding fight is this kit played on M7.2's deck. It settles what M7.2 left for M7.5: doors that open and shut, welds, rubble's step cost, units that block. The others reuse it.
2. **Builder (large).** Proof #3's ship builder is its top-down placement, and D85 promised rooms raised in play. It may split again: placement, then jobs and production.
3. **Ranked squad (small to medium).** The roster kit covers most of it.
4. **Tower defense (large).** Proof #3 doesn't need it, and it brings the riskiest new piece, a fixed-tick sim.

All four in one milestone would be four kits' records, checks, forms, fixtures and phone e2e: larger than any milestone so far. The encounters kit, for scale, is about 600 lines of sim.

## Grid tactics

**Space-Wrecked's battle sim** (`src/sim/`, about 1,700 lines, with `fight.js`, 364, turning taps into actions):
- **`battle.js` (469): `createBattle`, `act`, `walk`, `fire`.** Sides take turns. Each unit has 2 action points: a move costs 1 within its mobility, or 2 within twice it (a dash); a shot or overwatch ends its turn. A walk goes tile by tile; doors open as a unit passes, and each enemy on overwatch who sees the new tile fires once. Downed crew bleed out over 3 turns, then die or are out, by a permadeath option. Objectives (`grab`, `hack`) and a deadline round live here too.
- **`odds.js` (54): `shotOdds`.** Aim plus the weapon's accuracy for its range band (close 3 tiles or less, mid 7 or less), less cover (half 20, full 40), defense and 15 on overwatch, plus marked or suppressed, plus "forgiving" (+10 a miss in a row, at most 30, crew only). Crit is the weapon's, +30 when flanked. `fire` rolls these numbers: the odds shown are the odds rolled.
- **`orders.js` (240):** seven job orders as data, each with uses a fight: suppress, weld, patch, hustle, mark, sedate, kit.
- **`moves.js` (79), `terrain.js` (64):** `reachable` finds every tile within a budget; rubble costs 2; enemies block, allies pass, no one stops on another. Open doors and welds are state over the fixed map.
- **`ai.js` (195), `orderAi.js` (126), `press.js` (40):** the enemy plays as a player would, scoring each plan as damage dealt less 0.8 × damage taken, less overwatch risk. Deterministic, but in fractions.
- **`deploy.js` (55):** crew start on the bridge, boarders at the hatches, with a stated tie-break.
- **Sight:** 20 tiles and a line. No repo has fog of war.
- **`tests/golden/example-battle.txt`** records every roll, so a port can be held to it fed the same rolls.

**Elsewhere:** wasteland-protocol orders turns by speed and has overwatch (`fireOverwatch`), with no grid. sandbagged, rule-or-drool and spliceworld have no grid tactics.

**A kit would need:** settings, weapon and order records; a battle slice of units on tiles, doors, welds, side and round; a battle mode whose actions (move, shoot, overwatch, reload, stabilize, open, order, end) list their options for bots and preview part by part; events for the stage; the enemy's AI in the sim.

**Reuse:** core's `tiles/` (grid, sight, cover, route); the stats, gear, roster and encounters kits; M7.4's port of the battle painter to draw it.

**Gaps:** door and weld state over `gridOf`; a reach map with weighted steps and blocking units; sight's range; units at tile coordinates in the sim (NPCs stand at named marks today); the AI scored in whole numbers; tap to preview, tap again to confirm; overwatch interrupting a move partway.

## Ranked squad

- **landnam `ranks.ts` (238):** a line with depth, not a grid. A reach table says which ranks each verb works from and lands on (strike from 1–2 at 1–2, reach from 2–3 at 1–3, throw from 2–4 at any); `closeUp` steps everyone forward after a fall. Pure and table-driven; the fight around it is `battle.ts` (563), `battleTurn.ts` (373) and `battleAi.ts` (185).
- **wasteland-protocol `game.js`** (16,305 lines of closures, `Math.random` in combat: mechanics only): three ranks and a bench with a reach table per move; bleed-out over 3 turns, then `loseOperator`, the kit to the stash and the operator to a fallen list, `closeRanks` filling from the bench; XP to the next level ×1.35, a perk offered each level; class mastery kept across runs, unlocking options rather than power at 1,500, 4,000 and 8,000 XP; runs by `buildNewRun`, `endRun`, `extractRun`.
- **space-wrecked `ranks.js` (71):** `jobAtRank`, in the engine since M4.12 as the roster's rank ladder.
- **spliceworld `veterancy.js` (105):** a level worked out from XP, never stored; each level multiplies stats, never speed.
- **ludus** lowers a fighter's death chance with wins; **football-manager-simulator**'s growth, ceiling and age belong to a manager sim.

**Reuse:** the roster kit (a stat-ladder rank, statuses per rank, recruits, `leave` with a reason, bonds). **Gaps:** a class chosen on promotion, perk offers, a positional line fight, runs begun and ended, anything kept across runs (no store outside a save).

## Tower defense

**2060td `src/sim/`** (5,965 lines; `engine.ts` one class of 3,145, much of it the siege's own):
- **A fixed tick,** 20 a second; `step()` runs each part in a fixed order; commands carry the tick they apply on, so the log and the config replay a battle to the same `stateHash`.
- **Waves:** entries `{atTick, kind, col/row, doctrine, vet}`, a prep phase between; `nextWaveRead` previews the next by kind, lane and arrival.
- **Paths:** `pathfinding.ts` (224), weighted A* in seconds, a wall costing its hit points over the attacker's wall damage, so foes go round or break through (mazing); paths redone when the grid changes.
- **Towers:** range and least range, shots a second, splash, shell flight time, ground or air; upgrade levels as overrides; mines; `acquireAttacker` takes the nearest in range, the lowest id on a tie.
- **Damage:** a damage type × armour table; `combat.ts` (137) adds a 25% miss that keeps the mean, on its own stream.
- **Economy:** supplies build between waves; command points come a second during a wave, capped, and a bounty a kill, for field defences mid-wave; selling and repairs are priced.
- **Numbers:** all floating point, positions and the tick (1/20 s) included.

**A kit would need:** tower, foe, wave and settings records; a slice with positions in whole sub-cell units and cooldowns in ticks; actions to build, upgrade, sell, start a wave and advance; a preview of the next wave. **Reuse:** the tilemap, the economy and stats kits, stage2d. **Gaps:** a fixed-tick sim, the large one (one action is one step today, and CI's worker answers about one step a second, [specs/combat.md](../specs/combat.md)); weighted paths round obstacles; motion in whole numbers; shells in flight; the stage smoothing between ticks.

## Base and colony builder

- **Space-Wrecked's ship builder:** `builder.js` (482): `placementError` (frame, rotation, cap, bounds, overlap, naming the module in the way); `layoutProblems` (every part joined to the bridge, an airlock on the hull's edge, engines and guns facing space); `joins` puts a doorway in the middle of each shared wall. `constraints.js` (194): a flight checklist from the parts' summed stats, each failing line naming its fix ("Add 2 × Engine"), thrust to mass in floats. `modules.js` (66): footprints and rotation. `mapFromShip.js` (163): a layout to a battle map.
- **Space-Wrecked's colony:** `colony.js` (375) the builder on a site grid with a path kept round each building, power given out in build order so the last go dark when short, beds, air and storage; `colonyBuild.js` (197) plans a build before applying it; `days.js` (138) one ordered pass a day: make, eat, heal, cap to storage.
- **afterglass `sim.js` (5,390):** `raise` (stone, more for a new floor or high up, some rooms only on some floors), `teardown` (half back), `moveRoom`; `assign`, a job's cap the rooms × 3; `dayTick`'s production per worker, stores turned into others, everyone eating, starvation killing. Real-time ticks, floats.
- **landnam `colony.ts` (649):** a build queue paid when queued, labour banked toward its head; prerequisites (`after`, `replaces` for upgrades, `needs` for a site's measures); output = (floor + site × perPoint) × skill × season; idle hands cost morale. No placement.
- **2060td `meta/town.ts` (2,293):** power's reach and bonuses for buildings side by side. spliceworld's facilities are upgrade tracks only.

**A kit would need:** buildable records (footprint, cost, tags, gives and needs, where it may stand, caps, upgrades), site rules and jobs; the layout in the save; actions to place, move, remove, assign and pass a day, each planned first with its cost or why not. **Reuse:** M7.3's building component and room records, the tilemap, the economy, roster and time kits. **Gaps:** the layout moving from the pack into the save (a world slice version and a migration, the stage drawing the sim's layout); top-down footprints; a layout turned into a tilemap as `mapFromShip` does, for Proof #3 (M7.10); production in whole numbers.

## Calls for Evan

Answered 2026-10-28 (D87): four milestones (call 1), tactics whole with no fog (call 2), the boarding deck for its demo (call 6's first part). Calls 3 to 5 and the rest of 6 are put when each kit begins.


1. **The split:** one milestone; four (tactics, builder, squad, tower defense); or tactics and the builder now, the other two after M7.7. Recommended: four.
2. **Tactics' scope:** Space-Wrecked's boarding rules whole (action points, overwatch, the seven orders, bleed-out, the AI); the core with orders later; or whole with objectives and hazards. Recommended: whole, sides taking turns, no fog.
3. **What the ranked squad is:** progression only; a positional line fight; or both, the line by landnam's reach table and runs as wasteland's, nothing kept across runs. Recommended: both, small.
4. **Tower defense:** paths as lanes, mazing, or mazing where cells can be built and lanes where not (recommended); building between waves only, each wave resolved in one step and replayed by the stage (recommended), or live building.
5. **The builder:** top-down placement, side-view rooms, or both on one rule set with a daily pass in whole numbers (recommended).
6. **Demos:** tactics on the boarding deck, Ines and Oren against boarders; the squad on the convoy fixture or a fresh line; tower defense a fresh outpost in 2060td's style; the builder Space-Wrecked's example ship built in play and the tower raised with jobs, food and beds.

## Open questions

1. Are tactics units the world's NPCs, or a battle slice of their own? Leaning to a battle slice.
2. Does the AI choose the same once scored in whole numbers? Replaying `example-battle.txt`'s rolls would show.
3. Should door state live in the battle slice, or the world's, so ordinary walkers see it too?
4. How long does a whole tower-defense wave take to compute in the worker? Measure before deciding call 4.
5. Can a world-slice migration move M7.3's packed buildings into saves cleanly?
6. Is progression kept across runs in scope? It needs a store outside a save.
7. M7.9's Manager sim template has no kit of its own: does it need football-manager-simulator's growth, ceiling and age?
