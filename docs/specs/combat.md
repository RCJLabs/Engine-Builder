# Combat: strikes, shots, falls and bodies (M6.4)

How a walked space's fights work, as D76 settles it: a swing or an arrow that physically reaches
its target always hits, and the sim takes the weapon's damage less the target's armour; the player
aims softly, toward the foe in front; a fallen NPC lies as a body to search, and a fallen player is
offered their last save; an NPC fights by closing, winding up and striking, at most two at once.
Research: [docs/research/combat.md](../research/combat.md). It builds on [ai](ai.md) (behaviours
and awareness), [stats](stats.md) (pools and gear) and [encounters](encounters.md) (the `combat`
record).

## The kit

- **The fighting kit** (`"kits": [..., "fighting"]`) needs the stats kit (health is a pool), the
  gear kit (weapons are worn) and the encounters kit (its `combat` record says which stats a fight
  reads). Its module, `fighting`, is pure, saved and runs headless.
- **project.json** `"fighting": { "player": "<actor>", "combat": "<combat>" }`: the actor who is the
  player in a walked space, and the combat record whose `health`, `damage` and `armour` real-time
  fights read. Its `hit`, `dodge` and the rest are the turn-based kit's alone (D76: contact always
  hits). Both are needed once a project has a space: E082 when either is missing or names nothing.
- **The player's bag is the party's**, as before; the player actor's stats, slots and what it wears
  are the player's.

## Weapons

An item, with the fighting kit on, gains an optional `weapon` group. What an actor wears with one
is its weapon (the first such slot, by slot id); one wearing none fights with fists.

| Field | Kind | |
| --- | --- | --- |
| `kind` | `melee` or `ranged` | |
| `damage` | int 1–999 | added to the wielder's `damage` stat, when the combat record names one |
| `reach` | number, m | melee: how far a swing reaches from the wielder's centre (2 when left out) |
| `arc` | int 10–360, ° | melee: how wide (100 when left out) |
| `windup`, `strike`, `recover` | int ms | melee: before the swing can hit, while it can, and after (250, 150, 350) |
| `range` | number, m | ranged: the farthest the wielder aims (30 when left out) |
| `speed` | number, m/s | ranged: the arrow's speed as it leaves (40) |
| `draw`, `recover` | int ms | ranged: before it looses, and after (500, 400) |
| `ammo` | ref item, optional | ranged: what each shot takes from the player's bag |

**Fists:** melee, damage 1, reach 1.2, arc 90, windup 200, strike 100, recover 300.

## A hit

- **The stage finds it.** A melee swing hits, at most once each, every body Rapier finds within its
  reach (a sphere round the wielder's chest) whose chest lies within half its arc of where the
  wielder faces and has a clear ray from the wielder's chest, on any fixed step of its strike
  window. An arrow is a point moved on the walk's fixed steps under gravity (9.81 m/s²), a ray cast
  from where it was to where it is: the first body it meets is hit, a solid stops it, and it is gone
  after 3 s.
- **The sim resolves it.** `fighting/hit { by, on, weapon }` (never on offer, let past the
  session's guard like the stage's other actions) is refused when either has fallen, when they are
  not both in the current space, when `by` doesn't wield `weapon` (fists are `""`), or when `by` is
  an NPC not fighting. Accepted, it takes `max(1, damage + by's damage stat − on's armour stat)` off
  `on`'s health with the stats kit's `damage-stat` and raises `fighting/hit { by, on, hurt }`.
- **Odds on screen:** there are none to show. A hit that connects lands, and its hurt is the
  preview's: `fighting.hurt(by, on)` is the fact a screen shows.
- **A shot** takes its ammo as it looses: `fighting/loosed { weapon }` takes one `ammo` from the
  party's bag, refused when there is none, and the stage looses only what the sim took. NPCs shoot
  without ammo; what they carry is theirs to be searched for.
- **Being hit** alerts: an NPC the player hits has its awareness set to 100 (the ai kit hears
  `fighting/hit`), and its behaviour decides whether it fights.

## A fall

- **When health runs out** (the stats kit's `emptied` for the combat record's health), the actor
  falls: the kit keeps it in its `fallen` list, raises `fighting/fell { actor, by }`, rolls the
  actor's `drops` (a loot table, optional) into its own bag, runs its `on-fall` effects (optional)
  and, for an NPC, the world module's `fall`. A fallen NPC's goal is cleared and its behaviour no
  longer runs.
- **A body.** The stage lays a fallen NPC down where it fell (its figure on its back; animation is
  M6.5's), takes its capsule out of the way and gives it the engine's Search use. Interact on it is
  `fighting/search { actor }`: everything in its bag moves to the party's bag, each line toasted,
  "Nothing left" when it is empty. Taking item by item waits for M6.6's containers.
- **The player falling** stops the walk and the game: the kit pushes its `fallen` mode, where no
  action is on offer, the session's view says `fallen`, and the shell draws its Fallen screen,
  offering the slot's arrival checkpoint and Title. The player actor's `on-fall` effects run first,
  so a game can fail a quest or make it an ending.
- **The arrival checkpoint** (D76): beside each slot's save, the shell keeps the save made as the
  player came into their space (the world module's `arrived`) and as the game began or loaded, under
  its own key, `checkpoint/<slot>`; the save made by the fatal step is never kept. Fallen's button
  says where it goes back to: "Back to the camp".

## Aiming

- **Soft aim.** As a swing or a draw starts, the player turns toward the nearest standing foe
  within 30° of where they face and within the weapon's reach (melee, plus 0.5 m) or range (ranged),
  over the wind-up; with none, they strike straight ahead. An arrow is aimed at the target's chest,
  its angle raised for the drop at that distance; with no target, along the camera's view.
- **A foe** is any standing NPC with the combat record's health stat.
- **Controls.** Attack: a click (once the pointer is locked) or F; a pad's west button (X on
  Xbox); on touch an Attack button beside Jump, at least 56 px. Held between swings, it swings
  again as the last recovers.

## An NPC fighting

- **The attack leaf** `{ "attack": "player" }`, in the ai kit's behaviours with the fighting kit
  on: the NPC fights the player while it is chosen. Its goal is the world module's `attack { actor }`
  effect, beside `walk-to`, `follow` and `stand` (the world slice at version 5); not `fight`, which is
  the encounters kit's turn-based fight.
- **Two at a time.** The world module engages at most two NPCs on the player, in the order they
  were sent to fight; one that falls or is given another goal frees its place for the next, the
  longest waiting. An engaged melee NPC closes to its
  reach less 0.3 m, winds up (seen: its figure leans back and its weapon's colour brightens for the
  wind-up), strikes and recovers; one not engaged circles at 5 m. An archer stands where it is while
  it can see the player within its range, draws and looses; otherwise it closes.
- **The stage times it** on the walk's fixed steps; the sim only hears the hits, so a headless run
  through Rapier in Node fights the same as the page.

## State and saves

- **The fighting slice** at version 1: `{ fallen: [actor], searched: [actor] }`, the player among
  the fallen once they fall.
- **The world slice** at version 5 adds to each NPC `fight` (its turn: the order it was sent to
  attack, which an attack sent again keeps) and `down` (fallen, set by the world module's
  `fall { actor }`, which clears its goal). `world.npc-engaged` reads the first two standing by turn. A version 4 save
  migrates with neither, and `village-world-v4.json`, saved by version 4, keeps loading.
- **Packs** carry project.json's `fighting` from format 13, only with the kit on.

## Checks

- **E082** project.json's `fighting`: missing with the kit on and a space, its `player` not an
  actor, its `combat` not a combat record; and the player actor placed in a space (the player isn't
  an NPC).
- **E081** gains the attack leaf with the fighting kit off.
- **W150** an actor with an attack leaf that wears no weapon: it fights with its fists.
- **W151** a weapon's field its kind doesn't read: a reach, an arc, a wind-up or a strike on a ranged
  weapon; a range, a speed, a draw or ammo on a melee one.

## The editor

- The Fighting kit's box; the Project panel's Fighting form (Player, Combat); an item's Weapon
  group; an actor's Drops and On fall; the behaviour outline's Attack the player.

## The gate

- **The camp** (`tools/cli/test/fixtures/camp`): a clearing with a tent and a fire, three bandits
  (two with swords, one with a bow) who wander until alerted and then attack, and a hero with a
  sword, a bow and ten arrows.
- **Headless:** `camp.test.ts` fights it through the session, and the editor's `camp.test.ts`
  through Rapier and Recast in Node: the third bandit circles while two strike, each falls, each
  body is searched, and in a second run the hero falls and the save loads.
- **In the Play panel:** by keys and the mouse, by a pad, and by touch at 360, 390 and sideways.
- **In the editor:** a bandit made with a weapon and an attack behaviour alone, at 1280 and 390.

## Open questions

1. Blocking and dodging (Evan chose without them for M6.4).
2. NPCs fighting each other, and factions turning hostile when struck.
3. Taking item by item from a body (M6.6's containers).
4. Lead on a moving target for arrows.
5. Whether the 30° soft-aim cone and the wind-ups feel right, untested for feel.
