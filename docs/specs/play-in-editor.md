# Play-in-Editor (M4.9, D59)

The Play panel's debug tools: a game in play read and changed while it runs, its run recorded from the start, stepped back and forward, kept as named states, and replayed against the project after an edit. They are the editor's only. The survey behind them is [research/play-in-editor.md](../research/play-in-editor.md).

The game is changed only by its own effects, in a step of their own, through the sim. The tools never write a state by hand. So a debugged game is one the sim could reach. What keeps it apart from a player's game is the step's mark, which every later state counts.

## The debug step

An engine module, `debug`, in `packages/core/src/sim/debug.ts` (pure).

- **`debugModule()`.** Its slice is `{ "steps": 0 }`: how many debug steps the state's history holds.
- **One action, `debug/run`,** carries `effects`: 1 to 20 effects, each an object with a string `effect`. The module applies each in turn with `ctx.apply`, adds 1 to `steps`, and emits the beat `debug/ran` with `{ "effects": n }`.
  - An `effects` that is not such a list refuses the step (`bad-effects`).
  - An effect that refuses refuses the step, and nothing it did is kept, as with any step.
  - `debug/ran` is a beat, not a declared event, so no sheet row or quest can count it.
- **Allowed in every mode, offered in none.**
  - The kernel knows the module by a symbol only `debugModule()` sets: `reduce` lets its action past the mode check, and no mode's actions ever include it, `"*"` included.
  - So `options()`, and with it every menu, screen and bot, never offers it.
  - A game's own module can't take the id `debug`.
- **`debugStepsOf(save)`.** The debug steps a save holds: its snapshot's `debug.steps`, plus the `debug/*` actions in its log.

### Kept out of players' games

- **Only the editor's games have the module.** `openPack(pack, { debug: true })` adds it after the game's own modules. The editor's Play worker opens every pack so, the designer's game included (M4.5). The player page opens without it.
- **The player page refuses a save with any debug step** (`resumeFrom`, before the replay). A refused save is kept as it was, as any save that won't load is (M4.3).
  - Its edition already keeps a playtest save out of `/play/`'s slots (M4.3). This check holds if the edition was changed.
- **A debugged save can't be saved out.** Each save's summary carries `debug`, the state's count, when it is above 0. The shell's Saves screen marks such a slot "Changed by the debug tools". It offers neither Save as file nor Copy code for it.
  - The Stopped screen still saves out the save a crash stopped on, for a report. The player page refuses that file as it refuses any debugged save.

Without the module, a log holding `debug/run` would replay with those steps skipped (`loadSave`'s unknown actions). That would give a state the player never had, which is why the refusal comes first.

## The recording

The worker records the game in play from its start, in `apps/editor/src/play/debug/recording.ts` (plain functions).

- **The start.**
  - A new game: its seed and its start state.
  - A loaded save or a restored state: the save's snapshot, migrated.
- **The steps.** Each accepted step holds:
  - its action and the state's `stateHash` after it;
  - its label, the action's words (`actionLabel`), or "Debug: " and its effects in words;
  - its beats, as `module/what` and their data;
  - whether it is a debug step.
- **A loaded save's log** is replayed into the recording, step by step. Step back then reaches back to the save's snapshot. Saves compact every 200 steps (`MAX_LOG`), so that is at most 200 steps.
- **Refusals.** A step the game refuses changes nothing. It is noted at its place in the log with its reason and never recorded. Replays never meet it.
- **The cursor.** Where the game stands in the recording. A step taken anywhere but the end drops the steps after the cursor first, as an edit after undo drops the redo.
- **The cap: 10,000 steps** (Landnam's `record.ts`). Past it, play goes on and nothing more is recorded. The panel says so, and Step back, Step forward and Replay work only within what was recorded.

## Step back and forward

- **Step back** plays the recording again from its start to the step before the cursor. It never undoes a state. Each step is checked against its recorded hash on the way. A difference stops it with "This game doesn't play the same twice", naming the step, which is a bug in a script (the sim's own rules forbid it).
- **Step forward** takes the step after the cursor again. If the game refuses it now (after a Replay under new rules), the cursor stays and the refusal is noted.
- **After either, the game in play is the state reached.** The shell keeps a save of it in its slot, as after any step. After a step back, that save starts at the state stepped back to: the recording in the worker keeps the run, and the save keeps only what comes after.

## Replay

Replay plays the recording again on the project as it is now. It answers "what did that edit change in the run I just played?"

1. The project's files are compiled into a pack, as Play compiles them. With errors, nothing is replayed, as nothing plays.
2. **The start.** A recording from a seed starts a new game of the new pack from that seed. One from a state migrates that state under the new game. If the start's hash differs from the recorded start's, Replay stops there: "The start differs".
3. **Each recorded step,** up to the cursor, is taken by the new game's `reduce`.
   - A step the new game refuses, or no longer has, stops Replay before it: "Step 4 (Rest a day) is refused now: not-offered". The game stands after step 3.
   - A step that leaves another state than the hash recorded stops Replay after it. The game stands at the new state, and the report names the first changed place:
     - the slice, which is a module's facet (M1.2): the first by its key that changed, the kernel's only if nothing else did;
     - the first path in it that differs (`firstDifference`), with its value before and after;
     - the other modules' slices that changed too.

     For example: "Step 2 (Carry) plays out differently: in economy, /amounts/coins was 30, now 40; quests and factions changed too". Which slice the change began in, the author knows from their edit; the report shows each one it reached. The state before comes from the old game, replayed to that step.
4. Every step the same: "All 12 steps play out the same".

**After Replay the new pack is the game in play,** at the step where Replay stopped.
- The recording keeps its steps past that point, ahead of the cursor, with their old hashes. Step forward takes them one at a time under the new rules.
- The shell draws the new pack's screens and keeps a save of the new state.
- Recorded hashes up to the cursor are the new game's.

`replayRecording` (in `packages/core/src/runner/replay.ts`, pure) does steps 2 to 4 for any game. It is given the old states it needs through a function, so it never holds two games.

## Time

Buttons step time by one of each of the calendar's units, from its tick up: +1 tick, +1 day, +1 week where the calendar has weeks.
- Each is a debug step running the time kit's `wait`: `{ "effect": "wait", "days": 1 }`.
- Timers, jobs and start-of rows fire as they would in play. Landnam's `skip(days)` moved the clock without them.
- They appear only when the project has the time kit on.
- Back in time is Step back.

## Quests

Each quest the quests kit knows, with its state and why it hasn't moved on, read in the worker from the state and the records with the game's own `check`:
- **Waiting:** its `starts-when` in words, and whether it holds now; or the slot no record fills.
- **Active:** the current stage and each objective with what stands in its way:
  - a count's events so far and how many it needs;
  - a `done-when` in words, and whether it holds;
  - the days the stage has left, a job's time left, and whether the stage's `fail-when` holds.
- **Done or failed:** its last stage and, if failed, why.

**Set stage** runs `set-stage` for a quest, picked from its stages, as a debug step. **Start** runs `start-quest` for one waiting.

## Run an effect

The effects form content uses (M3.1), over a list of the panel's own (not in any file), with the same pickers and checks.
- **Preview** shows what the game's `preview()` says the effects would do now. The odds shown are the odds rolled, as everywhere.
- **Run** takes them as one debug step.
- A step the game refuses leaves the list as it was, with the reason.

## Named states

- **Keep this state** saves the game in play under a name the author types, as a save file. The editor keeps these per project in its own storage, under edition `states`, apart from the shell's slots.
- **Restore** loads one into the game in play.
  - Its recording starts at that save's snapshot.
  - The shell's slot gets a save of it, as after a step.
- **Delete** asks for a second press.
- A named state from another build of the project loads as the shell's saves do: replayed under today's rules, with any difference said.

## What the panel shows

Under the game in the Play panel, while a game is in play: a "Debug" region of sections, each a disclosure, each closed at first.
- **Steps:**
  - Step back and Step forward;
  - "Step 12 of 14", and a note when the recording is full;
  - the log, newest last, each step's number, label and beats, debug steps marked "debug", refusals marked "refused", the steps ahead of the cursor dimmed.
- **Time:** the date as the time kit says it, and the +1 buttons.
- **Quests:** as above.
- **Run an effect:** as above.
- **State:** each slice with its hash and size, opened to its JSON.
- **Named states:** as above.
- **Replay:** the button and its report.

On a phone the Play panel sits in the More tab (D37); the sections stack under the game and open one at a time.

## The worker's requests

Added to the Play worker's (apps/editor/src/play/protocol.ts). Each reply carries the panel's look at the game: the recording's log and cursor, the state's slices, the quests and the date.

| Request | Does | Reply |
| --- | --- | --- |
| `debug-look` | nothing | `debug-looked` |
| `debug-run` `{ effects }` | a debug step | `debug-moved`, or `debug-refused` with the reason |
| `debug-preview` `{ effects }` | `preview()` | `debug-previewed` |
| `debug-back`, `debug-forward` | moves the cursor | `debug-moved`, or `debug-refused` |
| `debug-keep` | a save of the game in play, under edition `states` | `debug-kept` |
| `debug-restore` `{ raw }` | loads it | `debug-moved`, or `debug-refused` |
| `debug-replay` `{ files }` | Replay | `debug-replayed`, with the report and the new pack's screens |

`debug-moved` carries the new view and the save the shell keeps in its slot. The shell takes them as it takes a step's (`ShellProps.moved`).

A debug step that throws (a script's error, an effect the game doesn't have) is reported as refused, with the error. The game stays as it was: `reduce` never changed it.

## Checks

- **core:**
  - `debug/run` applies its effects and counts;
  - it is refused when `effects` is bad;
  - it is allowed in every mode, closed ones too, and never offered, even by a mode that allows `"*"`;
  - a game module named `debug` is refused;
  - `debugStepsOf` counts the snapshot and the log.
- **runner:** `replayRecording`:
  - every step the same;
  - a changed start;
  - a step refused;
  - a step that differs, with its slice, path and both values.
- **ui:**
  - `/play/`'s `resumeFrom` refuses a save with a debug step, of edition `play`, and loads it when opened with `debug`;
  - the save's summary carries `debug`.
- **editor:**
  - the recording: steps, cursor, the cap, the drop after a step mid-run;
  - the debug host's requests, on the hut, in Node;
  - the quests' why, on the hut.
- **e2e, the gate:** the hut in the Play panel, on desktop (`debug.spec.ts`), and by touch at 360, 390 and 844×390 (`debugPhone.spec.ts`):
  - played a few days, and +1 day, which brings the storm;
  - its state and log read, a debug step marked, the slot no longer saved out;
  - the loads quest's why read;
  - its stage set by an effect, and an effect run from the form;
  - a state kept and restored;
  - a step taken back and forward;
  - on desktop, the loads quest edited by its form, and Replay stops at the first step that differs, naming it; on phones, Replay of the project unchanged, every step the same.

## Open questions

1. **The log has no filter or search.** The hut's run is short. One is worth adding when a game's log runs to thousands of steps (research note, question 1).
2. **A named state is a save,** so Step back after a restore reaches only that save's log, at most 200 steps. Keeping a named state's whole recording with it would reach further, at the size of the recording.
