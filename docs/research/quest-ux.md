# Research: quest markers, maps, barter and containers

What the earlier games did for pointing a player at a quest's target, for a map of where they walk, for trading and for containers (M6.6 to M6.8, [D78](../decisions.md)). It adds to [missions.md](missions.md), [aliases.md](aliases.md) and [world-maps.md](world-maps.md) and leaves out what they say. Paths are each repo's under `rcjlabs/`; the repos were read, never run. "My reading" marks a gap seen in the code that no note of the repo's records. The second half says what the engine has to build on.

## Markers and maps in the earlier games

- **dirtbag v0.956 is the only walked world with quest markers** (`dirtbag/docs/audit/world-ui.md:461`). Each tutorial step names one building. On screen, a bobbing ▼ sits over it; in another zone, an arrow at the screen's edge carries its name. A setting turns them off (:481).
- **What went wrong with them:**
  - B22 (:573): the step said "enter the café" but any building completed it, so the first marker sent the player three zones away while the van that also counted stood 50 px off (:71). **The marker's target and the step's test must be one definition.**
  - B23 (:574): the last step's marker was null whenever fuel was enough, so it pointed at nothing.
  - B5 (:556): the Town Map's "next step" came from grid deltas and named exits that didn't exist. The audit's fix is a search over the zones' graph (:696). **Directions to another area go over the doors, not across the grid.**
  - B17 (:568): the HUD was hidden indoors, so you shopped without seeing your cash.
  - The Town Map (:433-436) was a static schematic with a "you are here" pin and coloured dots for names, not tappable. The audit dropped the walked town for a tap-a-pin map (:92, :612).
- **spliceworld's county map** (`spliceworld/campaign/county.js:1-14, 58-67, 118-126`): land and roads as SVG, nodes as HTML buttons placed by percent over it, every coordinate in `regions.json`. A node's state is an icon, a word and a colour; a contested node shows a short clock and its full time in its aria-label. Found on the way (`PROGRESS.md:297-306`): labels near the edge wrapped, muted text failed contrast at 2.12:1, and focus fell to the page after a tap.
- **Discovery:** dirtbag's rebuild hides a place until three clues find it, and every list leaves it out until then (`dirtbag/docs/ROADMAP.md:3529-3541`). landnam learns places by trade and from high ground; measured, a band that never traded knew 13 of 120 places after 30 runs (`landnam/src/sim/places.ts:92-210`). landnam's duplicate ids (`pl_<kind>` twice on one coast) answered "away" for the second town (:33-54): **put the address in the id.**
- **Not found anywhere:** a compass, a minimap, or fog over a walked world. space-wrecked weighed fog of war and declined it (`space-wrecked/ROADMAP.md:1315`).

## Barter in the earlier games

| Repo | Selling back | Where |
| --- | --- | --- |
| space-wrecked | buy at 100%, sell at 50% floored to 5; the validator holds selling ≤ buying | `data/balance.json:24-25`, `src/sim/economy.js:22-31` |
| chooser-of-the-dead | 50% of the price this run actually paid | `packages/engine/src/campaign/run.ts:393-400` |
| dirtbag rebuild | the shop buys at 40% any day; used gear at 55% on weekends | `dirtbag/app/src/sim/dials.ts:1200-1203` |
| ludus | 0.42, +0.13 with an armourer, × (0.45 + condition/180) | `ludus/src/ludus.jsx:985-998` |

- **Arbitrage:** dirtbag v0.956 stacked discounts (0.8 × 0.5 × 0.7) and bought back at 40% of list, so every loop made 12% (`dirtbag/docs/audit/economy.md:180, 315`). chooser works sell-back out from the price paid. **Sell from what was paid, and hold selling at or under buying.**
- **Stock:** space-wrecked rolls 4 parts and their prices together and never stocks what you sell it; chooser puts a sold item back on sale at full price; ludus restocks every third week through one function the panel and the gate share; wasteland rolls a node's stock once and saves it, and the buy handler refuses a withdrawn piece, not just its button (`wasteland-protocol/game.js:10372-10397`).
- **Merchant money:** no repo limits it.
- **Standing:** landnam's neighbours trade at 0.6 to 2.0 across standing and refuse below a floor (`landnam/src/sim/neighbours.ts:260-303`); its estimate is the trade's own formula with the roll dropped. wasteland's prices grew 1.4× a sector while four lines stayed flat, so healing went nearly free (`game.js:9923-9947`).
- **Screens:** football-manager's "You give / You get" cards side by side from 820 px and stacked below, a sticky bar with the delta and why the deal is invalid (`football-manager-simulator/src/ui/views/moves.js:300-313`); space-wrecked's two-tap Buy and Sell that disarm after 3 s (`src/ui/campaign/shop.js:112-133`); chooser's Sell buttons whose aria-label carries the price.

## Containers in the earlier games

- **Places marked by the author:** space-wrecked's site templates mark crate slots, and a "grab" job takes N of them (`space-wrecked/src/sim/gen/site.js:21-38`).
- **Locks:** wasteland's cache lock is a hash of the node, so it can't be rerolled; the right class opens it clean for more pay, anyone can force it at a cost, and the handler refuses as well as the button (`game.js:2178-2198, 10619-10674`).
- **Capacity:** wasteland's full bag disables buying and crafting, its handle saying FULL; ludus's soft cap warned on 0.5% of the weeks it applied (`ludus.jsx:959-978`): **keep the cost of being over on screen.**
- **Once only:** sandbagged's once-a-stage trading post wasn't saved, so a reload reopened it (`sandbagged/src/engine.ts:584-590`); wasteland paid twice for a commander killed after a reload (`tests/suites/111-what-a-reload-knows.js`). **Save every once-only gate.**
- **Not found anywhere:** Take all, searching bodies, or restocking containers.

## Lessons

1. A marker's target and the objective's test come from one definition (dirtbag B22, B23).
2. Directions to another space go over its doors (B5).
3. The price shown and the price paid share one function (landnam, ludus).
4. Sell-back works from the price paid and never tops buying (chooser, space-wrecked; dirtbag's loop).
5. Stock, sold and withdrawn flags and every once-only gate are saved (wasteland, sandbagged).
6. Refusals live in the handler, not only the button (wasteland).
7. Ids carry the address (landnam).
8. The purse shows where you spend it (dirtbag B17).

## What the engine has

- **Quests** (`packages/kits/src/quests/`): an objective has `id`, `text`, `done-when` or `count`, and `next`; no target. A slot holds a record id only, tried from `content.ids(type)` (`slots.ts:53-67`). The journal is `start-quest`'s preview (`journal.ts`), which `journalEntries` flattens (`packages/ui/src/session/views.ts:158-174`). The slice is at version 2.
- **The world module** (`packages/core/src/world/`): the pack's zones and uses, each with its effects, so an `enter-space` among them is a door; spawns; the start; each placed actor's space and path. The slice keeps where the player stood (sent every 5 s once moved, on a pause and before a use) and each NPC's space, feet where the crowd walks it, and goal. **The sim knows no object's coordinates;** only the stage does (`apps/editor/src/walk/goals.ts`).
- **The stage** (`apps/editor/src/walk/`): the yaw is the stage's; `screenOf` projects a point; the tap marker's ring is a marker in 3D; the prompt is the HUD's one DOM button. The session hands the stage live state through getters on `SpaceAsk` (`here`, `clocked`, `fight`), built per step in `worldOf` (`packages/ui/src/session/play.ts:206-220`).
- **Maps:** `MapWidget` draws the maps kit's node graph (M4.6). Nothing draws a 3D space from above. Bake navigation (`apps/editor/src/nav/`) is the pattern for a file baked in the editor, its inputs hashed so a stale one warns (W147).
- **Economy** (`packages/kits/src/economy/`): shops buy and sell one item at a time with `sells-at` and `buys-at`, the faction's band moving buying; selling never tops buying (`quote.ts`). A shop has no owner and no money; sold items vanish. Money is the party's alone.
- **Bags** (`inventory/bags.ts`): the party's or an actor's; `whose()` refuses anything else. **Bodies** (`fighting/falls.ts`): a search moves the whole bag at once, one way, which D76 left for containers to take item by item.

## Open questions

1. Fog over a space's map, or places found before they show, as dirtbag's rebuild and landnam do.
2. Fast travel from the map.
3. The calls for M6.7 (radiant aliases) and M6.8 (barter and containers) are put when they start.
