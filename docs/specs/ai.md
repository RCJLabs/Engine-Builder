# AI: the clock, behaviours and perception (M6.3)

How a walked space's NPCs keep a schedule, pick what to do and notice the player, as D75 settles
it: the clock runs while the player walks; the sim picks each NPC's activity and the stage walks
it; behaviours are records of nodes, edited as an outline; NPCs see and hear, and an awareness
ladder climbs and decays. Research: [docs/research/ai.md](../research/ai.md). It builds on
[navigation](navigation.md) (goals and arrivals) and [time](time.md) (calendars and timers).

## The clock

- **project.json** `"clock": { "rate": 20 }`: game seconds a real second, a whole number from 0 to
  3,600. With the time kit on and a space in the project, the clock runs at 20 when `clock` is left
  out; 0 stops it. Without the time kit there is no clock: a `clock` is E080.
- **A tick** lasts `86,400,000 / (ticksPerDay × rate)` real milliseconds, which must be a whole
  number: at 20, a calendar of 1,440 ticks a day (a tick a minute) ticks every 3 s, and the time
  kit's own calendar (a tick a day) every 72 minutes. A `clock` given that can't is E080; one left
  out that can't stays still, with W149 saying why.
- **Packs** carry it from format 12 as the pack project's `clock: { rate }`, only when it runs: every
  pack without one keeps its format and golden hash. The time kit then joins the game with real time
  (`msPerTick` from the rate, a cap of 2,000 ms), so `time/elapse` exists.
- **The walk sends** `time/elapse { ms }` through its outbox once a real second while it runs,
  whole milliseconds, never under a screen or the shell's pause, and once more as it pauses. What a
  dropped one carried is owed to the next, so no time is lost or counted twice; the time module
  carries what falls short of a tick. Like the other stage actions it is never on offer, and the
  session lets it past its guard. No elapse carries more than the 2,000 ms cap: the rest stays owed.
  One elapse waits at a time (M7.1): what is walked meanwhile rides on the next, and a pause asked
  while one waits sends the rest as soon as it is answered.
- **Rest and Wait** (the time kit's `wait` effect, from any action) still jump the clock.
- **On a HUD:** with an `hours` unit the time kit gives `time.hour`, the hour of the day a guard's
  `hours` reads, and with `minutes` too `time.clock`, the face as `"09:05"`.
- **One step at a time.** The stage's steps (the elapse, the senses' reports, the stands) and the
  player's presses share one line to the game's worker. A stage step that comes while another is on
  its way is dropped, for its outbox to try again; a press waits for it, the latest kept, so a press
  is never lost to the clock, and the screens' buttons are disabled only while a press of the
  player's own is on its way. They come back as the press lands, in the one render with its view,
  since a screen gives focus back to a button as the view changes and a disabled one can't take it.

## Behaviours

- **The ai kit** (`"kits": [..., "ai"]`) needs the stats kit (actors are its) and the time kit
  (schedules are hours). Its module, `ai`, is pure, saved and runs headless.
- **An actor's fields** with the kit on: `behaviour`, a behaviour record; `sight`, metres (15 when
  left out, 0 blind); `cone`, degrees (120); `hearing`, metres (10, 0 deaf). An actor with no
  behaviour stands where it was placed, and `walk-to` still sends it (M6.2).
- **A behaviour record** (`records/behaviour/<id>.json`) has a `name` and a `do`, one node:

  ```json
  {
    "name": "The smith's day",
    "do": { "first": [
      { "hours": [8, 18], "do": { "work": "forge" } },
      { "hours": [22, 6], "do": { "sleep": "bed" } },
      { "do": { "sandbox": ["bench", "well", "stall"], "dwell": { "minutes": 20 } } }
    ] }
  }
  ```

- **Nodes** that choose:
  - `{ "first": [nodes] }`: the first child that holds, in order (Bethesda's package list, a tree's
    selector).
  - `{ "in-order": [nodes] }`: its children one after another, each as the one before finishes; after
    the last it stays there, and goes from the top again the next time it is chosen (a tree's
    sequence). A patrol is what goes round and round.
  - A guard, `{ "if": "<condition>", "hours": [from, to], "days": [weekdays], "cooldown": length,
    "do": node }`, with any of `if`, `hours` and `days`: it holds while each one given holds. `hours`
    are the calendar's `hours` unit, from inclusive to exclusive, the second before the first running
    past midnight; `days` are its weekdays. Once the sim leaves a guard with a `cooldown`, it doesn't
    hold again until that long has passed.
- **Leaves**, the packages and three actions. Points are objects of the actor's space, as `walk-to`'s
  are; lengths are in the calendar's units, as `wait`'s are:
  - `{ "travel": point }`, `{ "sleep": point }` and `{ "work": point }` walk there and stay. They
    finish on arriving; sleep and work only read differently (`ai.doing`) until M6.5's poses.
  - `{ "patrol": [points], "dwell"?: length }` walks the points in order and round again, waiting
    `dwell` at each. It never finishes.
  - `{ "sandbox": [points], "dwell": length }` walks to a point drawn from the NPC's own stream
    (`ai/npc-<actor>`), never the one it stands at, waits `dwell`, and draws again. It never finishes.
  - `{ "follow": "player", "distance"?: metres }` keeps within 2 m (or `distance`) of the player. It
    never finishes.
  - `{ "wait": length }` stands still that long, then finishes.
  - `{ "face": "player" }` stops and turns to the player, and finishes at once.
  - `{ "effects": [effects] }` runs them, as a row's, and finishes at once.
- **`@self`** in a guard's `if` and a leaf's effects is the actor running it, as `@slot` is a quest's
  record (M3.10): `ai.level(@self) = alerted`.
- **Choosing.** The sim works out each NPC's running leaf as a new game starts and again after every
  event (the module hears `*`, as the quests kit does), actors in id order. It walks down from `do`:
  a `first` takes its first child that holds, a guard its `do` while it holds, an `in-order` its
  current child; a leaf always holds. A leaf newly chosen starts: a walking one gives the NPC its goal
  through the world module (`walk-to`, `follow` or `stand`), the others start their wait or run their
  effects. A leaf still chosen goes on and never starts again, so a guard's effects run once each time
  it comes to hold. When an `in-order`'s child finishes, the next starts in the same check, and one
  check starts each leaf at most once. When nothing holds, the NPC stands where it is.
- **Arrivals and time.** Arriving at a leaf's point (`world.npc-at`, which `world/npc-arrived` sets)
  finishes travel, sleep and work and starts a patrol's or sandbox's dwell; time passing ends dwells
  and waits that are due. Both come with events, so a check follows. Ticks count from the game's
  start, as the time kit's do.
- **Its state** is the ai slice: each NPC's running leaf (as a path of child indices, `0.2.0`), its
  place in a patrol or an `in-order`, when its dwell or wait ends, its cooldowns, and its awareness.
- **Facts:** `ai.doing(actor)`, the running leaf's kind (`sandbox`, `patrol`, `travel`, `sleep`,
  `work`, `follow`, `wait`, `face`, `effects`); `ai.awareness(actor)`, 0 to 100; `ai.level(actor)`,
  `unaware`, `suspicious` or `alerted`. **Events:** `ai/doing { actor, doing }` as the running leaf
  changes; `ai/aware { actor, level }` as the level does.

## The world module at version 4

- **Two effects beside `walk-to`**, for behaviours and for any content: `follow { actor, distance? }`
  sends a placed actor after the player, and `stand { actor, facing? }` stops it where it is, turned
  to the player with `"facing": "player"`. Each replaces the others' goal. Neither has an arrival.
- **The slice** keeps them on each NPC as `follow` (metres) and `facing`. A version 3 save loads with
  none, and `square-world-v3.json` must keep loading.
- **The stage** walks a follower's agent towards the player, standing once within its distance, and
  turns a standing NPC with `facing` to the player as M6.1's talk does.
- **Far NPCs.** An NPC built after its space was entered or loaded, as the player comes near, starts
  at its goal (or beside the player, following) and its arrival is said at once: a far NPC is wherever
  its schedule says. One built as the space is entered or loaded starts where it last stood (M6.2).

## Perception

- **The stage checks** each built NPC with a behaviour five times a second. It sees the player when
  the player's chest (1.2 m up) is within its `sight`, within half its `cone` of the way it faces,
  and a ray from its eyes (90% of its height) to the chest meets no solid. It hears the player's
  noises within both the noise's reach and its `hearing`: running (6 m, once a second at most),
  landing from a fall (5 m) and Interact (4 m).
- **Said to the sim** once a real second while the walk runs in a space with such an NPC, through
  the outbox: `ai/sensed { space, ms, npcs: { <actor>: { seen?: [cm…], heard?: n } } }`, each
  sighting's distance in centimetres and the noises heard. Never on offer, let past the session's
  guard. A report for a space the player isn't in is refused. One report waits at a time (M7.1):
  those made meanwhile are held as one, their time added and each NPC's sightings and noises joined
  within what the sim takes (2,000 ms, the newest 12 sightings, 20 noises).
- **Awareness**, a whole number from 0 to 100 an NPC, kept by the sim:
  - Each sighting adds `2 + ⌊6 × (sight − d) / (sight − 100)⌋` (d and sight in cm), from 8 at arm's
    length to 2 at the edge: 40 a second close by, 10 far off.
  - Each noise heard adds 20.
  - An NPC of the space the report doesn't name loses 1 for each 200 ms: 5 a second.
  - Unaware below 30, suspicious from 30, alerted from 70. Behaviours, sheets and talks read
    `ai.level` and `ai.awareness`.

## Checks

- **E080:** project.json's `clock` without the time kit, a rate that isn't a whole number from 0 to
  3,600, or one the calendar's ticks can't split into whole milliseconds.
- **W149:** no `clock`, the time kit on and a space, and a calendar that can't run at 20: the clock
  stays still.
- **E081:** a behaviour's node that can't run for an actor using it: a point its space lacks, a
  walking leaf in a space with no navmesh, `hours` with a calendar that has no `hours` unit or past
  its day, a weekday or a unit the calendar lacks, an empty list, or `follow` of anything but the
  player. An actor with a behaviour that stands in no space is E081 too.
- **W148:** a behaviour no actor uses.
- **E044** for a `@self` outside a behaviour; conditions and effects inside one are checked as a
  row's are, `@self` as an actor.

## The editor

- **The Project panel** has the AI kit's box, which turns on stats and time with it, and with the
  time kit a Clock under the calendar: its rate, left empty for 20, W149 and E080 at it.
- **A behaviour's form** shows its tree as an outline: a row a node, indented under the node that
  holds it, each in words ("Between 08:00 and 18:00", "Work at forge", "First that holds"). Choosing
  a row shows that node's fields below it: points picked from the actor's space, lengths in the
  calendar's units, the condition and the effects as a sheet row's. Add, Remove, Move up, Move down,
  and Wrap (put a node inside a new guard, `first` or `in-order`) are each a step of undo, with
  44 px targets, at 360 px wide; so are Unwrap and a step's kind, changed with a button so an arrow
  key in the select never throws a step's nodes away. Each problem shows at its step's row and at its
  field. The JSON stays editable as a record's is.
- **Effect lists** offer follow and stand beside walk-to once an actor stands in a space, each with
  its form: who, and a follower's distance or whether one standing faces the player.
- **An actor's form** has Behaviour, Sight, Cone and Hearing with the kit on.

## The gate

- **The village** (`tools/cli/test/fixtures/village`), a calendar of 1,440 ticks a day and the clock at
  its default:
  - a smith who works at the forge from 8 to 18, sleeps in the cottage from 22 to 6 and wanders the
    green between;
  - a guard who walks the walls from 20 to 6 and stands at the gate between, faces a player they are
    suspicious of, and halts one they are alerted to with a talk.
- **Headless:** `village.test.ts` builds it as format 12, breaks it once each for E080, E081, W148
  and W149, and plays a whole game day through the session: each NPC's leaf at each hour, arrivals
  from a test's walker, a save mid-patrol loaded to the same leaf. The editor's `village.test.ts`
  walks the day through Recast with the crowd, and senses through Rapier: a player behind the guard
  unseen, before them seen, behind a wall unseen, running near them heard.
- **In the Play panel:** `village.spec.ts` by keys, `villagePhone.spec.ts` by touch at 360, 390 and
  sideways: the clock running on the HUD, Wait jumping it to the evening and the smith going home,
  a walk up behind the guard unnoticed, and a run there making them suspicious; turned to the
  player, they see them, grow alerted and halt them. (Suspicion can't be held apart from the alert
  near a guard: one who turns to a noise sees whoever made it close enough to be heard.)
- **In the editor:** `aiEditor.spec.ts` brings the village in without the guard's behaviour and
  makes one in the outline alone at 1280 and 390 wide (Only when suspicious, face the player; Only
  from 20 to 6, patrol two corners of the walls; work at the gate), then plays it: the gate by day,
  the walls once Wait has made it evening.

## Open questions

1. NPCs travelling between spaces on a schedule (each actor stands in one space today, E077).
2. Combat (M6.4) on the same trees: when an alerted NPC attacks rather than halts.
3. How a sleeping or working NPC looks before M6.5's animation: a pose, or only where it stands.
4. Following an actor rather than the player, and turning towards a noise heard.
5. Whether 20x suits a game whose days the player should feel pass, untested for feel.
