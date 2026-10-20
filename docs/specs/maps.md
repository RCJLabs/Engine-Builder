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
- a drawn map's move reaches every node by road, along the **quickest road**: least time in ticks, then least cost in all resources together, then the fewest roads, then node ids (dirtbag's `road()`, `places.ts:1285-1326`).

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

- **A layered map follows the screen.** At the phone breakpoint it runs bottom to top in a column that scrolls, the party's layer scrolled into the middle. Otherwise it runs left to right, fitted, with no scroll.
- **A drawn map** puts each node at its `x` and `y`, fitted.
- **Nodes are buttons,** at least 44 px, each named for what is known ("Mac's Pumps, station", "Unknown"). The party's node says so; those a move reaches are ringed.
- **A tap picks a node:** under the map, its name, kind and description show, with a button for each move that reaches it, saying what it costs and why it can't be taken. Links are drawn behind the buttons.
- Without the kit, a `map` widget is E049. With no map entered, it shows `empty`.

A **Map** stock template places the widget under the map's name, with the log.

## The editor

- **The World panel** lists the project's maps and node kinds, with New layered map, New drawn map and New kind, each opening the record in the inspector. With the kit off, it says to tick Maps in the Project panel.
- **Above a layered map's form:** the map made from a seed, which can be typed or moved on by Next seed, drawn by the map widget with everything known; and the check over 300 seeds, each rule with how many keep it, and the first seed that doesn't, which opens it.
- **Above a drawn map's form:** the map drawn by the widget. A node is dragged by its handle to a new place, one undo step each; a tap on a node opens its row of the form.
- Changing a map or a node kind checks the maps and kinds again together, as quests are.

## Where it lives

- `packages/kits/src/maps/`: `types.ts`; `layered.ts` (the generator); `roads.ts` (reach and the quickest road); `travel.ts` (`travelOf`, taking it, arriving); `sweep.ts` (the check over seeds); `facts.ts`; `module.ts`.
- `packages/schema/src/`: `mapTypes.ts`, `mapEffects.ts`, `mapCheck.ts`.
- `packages/ui/src/`: the map in `session/views.ts`; `render/MapWidget.tsx` and `render/mapLayout.ts`.
- `apps/editor/src/maps/`: the World panel and the previews.
- `tools/cli/test/fixtures/drift/` (a slice of Space-Wrecked's sector run) and `valley/` (a drawn valley in Dirtbag's style).

## Open questions

1. Space-Wrecked's jump costs supplies per crew member. A cost that scales with a count is neither the economy kit's nor the map's yet.
2. Should a drawn map's roads open by condition (Dirtbag's permits and seasons), or is a move's `if` enough?
3. Pinch to zoom on a large drawn map: the widget fits it, which keeps every node in sight but makes a big map's buttons crowd.
