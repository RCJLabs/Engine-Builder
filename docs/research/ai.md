# Research: NPC AI (M6.3)

What M6.3 builds on, what RCJLabs' own games do for schedules, decisions and perception, and the
patterns worth porting. Read for D75 on 2026-10-25.

## What the engine already has

- **Goals and arrivals** (M6.2, D74): `walk-to` gives a placed actor a goal, an object of its space;
  the stage's Detour crowd walks it there and says where it stands (`world/npcs-at`); an arrival at
  the current goal is `world/npc-arrived`. The world module's slice (version 3) keeps each NPC's
  goal and where it last stood, so a save puts it back.
- **A calendar** (M1.7, M3.5): ticks of a day, phases, weekdays, months and seasons, timers, and the
  start-of events. The time module can follow the wall clock (`realTime`: ms a tick and a cap), but
  no project sets it and **the walk never sends `time/elapse`**: in a walked space the clock moves
  only when an action moves it (a Rest button, a door's effects). Schedules need it to run.
- **Conditions and effects as data** (M1.6, M3.1): any condition can read facts (`time.phase`,
  flags, quest stages, factions' bands), and trigger sheets react to events.
- **Streaming** (M5.10): NPCs are built only in the rings near the player; one far off waits where it
  last stood (D74's cost).
- **Physics** (M5.8): Rapier's rays against the space's solids, already used for the camera and taps.

## RCJLabs' games (surveyed read-only, 2026-10-25)

None of the fifteen repos has a behaviour tree, GOAP, a vision cone, a hearing radius or a patrol
route. What they have:

- **A stateless schedule**, dirtbag `app/src/sim/presence.ts`: where a person is, worked out from
  the seed, the day and the minute (time windows, the weather, a roll derived per day, invites and
  bonds), with nothing stored. Weekly job shifts the same way (`jobs.ts`).
- **Booked days**, afterglass `prototype/src/slice/sim.js:847-903`: a day's events booked at fixed
  ticks; night workers with posts and day duties.
- **Rule lists in data**, 2060td `src/content/standingOrders.ts`, `src/sim/engine.ts`: an ordered
  list of standing orders (a threshold, an action, a target, a cooldown in ticks), checked once a
  second, ties broken by id; attackers' state machines on fixed 20 Hz steps.
- **Priority selectors**, afterglass `wayOf` (`sim.js:2904-2935`: flee if lit, hunt, gnaw, climb,
  idle, re-planned on a countdown), landnam's temperaments (`src/sim/battleAi.ts`), space-wrecked's
  order rules per crew job (`src/sim/orderAi.js`).
- **Utility scoring**, space-wrecked `src/sim/ai.js`: each plan scored in expected hit points with a
  weights table; no rolls, ties to the first plan found.
- **Line of sight**, space-wrecked `src/sim/sight.js`: exact integer sight on the grid, the same
  from either end; afterglass's sense range blocked by light.
- **Alert ladders**, space-wrecked `heat.js` (calm, rumours, hunters, raid; loud jobs add more) and
  spliceworld's rivals, who know only what they have seen.
- **Determinism caveats**: wasteland-protocol's enemy intents use `Math.random`; afterglass uses
  `Math.pow` and seeds from `Date.now()` by default; football-manager-simulator uses `Math.exp`.

## Elsewhere (general knowledge, not measured here)

- **Bethesda's AI packages** (Creation Kit): each actor has an ordered list of packages (Sandbox,
  Travel, Patrol, Follow, Sleep, Eat, Use Idle Marker…), each with a schedule (hours, days) and
  conditions; the first whose schedule and conditions hold runs, and the list is re-checked as time
  passes. Off-screen actors are placed where their package puts them when their cell loads.
- **Behaviour trees** (Halo 2's, Unreal's): a selector runs the first child that succeeds, a sequence
  runs children in order; leaves are conditions and actions that can be running. Unreal adds
  decorators (cooldowns, conditions that abort a running branch).
- **Perception** (Unreal's AIPerception, Thief's): sight as a range, a peripheral angle and a trace
  to the target; hearing as noise events with a loudness and a range; stimuli fade with age. Thief's
  awareness climbs through levels and decays when nothing more is sensed.

## Worth porting

1. **dirtbag's stateless schedule**: an NPC's activity is a function of the time and the facts, so a
   far-off NPC is simply wherever its schedule says when it is built, and nothing is stored for it.
2. **2060td's standing orders and afterglass's selector**: an ordered list, first that holds wins,
   re-checked on a cadence; this is a behaviour tree's selector, authored as data.
3. **space-wrecked's heat ladder**: thresholds over a number that sensing raises and time lowers.
4. **Exact, symmetric sight**: the stage's Rapier ray is the 3D counterpart; the sim keeps only what
   was seen, not geometry.

## Open questions

1. NPCs travelling between spaces on a schedule (each actor stands in one space today, E077).
2. Combat behaviour (M6.4) on the same trees: when an alerted NPC attacks rather than follows.
3. How a sleeping or working NPC looks before M6.5's animation: a pose, or only where it stands.
