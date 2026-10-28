# M7.6's builder: placement in play, and what a daily pass would take

A survey for M7.6 (2026-10-28), read only, nothing run. It goes deeper than [kits-iii.md](kits-iii.md#base-and-colony-builder), which listed the sources. Paths: **SW** is `space-wrecked/`, **AG** is `afterglass/prototype/src/slice/`, **LN** is `landnam/src/sim/colony.ts`. Line numbers are as read on 2026-10-28; three were checked by hand (SW `builder.js:68-91`, `colonyBuild.js:130-157`, AG `sim.js:4293-4350`).

## The sources

- **SW's ship builder** (`src/sim/builder.js` 482, `modules.js` 66, `constraints.js` 194, `mapFromShip.js` 163).
  - A module is a footprint `size`, whether it `rotates`, a side it `facesSpace`, `stats` (power, mass, thrust, berths, life support, cargo, hp), `tags` and a `cost` (`data/modules.json:22-56`). The frame holds the cap, the bounds and an optional shape (`data/frames.json:3-11`, `frame.js`).
  - `placementError` (`builder.js:68-91`) refuses, first failure first: an unknown frame or type, a rotation not 0 to 3, a turn on a part that can't turn, the frame's cap, then cell by cell a cell past the edge or one taken ("…would overlap Reactor at (0, 3).", with the part in the way). Connection and the airlock are left to the whole layout, so a ship can be half built.
  - `layoutProblems` (`:425-474`): no bridge; a part not joined to the bridge through shared walls; no airlock on open space; a part whose facing side isn't open space. Open space is an empty cell flood-filled from the edge, less a notch with three taken sides (`:359-372`).
  - `joins` (`:260-319`) makes the doors: corridors open to each other along their whole edge; any other shared wall gets one door at its middle (the left or upper of two); none on a facing side; an airlock gets a hatch on each side that meets space.
  - The flight checklist (`constraints.js:37-164`): six lines (power, thrust to mass, berths, life support, the parts a ship must have, the layout), each with its fix ("Add 2 × Reactor (+8 power each)", "Join … to the bridge"). The part a fix names is the first in the data that gives the stat. Thrust to mass compares floats with `1e-9`; as a fraction it becomes `thrust × den ≥ num × mass`.
  - `mapFromShip` (`:42-131`) turns a layout into a battle map: each cell's tiles from the module's turned `interior`, outside cells space or hull, edges door, wall, hatch or hull. These are M7.2's map text and the starter tileset's legend already.
- **SW's colony** (`colony.js` 375, `colonyBuild.js` 197, `days.js` 138). The same builder on a site grid with the opposite rule: every building keeps a cell of path round it (`siteError`, `colony.js:252-273`). Each action is planned before it is applied: `buildPlan`, `movePlan`, `takeDownPlan` return the cost, what it gives or why not (`colonyBuild.js:31-157`), and the build list plans every row so each shows its cost or its reason. A move is free and keeps the building's place in the power order. Taking down gives the full cost back, kept only while the stores have room, and names the buildings that would go dark. The day (`days.js:61-137`) is whole numbers throughout: make, eat, hunger and healing, stores capped, the day counted. Power goes out in build order while it lasts.
- **AG's keep** (`sim.js`, about 300 of its 5,390 lines). `raise` (`:4242-4258`) only on a bare hall or a new top floor, at 6 stone, more for a new floor and more again above the seventh; some rooms only high up, the Gatehouse only at the gate. `teardown` (`:4293-4325`) gives back half of the base cost, whatever the room cost, and sends workers past the new cap to the Yard. `moveRoom` (`:4328-4350`) swaps two places for 2 stone and skips the high-room rule. Jobs are pooled by room type, 3 to a room (`:4190-4204`, `:631-634`). The day runs every tick in floats, with seasons and starvation.
- **LN's colony** (`colony.ts` 649): a build queue paid when queued, `after`, `replaces` and `needs` as prerequisites, output scaled by skill and season. No placement.

## One rule set for both views

A site is a grid: a tilemap's columns and rows (top-down), or a building's slots and floors (side view). A footprint is columns × rows, `[span, 1]` in side view. Shared by both: the type, its cost, the site's caps, the bounds, overlap, a buildable's own "where" rule, plan then apply, a refund, a move's cost, and connection to a root. They part at:

1. **Turning and facing:** top-down only.
2. **Doors between neighbours:** top-down writes the tilemap's edges as `joins` does; side view has none between rooms (rooms.md) and joins floors only by stairs.
3. **Connection:** shared walls back to a root (the bridge) top-down; stairs from the ground in side view, which W158 already checks.
4. **Growth:** side view can add a floor; a tilemap's size is fixed.
5. **Outside:** the flood fill top-down; the top floor or the ground in side view.
6. **Touching or a path round:** the ship needs shared walls, the colony forbids them. A site setting.

## What the engine lacks

- **The layout in the save.** Tilemaps (format 18) and buildings (format 19) are packed and fixed. A layout built in play is a world slice laid over the packed one, as M7.5's open and welded doors already lie over the grid. A slice version, a migration and a fixture; the stage draws the sim's layout, not the pack's.
- **Buildable records** with a footprint, cost, tags, what it gives, where it may stand, and caps per site.
- **Plan, then apply,** for build, move and take down, each a preview the bar shows before a second tap confirms (the tactics bar's pattern).
- **Ghosts on the stage:** stage2d and a stage in code draw a footprint where it would go, tinted by whether it can.
- **The checklist:** lines as data over a site's summed stats.
- **A daily pass** in whole numbers, jobs and production, if it comes in this milestone.

## Calls for Evan

1. **The split:** placement and the daily pass in one milestone; placement now (build, move, take down, costs, footprints, rules, the layout in the save) and jobs, production and the daily pass as the next milestone; or placement only, production left to the templates. Recommended: two milestones, so M7.7 is the daily pass and the squad and tower defense move to M7.8 and M7.9.
2. **The views:** top-down, side view, or both on one rule set. Recommended: both, since the shared core is most of the work and D85 promised rooms raised in play.
3. **The demo:** Space-Wrecked's example ship built in play on its hull, and the keep's tower raised a room at a time. Recommended: both, one for each view.
4. **The checklist:** Space-Wrecked's flight checklist as data now, each failing line naming its fix, or with Proof #3. Recommended: now, since a ship that can't say why it won't launch isn't a builder.

## Open questions

1. Does the save's layout lie over the packed tilemap or building, or replace it once built on?
2. Is a refund a share of what was paid, kept per building, or of the base cost? Leaning to what was paid: AG's flat half lets a dear room come back cheap.
3. Does a floor raised in play bring its own stairs, or must the player place them?
4. Should afterglass's `moveRoom` gap (a high room swapped low) be copied or closed? Leaning to closed: a move is checked as a placement.
5. In a daily pass, are jobs pooled by room type (AG) or held per building?
6. Is production whole units with a floor (SW's `least`) or hundredths?
