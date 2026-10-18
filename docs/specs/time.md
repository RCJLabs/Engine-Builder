# Spec: time

This is exactly how game time works, in `packages/core/src/time/`, and the kernel's `ctx.attempt`, which timers rely on ([sim.md](sim.md#attempts)). A port must follow it to reach the same tick, fire the same timers in the same order and settle the same offline time.

It keeps what held up in the existing games and avoids what went wrong in them:

- **The sim never reads the clock.** spliceworld, 2060td, chooser-of-the-dead, dirtbag, climbing-world-traveler, space-wrecked and landnam all pass `now` in from the shell, and climbing-world-traveler's lint bans `Date.now` in its sim.
- **Anything that outlives a reload is an absolute due time:** spliceworld's events, 2060td's `endsAt`, landnam's `Voyage.due`, climbing-world-traveler's heal dates. rule-or-drool's delayed cards are `dueAt = cardCount + delay`: the oldest due fires first, ties go by insertion order, and a card whose condition no longer holds is dropped. Timers here work the same way.
- **One clock, one calendar.** spliceworld ended up with three day boundaries in one game, and dirtbag's audit found three calendars and five night paths that disagreed.
- **Outcomes happen when they were due,** not when they were noticed. spliceworld's R65 stamped outcomes with `now` instead of `endedAt`, and its R78 replayed a gap in two passes and skipped a month. Here a timer fires with the clock at its due tick, in one pass in due order.
- **Elapsed time is counted once, and only forwards.** spliceworld's R64 counted two elapsed clocks and brought a closed app back $760 richer. 2060td's decay cursor advances only by the time it charged, so settling twice costs nothing and a backwards clock earns nothing.
- **Caps.** 2060td caps offline time at 8 hours. project-ascent clamps a frame at 250 ms and carries the remainder; 2060td caps at 100 ms, afterglass at 0.25 s.

## The model

- **One count.** Time is one whole number, `time.tick`, from 0 when the game starts. The calendar says what a tick is: an hour, a minute, or a whole day.
- **Time moves only when an action moves it.** Nothing in the sim reads a clock. There are three ways:
  - a game's own action applies `wait`, as salvage run's jump waits a day;
  - the stage dispatches `time/advance`, for an "end turn" button or the editor's time controls;
  - the stage dispatches `time/elapse { ms }` with the wall-clock time since it last looked, for real-time play and for time that passed while the game was closed.
- **What a game picks.**
  - A turn-based game sets a tick to a turn or a day and waits in its own actions.
  - A real-time game sends each frame's milliseconds to `time/elapse`, with a cap of about a frame so that nothing piles up while it is hidden.
  - An idle game sends the time since it was last open, with a cap of hours.

## Calendars

`calendarOf(def)` checks a calendar and throws on a programmer error. `dateAt(calendar, tick)` reads a tick.

| Field | Means |
| --- | --- |
| `ticksPerDay` | Ticks in a day: 24 when a tick is an hour, 1 when a tick is a day. |
| `units` | More named lengths in ticks, like `{ "hours": 1, "weeks": 168 }`. `ticks` and `days` are always there. |
| `phases` | Parts of the day by the tick they start at, in order. The last runs past midnight into the first. |
| `weekdays` | The days of the week, in order. The game starts on the first. |
| `months` | The months in order, with their days. Their total is the year. |
| `daysPerYear` | The year's length, for a calendar without months. |
| `seasons` | Seasons by the day of the year they start (from 0), or by `{ month, day }` (day from 1). The last runs past the year's end into the first. |
| `start` | Where the game starts: `year` (from 1), `day` of that year (from 0), `tick` of that day. |

`dateAt` gives `tick`, `day` and `ofDay`, plus `phase`, `weekday`, `year`, `dayOfYear`, `month`, `dayOfMonth` and `season` when the calendar defines them:

- **`day`** counts days since the day the game started on. A start at dusk reaches day 1 at midnight.
- **Wrap-around.** A phase or season that starts later in its cycle runs on past the end: night continues past midnight, and winter past the new year.
- **No real-world dates.** A game's calendar is its own: no leap years, time zones or daylight saving, and no `Date`. All of it is whole-number arithmetic, the same on every device.

A test walks every tick of four years of a small calendar with a counter that carries hour into day, weekday, month and year, and holds `dateAt` to it.

`ticksOf(calendar, { "days": 2, "hours": 3 })` adds up a duration in ticks. It throws on a unit the calendar lacks or a count that isn't a whole number from 0. Months and years are not units: they differ in length, so "after a month" has no single meaning.

## The time module

`timeModule({ calendar, realTime?, timers? })` makes the module, id `time`. Its slice:

```json
{ "tick": 75, "carry": 400, "next": 3,
  "timers": [{ "id": "debt", "due": 96, "effects": [{ "effect": "credits", "delta": -15 }], "seq": 2 }] }
```

**Actions**
- `time/advance` with a duration, `{ "type": "time/advance", "days": 1 }`. A unit the calendar lacks is refused with `bad-duration`.
- `time/elapse` with `ms`, only when `realTime` is given (below).

**Effects**

| Effect | Does | Preview |
| --- | --- | --- |
| `{ "effect": "wait", "hours": 8 }` | Moves time on, firing what falls due. | `{ to, fires: [{ timer, at, times }] }`: the timers already set that would fire, each once with a count. Not the ones their firings would add. |
| `{ "effect": "schedule", "after": { "days": 3 }, "every"?: {…}, "timer"?: "debt", "when"?: condition, "effects": [...] }` | Sets a timer. `after` must be at least a tick; `every` repeats it. | `{ due, every? }` |
| `{ "effect": "cancel-timer", "timer": "debt" }` | Removes the named timer, if there is one. | the effect as written |

**Facts**

| Fact | Domain |
| --- | --- |
| `time.tick` | int from 0 |
| `time.day` | int from 0 |
| `time.of-day` | int from 0 to ticksPerDay − 1 |
| `time.phase`, `time.weekday`, `time.month`, `time.season` | enum of the calendar's names, when it has them |
| `time.year` | int from 1, with a year |
| `time.day-of-year` | int from 0, with a year |
| `time.day-of-month` | int from 1, with months |
| `time.pending(timer)` | bool: a timer of that name is set |
| `time.left(timer)` | int from 0: ticks until it fires; no value when there is none |

**Beats:** `time/passed { from, to }` once per advance; `time/fired { timer, at }` before a timer's own beats; `time/refused { timer, at, reason }`; `time/skipped { timer, at }`; `time/scheduled { timer, due }`; `time/cancelled { timer }`; `time/capped { ms, counted }`.

**Events** (M3.1, [triggers.md](triggers.md)): `time/passed` and `time/fired` are declared, so trigger rows can react to them. `time/fired` is raised inside the timer's attempt, so a row hears it at the timer's tick, not at the end of the wait that reached it, and never for a firing that refused.

**Modes.** Each mode lists the actions it allows, `time/advance` and `time/elapse` included. A game whose time runs while a menu is open lists `time/elapse` in that menu's mode too; otherwise the stage's elapse is refused there.

## Timers

- **Due ticks are absolute.** A timer stores the tick it fires on, not a countdown, so nothing ticks down each step and a save needs nothing more.
- **Order.** Timers fire by due tick, then in the order they were scheduled.
- **The clock.** While a timer's effects run, `time.tick` is its due tick.
- **One attempt each.** Each timer's effects run as one `ctx.attempt`. A consequence that refuses, such as a debt the hold can't pay, is undone and reported as `time/refused`. The timer is used up, and time still passes. Without this, one refusing timer would refuse every action that moves time, for good.
- **Repeats.** A repeating timer is put back, `every` ticks after its due tick, before its effects run, so its effects can cancel it. A repeat never drifts: it counts from the tick it was due, not from when the advance happened to reach it.
- **Names.** A timer content didn't name gets `#n`, which no content name can clash with. Scheduling a name again replaces its timer, which is how a cooldown restarts.
- **Waiting inside a timer** moves time further, firing what falls due on the way. Time never goes back: an advance ends at its target or wherever a timer's wait took it, whichever is later.
- **A cap.** More than 10,000 firings in one advance throws, since a timer repeating every tick through a long stretch is a bug.
- **A condition** (`when`) is checked when the timer comes due. If it doesn't hold, that firing is skipped with a `time/skipped` beat, as rule-or-drool drops a card whose condition no longer holds. A one-off timer is then gone; a repeating one comes round again.
- **Sealing an outcome at launch**, as spliceworld's operations do, is content, not a feature: put the `schedule` inside a `roll`'s outcome, so the draw happens when the job starts.
- **Daily upkeep** in a fixed order, like landnam's `passDay` or ludus's `endWeek`, is a set of repeating timers due on the same tick, scheduled in the order they must run.
- **A trip that an event can cut short,** like landnam's road, dirtbag's multi-day trips and space-wrecked's expeditions, waits one day at a time in the game's action and stops when a consequence changes the mode. A single long `wait` fires everything due in it; the encounters it pushes queue up on the mode stack.

## Wall-clock time

`realTime: { msPerTick, maxElapseMs }` turns `time/elapse { ms }` on.

- **ms** must be a whole number; anything else is refused with `bad-elapsed`. A negative one is refused with `clock-went-back`, because a device clock set back must not run time backwards or forwards.
- **The cap.** At most `maxElapseMs` counts; the rest is dropped, with a `time/capped` beat. An idle game caps offline time at hours; a real-time game that pauses when hidden caps it near one frame.
- **The carry.** Milliseconds short of a whole tick carry over to the next elapse, so many short elapses add up to exactly one long one. A property test settles random stretches, with timers and dice, at once and in pieces, and gets the same state.
- **Where the clock is read.** The stage reads `Date.now()` and passes the difference. The sim never sees a timestamp, so a replay of the log reaches the same state whenever it runs. Epoch milliseconds don't change with time zones or daylight saving.
- **Time away.** A save keeps `savedAt` beside the state, not in it ([saves.md](saves.md)). After a load, the stage passes `time/elapse` with now − `savedAt`. A migration gets no clock, so it can never seed a field with the current time, which spliceworld's had to do because an empty one read as 1970.

## Schemas

`waitEffect(calendar)`, `scheduleEffect(effect, calendar)` and `cancelTimerEffect()` in `@eb/schema` go into a game's union of effects. Their durations take the calendar's units, so `{ "months": 1 }` or a schedule of no length fails when the project is built. A test checks that each schema accepts exactly the cases the time module runs.

## Proof

- **Calendar:** the four-year walk; wrap-around of phases and seasons; days counted from the start day; every malformed calendar throws.
- **Timers:**
  - order by due tick, then scheduling;
  - the clock at each due tick;
  - repeats, cancelling from inside, and replacing by name;
  - a firing skipped because its condition no longer holds, while the timer keeps repeating;
  - a refused consequence undone while time passes;
  - nested waits;
  - the firing cap.
- **Wall-clock:** carry, cap, refused deltas, and the at-once-or-in-pieces property over 300 random cases.
- **Salvage run** now counts days with the time module. A promise to raiders schedules a debt three days on, and can't be made again while one is pending (`time.pending`). The test plays 100 runs and checks every debt that falls due: paid when the hold has 15 credits, refused otherwise, with the day passing either way. Over 1,000 runs, 1,655 debts were refused.
- **Planted bugs:** 31, each caught by at least one test.
- **Readings:** offline settling, in ROADMAP's Readings.

## Open questions

1. **The cost of a refused attempt.** Each one runs the action again, so offline settling with many refusing timers costs refusals × firings. The bench shows 64 refusals in 8 hours of hourly timers take about 100 ms. Savepoints would be cheaper, at the price of stale references (sim.md).
2. **Absolute schedules.** "At the start of next spring" or "every Monday" needs `at:` rather than `after:`. Add it with the kits that need it (M3.4).
3. **Game speed.** Pausing and fast-forward belong to the stage, which scales or stops the milliseconds it passes. A sim-side speed setting would need to be in the state to replay.
4. **A frame helper.** Real-time play wants a stage-side loop that sends frame time and stops sending while hidden. It belongs with the player runtime (Phase 4).
5. **Dailies by real date.** A daily challenge keyed by the real calendar is a stage feature, and the games disagree on it. 2060td, sandbagged, rule-or-drool and wasteland-protocol use UTC days, and rule-or-drool's players in the Americas lost streaks without missing a local day. project-ascent, chooser-of-the-dead and afterglass use local dates, and afterglass's daily is "someone's today for about 50 hours". Decide when the first daily arrives.
