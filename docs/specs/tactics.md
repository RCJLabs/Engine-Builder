# Tactics

The tactics kit (M7.5, D87): Space-Wrecked's boarding fight on a 2D space's tilemap. Sides take turns; each unit has two action points to move, dash, shoot, watch, reload, open a door, steady a fallen friend or give its order. The rules are Space-Wrecked's, read rule by rule in [research/tactics.md](../research/tactics.md); this spec says how the engine holds them. Untested for feel until the deck is fought on a phone.

## Records

The kit's record types, as type files, joined when `project.json` turns `tactics` on. The stats kit must be on too: a unit's numbers are its actor's stats.

- **`battle-rules`**: the stats a battle reads and its numbers. `health`, `aim`, `defense`, `armor` and `mobility` name stats (`defense` and `armor` optional, 0 when left out). The numbers, each optional with Space-Wrecked's value when left out: `action-points` 2, `half-cover` 20, `full-cover` 40, `overwatch` 15, `flank-crit` 30, `close` 3, `mid` 7, `sight` 20, `bleed` 3, `forgiving-step` 10, `forgiving-most` 30.
- **`gun`**: what a unit shoots with. `damage` as least and most, `accuracy` at `close`, `mid` and `long`, `crit` (percent), `crit-damage`, `clip`.
- **`order`**: a crew member's order. `kind`, one of suppress, weld, patch, hustle, mark, sedate and kit; `uses`; and the one number its kind reads: `aim` (suppress, mark, sedate), `rounds` (weld), `hp` (patch), `ap` (hustle) or `armor` (kit).
- **An actor's fields**, added by the kit: `gun` (a gun) and `order` (an order). A unit with no gun can't shoot, watch or reload; one with no order gives none.
- **`battle`**: one fight.
  - `rules`: a battle-rules record.
  - `space`: a 2D space with a tilemap.
  - `crew` and `foes`: lists of `{actor, at}`, `at` an object of the space whose tile the unit starts on. An actor may stand in `foes` more than once; each is its own unit.
  - `first`: `crew` (the default) or `foes`.
  - `forgiving`, `permadeath`, `press`: as Space-Wrecked's options, all off when left out. `press` makes the foes press on when they see no one.
  - `win` and `lose`: effects, as an encounter's.
  - `falls`: a status given to a crew member who ends the fight out or dead.

## The slice

The `tactics` slice holds one battle at a time, or none, and the counts of battles fought, won and lost by battle. A battle holds:
- its record's id;
- the side to play, the side that plays first, and the round from 1;
- each side's misses in a row;
- its open doors and welds, each by an edge's key `"c,r,side"`, side `n` or `w`;
- its units, in the order they were set out.

A unit holds its id (`c1…` and `e1…`), side, actor, tile, hp and most hp, ap, ammo, uses, overwatch, status, bleed, mark, suppression, asleep and kitted. Its aim, defense, armor, mobility, gun and order are read from its actor at the start and kept, so a fight is fought on the numbers it began with.

The slice is version 1. A battle in play is saved with the game, as any slice is.

## Starting and ending

- **`start-battle {battle}`**, an effect: sets the units out on their objects' tiles, reads their numbers, pushes the `battle` mode and starts the first side's turn. Each crew member's hp is their health stat now; each foe's is its most. Its preview names the space, the crew and the foes.
- **The end:** when a side wins, the crew's health stats are set to what they ended on (a crew member out or dead to 0, and given `falls`); the counts go up; `tactics/won` or `tactics/lost` is raised; the mode is popped; and `win` or `lose` runs.

## Actions

The `battle` mode allows `tactics/*` only. Each action names a unit of the side to play.

| Action | Payload | Space-Wrecked's |
|---|---|---|
| `tactics/move` | `unit`, `to: [c, r]` | a move, or a dash when the cost passes mobility |
| `tactics/shoot` | `unit`, `target` | shoot |
| `tactics/watch` | `unit` | overwatch |
| `tactics/reload` | `unit` | reload |
| `tactics/steady` | `unit`, `target` | stabilize |
| `tactics/open` | `unit`, `side` | open |
| `tactics/order` | `unit`, `target` or `side` | the unit's order |
| `tactics/end` | none | end |

- **Options** list every action the rules allow now: a move to each tile `reach` gives, a shot at each foe it sees, and so on, in the units' order. A bot plays the crew through them.
- **The foes' turn** is played inside the step that hands it to them, by the AI, action by action, up to 100, then `end`. The crew's turn starting again is that step's end. Each action raises its beats as it goes, so the stage plays the foes' turn back from them.
- **A refused action** is refused, as any is, and changes nothing.

## Facts and events

- **Facts:** `tactics.in-battle`; `tactics.round`; `tactics.hit {unit, target}` and `tactics.crit {unit, target}`, from the same `shotOdds` a shot rolls; `tactics.fought`, `tactics.won` and `tactics.lost` by battle.
- **Events:**
  - `started`;
  - `turn {side, round}`;
  - `moved {unit, path}`;
  - `opened {unit, at, side}`;
  - `shot {unit, target, hit, roll, crit?, critRoll?, damage?, watch}`;
  - `down`, `dead`, `out`, `bled`, `steadied`, `ordered`, `welded`, `unwelded`, `woke`;
  - `won` and `lost`.

  They are kept for the turn just played, the foes' above all, so the stage can play them back.

## The rules in the engine

- **Core's tiles** (M7.2) gain:
  - **`withEdges(grid, open, welded)`:** the grid with its doors' state laid over it. An open door is no edge, so sight and cover pass it. A welded one is an edge that stops walking too.
  - **`reach(grid, from, budget, cost, blocks)`:** Space-Wrecked's `reachable`: buckets by cost, n, e, s, w, the first found keeping a tie, every held tile taken out at the end. A step's cost is 1; rubble's 2 waits for a map that has it (see Open questions).
  - **`stepsFrom(grid, sources)`:** breadth first from many tiles at once.
- **Range bands** by `dc × dc + dr × dr` against `close × close` and `mid × mid`: multiplication, since the sim may not use `**`.
- **Rolls:** the kernel's `rng('tactics')`. `percent(c)` is `int(0, 99) < c`, and damage is `int(least, most)`, drawn in Space-Wrecked's order: hit, then on a hit crit, then damage. The rules take their rolls through a small `Rolls` interface, so the golden test can feed Space-Wrecked's own generator through the same code.
- **The AI** is Space-Wrecked's, scored in whole numbers. A harm is counted in millionths, rounded down: `hit × Σ (weight × (min(dealt, hp) + 4 × kill)) × 100 ÷ rolls`, the weights `100 − crit` and `crit`. The score is `10 × attack − 8 × (threat + risk) − (shot ? 0 : 2 × 10⁶ × steps)`. Its thresholds scale the same way: 0.4 is 400,000 and 3 is 3,000,000. Ties go to the first plan, in Space-Wrecked's order. Near ties it may choose otherwise than Space-Wrecked; its own `ai.test.js` cases, ported, say where.
- **Not in M7.5:**
  - objectives (grab, hack) and the deadline;
  - hazards (fire, vacuum, rubble);
  - difficulty;
  - ranks and talents, which change an order's numbers: M7.7's;
  - automatic deploy by bridge and hatches.

## The stage

- **The battle reaches the stage** as `SpaceAsk.battle()`: the session's view of the slice.
  - The units, each with its tile, hp, ap, ammo, status and overwatch.
  - The doors open and welded; the round and the side.
  - The last turn's beats.
  - For each unit of the crew, the tiles it can reach with their costs, and the foes it sees with `tactics.hit` and `tactics.crit` for each.

  The odds are the kit's own `shotOdds`, called in the session as the sim calls it, so the odds shown are the odds rolled.
- **stage2d's battle controller,** on the page, is Space-Wrecked's `fight.js`:
  - A tap on a crew member selects them.
  - A tap on a tile they can reach previews the move, its path and its cost; on a foe they see, previews the shot and its odds. A second tap on the same, or Confirm, sends it.
  - Elsewhere, a tap clears the preview.
  - The foes' turn plays back from its beats, and taps wait for it.
- **The action bar:** the controller's own buttons over the space's box, 44 px at least:
  - Watch, Reload, Steady, Open, the unit's order, End turn;
  - Confirm and Cancel while a preview is up;
  - a list of the selected unit's targets with their odds, which the keyboard and a screen reader reach.

  The arrow keys move a tile cursor, Enter confirms and Escape cancels. A line says what is previewed and the foes' moves, in an `aria-live` region.
- **Drawing:**
  - stage2d's own drawer draws each unit on its tile, the preview's path and its target, and a unit's hp.
  - A stage drawn in code gets the battle and the controller's preview and selection in each frame's `world.battle`.
  - Either drawer returns the tile under the latest tap as `picked`, which the controller reads. The boarding deck's stage draws them with Space-Wrecked's painter.
- **The hook:** `window.__ebStage2d.battle()` gives the view, the selection, the preview and the beats played back.

## The editor

- **The kit's box in the Project panel**, whose types join Records.
- **Forms** for battle rules, guns, orders and battles; an actor's Gun and Order fields.
- **A battle's form** names its crew and foes by actor and object, offering only the objects of its space that stand on its tilemap.
- **The effect `start-battle`** is in the effect pickers.

## Checks

- **E096:**
  - a battle whose space has no tilemap;
  - a crew or foe whose object isn't in that space, or doesn't stand on a walkable tile;
  - two units on one tile;
  - an empty crew or foe list.
- **E097:** an order whose kind's number is missing.
- **W160:** a battle with a unit that has no gun.
- **E035:** the kit's references.
- **E058:** a battle on a 3D space.

## The gate

- **The kit's rules, one test each:**
  - reach (doors, welds, foes and allies, the order found);
  - the walk, with doors opened and overwatch firing partway;
  - each part of the odds, and the draws in order;
  - down, bleeding, out, steadied;
  - each of the seven orders;
  - a turn's end and start, and the win.
- **The golden battle:** Space-Wrecked's 16 actions on its example ship, fed its own generator through `Rolls`, give its 33 lines of `example-battle.txt` word for word. The test holds a copy of the log and the fixture under Space-Wrecked's NOTICE.
- **The AI:** Space-Wrecked's `ai.test.js` and `orderAi.test.js` cases, ported.
- **200 seeds of the boarding fight,** the crew by the kit's AI and the foes pressing, each kept to the rules' invariants after every action. The crew's wins are recorded as a reading.
- **`eb validate`** finds the boarding fight clean, and breaks it once each for E096, E097, W160 and E058.
- **The boarding fight played** in the Play panel:
  - by mouse and keys at 1280: a move previewed and confirmed; a shot whose odds on screen are `tactics.hit`'s; overwatch set and fired; the foes' turn played back; the fight won;
  - by touch at 360, 390 and sideways;
  - as one exported file, from `file://`.
- **A battle made with forms alone** at 1280 and 390, then fought.
- **Budgets:** stage2d.js and the editor's start within theirs.

## Open questions

1. Rubble, fire and vacuum: a tile rule with its own bit, which pack format 18's one hex digit a cell has no room for, or a battle's own list of tiles? For Proof #3's damaged ships (M7.10).
2. Do the crew start where their walkers stand, rather than on a battle's objects? Proof #3's boarding starts mid-walk.
3. Should an order's numbers rise with rank here, or wait for M7.7?
4. The AI in whole numbers: where does it part from Space-Wrecked's doubles?
