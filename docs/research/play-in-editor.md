# Debug tools in the games we have (M4.9)

A survey of the debug and dev tools in sixteen of Evan's browser games, read for M4.9, Play-in-Editor ([D59](../decisions.md)). It records what the code does, with where; what we infer from it is marked as such. Paths are inside each game's repository. No game's story is quoted.

## Panels and how they open

- **A URL switch is the common door:** Space-Wrecked's `?dev=1` (remembered; a DEV button with test screens, cheats and a status block, `src/ui/dev/menu.js`), Rule or Drool's `?debug` (a text block of hidden state: drift, band, seed, flags, the queue of cards with when they are due, `src/ui/Debug.tsx`), Afterglass's `?dev` and `?watch` (the replay viewer and playtest numbers), 2060td's `?playground=1` and `?demo=`.
- **A console object:** Landnam's `window.landnam` (state, fights, raids, `skip`, `build`…, `src/debug.ts`), installed in every build.
- **Kept out of release builds** only in Chooser of the Dead (its labs load only in the `dev-full` build mode, and a leak check after the build fails any other build that carries the labs' marker string, `tools/leak-check/cli.ts`) and Ludus (its test hook only in `build.js --test`). Everywhere else the tools ship. Wasteland Protocol's DEV TOOLS button is in every player's settings.

## Logs

- **Kept and capped:** Dirtbag's game log keeps 200 lines (`app/src/sim/game.ts`); Afterglass's trail of page events (pauses, speed changes, skips, panels, idle stretches) keeps 4,000, trimmed to 600 in saves; 2060td keeps a command log with each command's tick.
- **None can be filtered or searched.** The nearest are Afterglass's replay "stop at" and 2060td's jump list.
- **What a line holds:** Space-Wrecked writes a battle line with the hit chance and the roll (`src/sim/battleLog.js`); Football Manager Simulator's play log carries the state at that play.

## Time

- **Turn-based games step by their own units:** Climbing World Traveler's +1 day and +1 week buttons, Football Manager's sim week, Landnam's `skip(days)`, which adds to the day without running the days between (inferred: a skip that misses timers isn't a skip a game can trust).
- **Real time:** 2060td's replay pause and 1–8× speed, its offline catch-up a pure function of an explicit `now` (`src/meta/town.ts`); Spliceworld's `?warp=48`, kept in the URL and never in the save.

## Quests

- **No game forces a quest's stage** from a tool. Space-Wrecked's "Do quest step" cheat completes every open step of the act, with a reason when it can't (`src/sim/dev.js`).
- **"Why can't this advance?"** is a function shape both Dirtbag (about 40 `somethingBlocked(state) → reason | null`) and Landnam (`*Blocker`) use for their own screens. (Inferred:) the engine's conditions already say which part is false; a quest debugger can show that per objective.

## Cheats, and keeping them out of saves

- **Space-Wrecked's cheats are pure functions** returning a new state or an error, run through the store's normal action; God mode is a rule switch never saved (`src/sim/dev.js`, `src/sim/god.js`).
- **Afterglass marks them:** a `'debug'` action type the automated player uses, which exports refuse (`src/slice/saves.js`).
- **Landnam, Wasteland Protocol and Rule or Drool write cheated states into the real save**, unmarked.

## Save states

- **Climbing World Traveler saves a log of actions in chunks with a snapshot every 200 actions**, loading from the newest snapshot (`src/save/session.ts`).
- **Afterglass keeps a spare copy each day**, and its replay viewer saves the game first and restores it after.
- **Fixtures:** Spliceworld keeps a save from every save-format version; Chooser keeps testers' saves as fixtures every build must open.

## Replay and divergence

- **A run is its seed and its accepted actions** in Landnam (capped at 60,000, kept apart from the save; replay stops at the first action the rules refuse and reports its index, `src/record.ts`), Rule or Drool (`replayTo` checks each dealt card against the record, null where they part, `src/engine/replay.ts`), Afterglass (the cursor stops and says why when the game stops matching) and 2060td (codes with a format version and a checksum).
- **Content changes break old runs:** Rule or Drool re-checks a run before replaying it, because an update can change what a seed deals.
- **Hashing:** 2060td and Landnam hash a canonical form with FNV-1a; Landnam's facets hash each part of the state apart, with a few readable values, so a difference says where. Landnam's whole-state hash gave false alarms until prose was left out of it. The engine's `stateHash` and facets come from there (M1.2).

## What to take

- Cheats as the game's own steps, marked, kept out of anything a player loads (Space-Wrecked, Afterglass; Chooser's build mode for the keeping out).
- A run recorded from its seed, with each step's hash; replay stopping at the first refused or different step, saying which part of the state changed (Landnam, Rule or Drool, the engine's facets).
- Time advanced through the game's own rules, never around them (the Landnam `skip` pitfall).
- "Why it can't advance" from the conditions the content already holds (Dirtbag, Landnam).
- A recorder that never stops play and has a cap (Landnam's `record.ts`).

## Open questions

1. A filter or search over the event log: no game has one, and the hut's log is short. Worth it once a game's log runs to thousands of steps.
