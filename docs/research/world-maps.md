# Research: world maps in the RCJLabs games

What the games' maps are, how they are made, checked, saved and drawn, and what that asks of the engine's map kit (M4.6, [D56](../decisions.md)). Paths are under `rcjlabs/<repo>/`; each repo was read, never run. landnam-ue and mythos-clash were left out. "Inferred" marks a reading the code doesn't state.

Eleven maps in nine repos. Three are made by a seeded generator: space-wrecked's sectors, wasteland-protocol's route graphs and landnam's coast. sandbagged's are drawn by hand and varied by the run's seed. The rest are drawn by hand. chooser-of-the-dead has no map: its run is a line of days, and only its structure was read.

## The generated maps

### space-wrecked: act 2's sectors

- **Play.** Act 2 crosses 5 sectors (`data/campaign.json:10`), each a map from a way in to a jump point. A jump goes to a linked node; a long jump to one two links away; both ways, since links are undirected (`src/sim/travel.js:36-57`, `215-228`, `266-286`).
  - A jump costs `jumpSupplies` 1 per crew member and adds `jumpHeat` 2; a long jump costs 3 times the supplies and takes 10 heat off. Short of supplies, the jump still goes and each crew member loses 2 hp (`data/balance.json:30-38`).
  - A scan shows nodes within 2 links, for 2 heat. A sector is left only from its jump point (`travel.js:356-392`).
  - From heat 50, hunters may wait where a jump lands: 10%, 35% from heat 75, certain at 100; never at a kind marked `safe` or `hides` (`src/sim/hunt.js:30-39`).
  - Known from the start: the way in, the jump point, charted kinds (stations, nebulae) and quest nodes; then every node visited or next to one (`travel.js:171-181`).
- **Shape.** A node is `{id, col, row, x, y, type, name, event?, hostile?, quest?}`, its `x` and `y` shares of the chart inside a 0.08 margin (`src/sim/gen/sector.js:24-29`). Links are pairs `[a, b]`, `a < b`. The sector is saved whole, "so an update to the game can't move a node under it" (`travel.js:9-16`), and a save's sector is held to 40 nodes and 120 links (`src/sim/runShape.js:13-16`).
- **The generator** (`gen/sector.js:36-146`, numbers from `data/sectors.json:2-6`):
  1. 7 columns. The first and last hold the way in and the jump point; each other rolls 2 or 3 nodes, spread evenly with a little jitter.
  2. Each node links to the node at the same relative height in the next column, `round(i*(m-1)/(n-1))`, and each node there links back the same way, so every node has a way on and a way back. Each gap between columns gets one extra link with 35% chance, chosen among those that cross no link.
  3. Counted kinds, 2 stations and a nebula, each take a middle column of their own, on a random row.
  4. Every other node rolls its kind by weight: empty 2, derelict 2, distress 2, trader 1, hazard 2, hostile 2.
  5. Events are drawn per kind from a shuffled pool, none twice in a sector; hostile ships by weight from those allowed at this sector (a cutter from the first, a corvette from the third); names from per-kind lists, none twice.
  6. Quests are placed afterwards, never on the ends, a station, a nebula, a hostile or another quest, picked by a hash of the seed so the campaign's random stream doesn't move (`src/sim/quests.js:162-183`).
- **RNG.** mulberry32 with state passed in and out (`src/core/rng.js:38-84`); a sector's seed is drawn from the campaign's stream as it is entered.
- **Checks.** No retry: valid by construction. `tests/sector.test.js` over 300 seeds: the ends in their columns, every node reached, column sizes in range, links only between neighbouring columns, never crossing or repeated, a way on and a way back, the counts, each counted kind in its own column, names unique, positions in the margins, the mix within 0.8 to 1.25 of its weights, and golden files. `tools/validate-sectors.js` checks the data: 3 to 12 columns, 1 to 4 rows, no more counted kinds than middle columns, enough names, a ship for the first sector, no hiding place holding events or ships.
- **Drawn** as an SVG over the chart, landscape only, no scroll or zoom. Each node's button is its share of its column, so buttons never overlap and stay at least 48 px. A tap picks a node, a second jumps; rings mark what a jump and a long jump reach, red where hunters may wait (`src/ui/campaign/sector.js`).

### wasteland-protocol: a route to the commander

- **Play.** Each sector is 10 tiers ending at a commander. The whole first tier is open; after that, only the last node's edges, unless a Scout keeps the tier open. Moving costs nothing; the next sector rolls a new map (`game.js:3368-3379`, `9286-9300`).
- **Shape.** A node is `{id "n{tier}_{col}", tier, col, type, elite, weather, terrain, formation, edges}`, its edges its children in the next tier: directed, forward only. Places are fixed: three columns at 18, 50 and 82% across, tiers 96 px apart. Saved whole.
- **The generator** (`game.js:3181-3330`):
  1. Tier 10 is the commander alone, tier 1 two nodes, every other tier 3 nodes with 60% chance, else 2.
  2. Each node links to its proportional window in the next tier, so edges don't cross, plus one more child to its right with 50% chance.
  3. Two elites in distinct tiers from 5 to 9, each on a node all of whose parents have another child: an elite is never forced. When one isn't, a link to a sibling is added (inferred: it can cross).
  4. Specials replace plain fights, never in tier 1, never on an elite, the commander or another special: a camp in tiers 8–9 and in 4–7 always, another in 2–9 at 40%; an event in 2–8 always and two more at 35%; a shop in 3–9 at 65%; caches; a recruit preferring nodes both starts reach.
  5. Each fight gets weather, ground and a formation; the opening fight is kept plain.
- **RNG.** mulberry32 seeded by FNV of the run's seed and the sector; a run with no seed falls back to `Math.random`, and a shuffle by `sort(() => rng() - 0.5)` is biased.
- **Checks.** `validateSectorMap` (`game.js:3332-3362`), run only in tests: one commander, alone on top; no empty tier; edges only to the next tier; everything reached from tier 1; exactly 2 elites as placed; a camp in tier 8 or later; an event; tier 1 plain. `tests/suites/24-map.js` makes 200 maps, all valid and at least 95% distinct, and plays and reloads them.
- **Drawn** bottom to top, 75 px buttons in a column at most 340 px wide, scrolled so the current tier sits 45% down; travelled, open and cut-off edges drawn apart.

### landnam: the coast

- **Play.** One coast walked out and back: on foot one stop, its leg costing 2 to 4 days; with a ship up to 3 stops in a day (`src/sim/coast.ts:30`, `55-99`). Food and the days left before winter bound how far a band can go.
- **Shape.** Nothing of the coast is saved: it is a pure function of the seed and the stop. The save holds where the band is and the stops trodden and known (`coast.ts:148-204`).
- **The generator** (`src/sim/route.ts`): 26 stops; each stop's country by weight, the first always shore; richness grows as `(i/25)²`; at most one place a stop, each kind from a floor of distance up; then guarantees in place of retries: a place within 8 stops, a guarded place, 2 places at least, filled from the far end. 4 neighbouring clans, one per quarter of the coast.
- **RNG.** mulberry32 seeded by FNV of `landnam-route:${seed}:${index}:${salt}`, one value per question, so a change to one question moves no other. `Math.random` is banned.
- **Drawn** as a strip, 58 px a stop, scrolled rather than shrunk, centred on the band.

## The drawn maps

- **dirtbag's valley.** Places by id and undirected roads `{a, b, min, cash}` (`app/src/sim/content/places.ts`); a drive takes the quickest route by minutes, cash breaking ties, memoised (`places.ts:1285-1326`), and a drive of 30 minutes or more costs energy. Places are gated by grade, unlocks, permits, being found, seasons and the van. Screen positions are kept apart from the sim, as pins (`app/src/view/layout.ts:414-455`). A test holds every place reachable from every other, each road the quickest way between its own ends, and the classic drive times (`app/src/sim/content.test.ts:56-83`).
- **climbing-world-traveler.** Hubs and edges `{from, to, mode, cost, days}`, a crag's last mile its own edge, routes by cost then days then ids, and the graph checked by `pnpm validate` (`src/sim/travel.ts`).
- **ludus.** Capua and three towns a week or two away, each with a price factor; a week on the road costs 25 gold.
- **spliceworld.** Regions with an outline; nodes placed by hand, each road leading back to the lab, unlocked in order. A check holds every node inside its region and every 48×44 button clear of its neighbours in a 356 px county.
- **sandbagged.** Each act's tiers drawn by hand with no edges: any node of the next tier can be picked. The run's seed swaps climbs of a grade and a camp for a shop. Drawn as a topo picture with a list of buttons under it, "because tapping a 9px ink mark on a phone is not a control".
- **2060td.** Theatres of 13 columns by 3 lanes, derived from progress; only what was lost is saved.

## What recurs

- **Shapes.** Layered maps from a start to an end: space-wrecked's (both ways, with long jumps) and wasteland's (forward only). Both keep links from crossing by joining each node to the same relative height in the next layer, then add an extra link by chance. Drawn graphs route by the quickest road. No game uses a grid or hexes any more.
- **Rules.** One start and one end; kinds kept to a depth window (an elite from tier 5, a shop from 3, a corvette from sector 3); counts that must be met (2 stations, a camp, two elites); one counted kind to a layer; a plain opening; everything reachable; a dangerous node never the only way on. No game has a rule against two of a kind in a row.
- **Valid by construction.** No game generates and retries. Each places by rule, and its tests check the rules over 200 or 300 seeds.
- **Where they differ.**
  - Saved whole (space-wrecked, wasteland) or remade from the seed (landnam, sandbagged, 2060td).
  - Links stored as pairs, as each node's children, or as each node's parent.
  - Drawn left to right in landscape, bottom to top with a scroll in portrait, or as a strip that scrolls sideways.
  - Words: "sector" is a whole map in two games and a cell in another; a layer is a column, a tier, a stage or a stop.

## What this asks of the engine

- **A map kit** (Evan's call): maps as records; travel as an action whose cost comes from the same preview the sim rolls; arriving runs the node kind's effects.
- **Layered route maps** made by rules the author writes as data: layers and their widths, links that never cross with an extra by chance, directed or both ways, and kinds placed by counts, weights and depth windows. Drawn maps in the same editor, routed by the quickest road.
- **Valid by construction,** the rules checked over many seeds in the editor, as the games' tests do, with a seed that breaks one shown.
- **Saved whole** once made, as space-wrecked does, so a change to the rules never moves a node under a save.
- **A map widget** that follows the screen: bottom to top with a scroll on a portrait phone, left to right and fitted in landscape and on desktop, with node buttons at least 44 px.

## Open questions

1. Hunters waiting where a jump lands, at odds that grow with heat, are an arrival roll whose chance reads a fact. Can the events kit's rolls read a fact for their chance, or is that M4.7's?
2. Space-wrecked's jump costs supplies per crew member. Is a cost that scales with a count the economy kit's, or the map's?
