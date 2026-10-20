# Maps (M4.6, D56)

The maps kit: maps as records, travel as an action, arriving as a node kind's effects; a generator of layered route maps made by rules written as data, and maps drawn by hand with roads; the map widget; and the World panel. The survey behind it is [research/world-maps.md](../research/world-maps.md).

**Words.** A map has **layers** of **nodes** joined by **links**. A node has a **kind**. A way to travel is a **move**. A drawn map's links are **roads**. The **party** is where the player stands.

## The kit

`maps` in `project.json`'s kits, needing no other kit. It is built knowing whether economy is on (costs) and whether time is on (moves and roads that take time), as events is built knowing economy (D45).

### Records

**`node-kind`**:

| Field | Kind | |
| --- | --- | --- |
| `name` | text | |
| `description` | text, optional | what the widget says of a node of this kind once known |
| `names` | list of text, optional | names given to nodes of this kind, in a shuffled order, none twice in a map; then the kind's name and a number |
| `charted` | bool, optional | known from the moment the map is entered |
| `arrive` | effects, optional | run as the party arrives |

**`map`** is either **layered**, holding `layers`, or **drawn**, holding `nodes` and `roads`; never both.

| Field | Kind | |
| --- | --- | --- |
| `name` | text | |
| `description` | text, optional | |
| `layers` | group, optional | the rules of a layered map, below |
| `nodes` | list, optional | a drawn map's nodes: `id`, `name` (optional; else the kind's), `kind`, `x` and `y` (0 to 100), `arrive` (effects, optional) |
| `roads` | list, optional | a drawn map's roads: `from`, `to` (node ids), `takes` (calendar units, optional), `cost` (resources, optional), `one-way` (bool, optional) |
| `start` | text, optional | a drawn map's first node |
| `moves` | list | the ways to travel, below |
| `reveal` | int 0–3, optional | how many links from a node the party has stood on are known; 1 if left out |

`layers` holds:

| Field | Kind | |
| --- | --- | --- |
| `count` | int 3–12 | layers, the start's and the end's among them |
| `widths` | group `min`, `max`, each int 1–4 | nodes in each layer between |
| `start`, `end` | ref node-kind | the first layer's node and the last's |
| `links` | enum `both`, `forward` | whether links go both ways or only towards the end |
| `extra` | int 0–100, optional | the chance, in percent, of an extra link between each pair of layers |
| `place` | list, optional | kinds placed first: `kind`, `min` and `max` (how many), `from` and `to` (layers, 1 to `count` − 2; all between if left out), `apart` (none two in a layer), `avoidable` (never the only way on) |
| `mix` | list | the kinds every other node is rolled from: `kind`, `weight` (int 1+), `from`, `to` |

A **move** is `id`, `label`, `reach` (int 1–3: how many links away on a layered map; a drawn map's moves follow roads to any node), `cost` (resources, optional), `takes` (calendar units, optional), `effects` (optional, run as the party sets off) and `if` (a condition, optional).

### The generator

`makeLayered(rules, seed)` is pure. Its one stream is `Rng.create(seed)`, drawn from in this order:

1. **Widths.** The first and last layers hold one node. Each layer between, in order, holds `int(min, max)`.
2. **Links,** for each pair of neighbouring layers in order, `n` nodes then `m`, by slot:
   - each node `i` links to `along(i, n, m)`, then each node `j` of the next links back from `along(j, m, n)`, where `along(i, n, m)` is `round(i × (m − 1) / (n − 1))`, or `floor((m − 1) / 2)` when `n` is 1;
   - with `extra` percent (`int(1, 100) ≤ extra`), one more link, picked by `int` among the pairs not yet linked that cross no link, in order of the first slot, then the second. Two links `(a, b)` and `(c, d)` cross when `(a − c) × (b − d) < 0`.

   Every node so has a link to the layer before and the layer after, and no two links cross (space-wrecked's rule, `gen/sector.js`).
3. **Placed kinds,** each `place` rule in order: how many is `int(min, max)`; each in turn goes on a slot picked by `int` among the free slots, in order of layer then slot, that are inside the rule's layers, in a layer holding none of the kind when `apart`, and never the only link on from a node of the layer before when `avoidable`. When no slot is left, the rule places fewer, and the check over seeds says so.
4. **The mix.** Each free slot between, in order, rolls its kind by `weightedIndex` among the `mix` entries whose layers hold it.
5. **Names.** Each node in order takes the next of its kind's `names`, shuffled by `shuffle` the first time the kind is named in the map; then the kind's name and a number from 2.

Node ids are `n<layer>-<slot>`: the start is `n0-0`, the end `n<count − 1>-0`. Nothing is retried: a map is valid by construction, and what its rules can't always meet the check over seeds finds.

### State

The slice, version 1:

```ts
interface MapsSlice {
  made?: MadeMap;          // the map the party is on, saved whole
  at?: string;             // the party's node
  visited: string[];       // on this map, sorted
  known: string[];         // sorted
  entered: number;         // maps entered in the game
}
interface MadeMap { map: string; seed: string; nodes: MadeNode[]; links: [string, string][]; start: string; end?: string }
interface MadeNode { id: string; kind: string; name: string; layer: number; slot: number }
```

A drawn map is copied in the same shape, its layer and slot 0; its positions, roads and arrivals stay in the record.

### Effects

- **`enter-map`** `{map, at?}`: makes the map and puts the party on it, at `at` (a drawn map's node) or its start, as an arrival. A layered map's seed is `<map>/<int(0, 2147483646)>` from the stream `maps/make`.
- **`reveal-map`** `{reach}` (1–5): every node within `reach` links of the party is known (a scan).

### Travel

`maps/travel {to, move}`, offered for each move whose `if` holds, to each node it reaches, when its cost can be paid:

- a layered map's move reaches the nodes within `reach` links, along links that go that way;
- a drawn map's move reaches every node by road, along the **quickest road**: least time in ticks, then least cost in all resources together, then the fewest roads, then node ids (dirtbag's `road()`, `places.ts:1285-1326`). Where two roads join the same two nodes, the quicker is taken, then the cheaper. A one-way road goes only its way; a road both ways beside it still goes back.

**What it costs** is one function, `travelOf(content, slice, move, to)`, that the action, its preview and the widget all read: the move's cost and takes, plus each road's on the way. Its verdict is the events kit's: `ok`, `locked` (the `if`), or `cant-afford` with the resource, what the party has and what it needs.

**Taking it**, in one attempt: pay the cost (`pay-cost`), run the move's effects, wait what it takes (`wait`), then arrive.

**Arriving** at a node: the party stands on it; it is visited; it and every node within `reveal` links are known; `maps/arrived {map, node, kind}` is heard; then the kind's `arrive` effects run, then the node's own.

Known from the start are the start, the end, and nodes of charted kinds. An unknown node is drawn, but not its kind or name.

### Facts

| Fact | Domain | |
| --- | --- | --- |
| `maps.on(map)` | bool | the party is on this map |
| `maps.at(kind)` | bool | the party stands on a node of this kind |
| `maps.at-end` | bool | on the map's end (a layered map's last node) |
| `maps.layer` | int | the party's layer; 0 on a drawn map or off a map |
| `maps.entered` | int | maps entered in the game |
| `maps.visited(kind)` | int | nodes of this kind visited on this map |

## Checks

- **E035** for a `map` or `node-kind` that doesn't hold together: both shapes or neither; a width's `min` over its `max`; a rule's layers outside 1 to `count` − 2, or `from` after `to`; a `place` rule whose `min` can't fit in its layers (more than their nodes, or than the layers when `apart`); a layer between that no `mix` entry covers; a drawn map's node ids twice, a road naming a node it lacks, no `start` or a `start` it lacks; a move whose `reach` is set on a drawn map; two moves with one id.
- **E053** for an `enter-map` whose `at` names a node its map lacks, or that is set for a layered map.
- **W120** for a move or road that takes time in a game without the time kit.
- **W135** for a layered map's rule some seeds don't keep, over seeds 1 to 300: a placed kind short of its `min`, a node no path reaches from the start or that can't reach the end (on a forward map), or two links crossing. It names the rule, how many seeds keep it, and the first seed that doesn't.
- **W136** for a drawn map's node no road reaches from its start.

## The map widget

`{"widget": "map", "label": ..., "empty": ...}` draws the map the party is on, from the view's `map`: its nodes, their links, where the party stands, and for each node each move that reaches it, enabled when offered and with what it costs.

- **The view is enter-map's preview** of the map the party is on, as `start-quest`'s preview is a quest's journal entry. It holds every node and link, a node's name and kind only once it is known, and every travel from `travels()`. Each travel has `travelOf`'s cost and time, `travelVerdict`'s verdict (the move's `if`, or the resource short), and each of the move's effects as its own preview gives it (a flag's `from` and `to`). A cost shows only with the economy kit on, and a time only with the time kit, since only then are they charged or pass. A preview of any other map is `{on: false}`: a preview can't roll a layered map's seed. The session puts it in words as the view's `map`, and the map's name as the field `map.name`.
- **A move's button** says its label, cost, time and what its effects do, by their previews: "Jump · 1 Supplies · heat 0 → 2". An effect that changes nothing says nothing. A shut move says why under it: "Costs 3 Supplies; you have 2", or the condition it needs. A button takes its action only while the game offers it.
- **A layered map follows the screen.** At the phone breakpoint it runs bottom to top in a column that scrolls, 76 px a layer, the party's node scrolled into the middle at each arrival. Otherwise it runs left to right, fitted, 100 px a layer against 76 a node.
- **Where nodes sit** (`mapLayout.ts`): along the way a layered map runs, the board is inset by half a node, so the start and the end sit inside its edges. Across a layer, its nodes share the width evenly, each at most its share less 6 px and never over 80 px, so none touches the next. A drawn map puts each node at its `x` and `y`, inset both ways; it is square on a phone and 4:3 otherwise.
- **Nodes are buttons,** at least 44 px, each named for what is known ("Mac's Pumps, station", "Unknown"). The party's node is filled and says so ("you are here"); those a move reaches are ringed; those visited are dashed. Links are drawn behind the buttons; a drawn map's one-way road is dashed.
- **A tap picks a node:** under the map, its name, kind and description, with a button for each move that reaches it. Until one is tapped, and again at each arrival, the party's own node is picked.
- Without the kit, a `map` widget is E049, as is `{map.name}`. With no map entered, it shows `empty`.

The **Map** stock template shows each mode that allows `maps/travel` (the game's catalog's `travelling`): the HUD's live numbers over the map's name, the widget and the log's last three lines. A game that starts on its map has it for its HUD, so the HUD isn't offered there.

## The editor

- **The World panel** lists the project's maps, each with its shape and size ("Layered: 7 layers", "Drawn: 5 nodes, 6 roads") and its problems, and the kinds of place, with New layered map, New drawn map and New kind, each opening the record in the inspector. A new layered map starts with five layers of one to three nodes, all of the first kind, and one move; a new drawn map with a start and an end of the first kind, a road between them, and one move. With the kit off, the panel says to tick Maps in the Project panel.
- **Above a layered map's form:** a Seed box and Next seed; the map those rules make from it, laid out as the widget lays it out, running up a narrow inspector and across a wide one, every node known; a tap on a node gives its name, kind, layer and description. Under it, the check over seeds 1 to 300, the sweep's own, each rule in words with how many seeds keep it and the first that doesn't, with Open seed to show that map. Rules with errors at Layers show no map until they are fixed; rules half typed, which make no map yet, say so.
- **Above a drawn map's form:** the map as written. A node is dragged where it goes, by mouse or finger, past 6 px of slop; the drop is one undo step ("Move van to 40, 52"). A tap without a drag opens its row of the form. The node itself is the handle: on a small board, a second target beside each would crowd.
- **Checked together:** a map, and every record that names one, are checked again when either changes, since enter-map's node is checked against its map's (`mapRelated`).

## Where it lives

- `packages/kits/src/maps/`: `types.ts`; `layered.ts` (the generator); `roads.ts` (reach and the quickest road); `travel.ts` (`travelOf`, taking it, arriving); `sweep.ts` (the check over seeds); `view.ts` (enter-map's preview); `facts.ts`; `module.ts`.
- `packages/schema/src/`: `mapTypes.ts`, `mapEffects.ts`, `mapCheck.ts`; the map widget in `uiSchema.ts` and its kit in `uiCheck.ts`.
- `packages/ui/src/`: `session/mapView.ts` (the view in words); `render/MapWidget.tsx`, `render/mapLayout.ts`, `render/map.css`.
- `packages/script/src/catalog.ts`: the modes that travel.
- `apps/editor/src/maps/`: `worldList.ts` and `mapPreview.ts` (plain functions), `WorldPanel`, `WorldBrowser`, `MapPreview`, `MapBoard`; the Map template in `screens/stock/play.ts`.
- `tools/cli/test/fixtures/drift/` (a slice of Space-Wrecked's sector run, with its stock screens) and `valley/` (a drawn valley in Dirtbag's style).

## The gate

- **Desktop** (`maps.spec.ts`): the drift brought in without its sector and its way in. The kind is made with New kind and the sector's rules in the World panel with forms, each landing as the fixture holds it. Every rule is kept in 300 of 300 seeds. A rule is broken on purpose (six stations in layers of one or two); its row and the form both say which seed breaks it, Open seed shows it, and the rule is mended. The pilot's 20 games in the Logic panel read as `eb sim` prints them. A move shut by a condition the drift never meets, Warp, is added with forms. Then the drift is flown to its exit through the map widget: the first jump's button reads "Jump · 1 Supplies · heat 0 → 2", Warp's is shut with why, and the party's node is picked at the start and after every move. Before anything is pressed, `expectMapLaidOut` checks the party's node is in the column's view, no two nodes overlap, and the links are drawn. The valley is drawn with forms, a place dragged and undone, a tap opening its row, and its 20 games read as `eb sim` prints them.
- **Phones** (`mapsPhone.spec.ts`), at 360×740, 390×844 and 844×390, by touch: the drift flown to its exit, the map and an event each in reach (nothing offscreen, no target under 44 px, nothing axe finds); the sector's preview in the inspector sheet; the valley's van dragged by a finger and undone.
- **The press policy** both use, an event's first open choice, else the first jump on a layer, else the first open move, is also `driftScreens.test.ts`'s, which shows seed 1 reaching home in under 60 presses, without a browser.

## Open questions

1. Space-Wrecked's jump costs supplies per crew member. A cost that scales with a count is neither the economy kit's nor the map's yet.
2. Should a drawn map's roads open by condition (Dirtbag's permits and seasons), or is a move's `if` enough?
3. Pinch to zoom on a large drawn map: the widget fits it, which keeps every node in sight but makes a big map's buttons crowd.
4. The preview's check over 300 seeds runs on the page at every edit: 12.5 ms in Node on this machine. A phone's is unmeasured; if it stalls typing, the check could wait for typing to stop, or move to a worker.
5. A move's effects are each previewed from the state before the move, not after its cost is paid. A move that both pays and adds to one resource would show the add from the unpaid amount.
6. A node's name reads with a space before its kind to a screen reader ("Drift Four , Derelict"), since the name is a block of its own to clamp to two lines.
