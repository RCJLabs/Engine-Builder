# Stock screens (M4.4, D54)

Templates that New screen offers: screens written into a project's `ui/` as JSON the author owns, filled from the project as it stands. Every number on them is a binding to a live fact, so a template made on the first day still shows the game's numbers on the last. Nothing about them is special once written: the checks, the renderer and M4.5's designer treat them as any screen ([screens.md](screens.md)).

## New screen

- **The form** asks for a template and a name. Blank is the M4.1 screen. Each other template is offered only when the kits it needs are on, and its name starts as the template's ("Codex"). The id comes from the name, as before; one taken asks for another.
- **What it reads:** the project's kits, its records (resources, actors, factions, the roster's starting members), the game's catalog once its scripts have run (its start mode, its modes, and which allow no action), and the screens already in `ui/`.
- **`shows`** starts as the mode the template is for, unless a screen already shows it. Without the game's catalog, a template for a game's own mode starts with none, for the author to fill.

## The templates

| Template | Needs | `shows` | Modal | What it holds |
| --- | --- | --- | --- | --- |
| HUD | — | the game's start mode | no | Top: the day (time) and each resource. Main: bars for the first three stats of up to three actors, current of most (the roster's starting members, or each actor without a roster); the actions on offer, in the engine's words; the feedback's last three lines. Bottom: buttons to the screens named inventory, journal, codex and credits, where they exist. |
| Dialogue | dialogue | `talking` | yes | The speaker, the line, each option as a button, disabled while locked, and Go on. |
| Event | events | `choosing` | yes | The event's name and text, each choice as a button, disabled while locked. |
| Shop | economy, inventory | `shopping` | yes | The shop's name and each resource; Buy and Sell tabs from the shelf and the bag; Leave. |
| Hall | roster | `hiring` | yes | The hall's actions on offer: each hire, and leaving. |
| Inventory | inventory | — | yes | The bag, each item with its count; Close. |
| Journal | quests | — | yes | Quests and Log tabs: the journal, and the feedback's log; Close. |
| Codex | inventory, factions, events or stats | — | yes | A tab per kit on (below); Close. |
| Credits | — | — | yes | Each asset's credit from the pack, and "Made with Engine-Builder"; Close. |
| Ending | — | the modes that allow no action | no | The game's name; the day, each resource and the quests done; Journal and Credits when screens of those ids exist; Back to title and New game. |

A screen opened only by a button has a Close (W134). The HUD stays below the modal ones, so its numbers show behind a talk or the shop. An option's reason, cost and odds are entry fields (`{.why}`, `{.cost}`, `{.odds}`) for the author to place: shown everywhere, they read as a dash where there are none. The HUD's buttons use the engine's words for each action ("Carry", "Visit greta"); a game that wants its own puts buttons of its own in their place, as the hut's hand-made screen does.

## The codex's tabs

Each is a `records` list ([screens.md](screens.md#lists)). An entry not yet known shows "Not yet found".

| Tab | Type | Known when | Shows |
| --- | --- | --- | --- |
| Items | `item` | `inventory.count(item: @entry) > 0` | its name and the count carried |
| Factions | `faction` | always | its name, standing and band |
| Events | `event` | `events.seen(event: @entry) > 0` | its name and how often it was seen |
| People | `actor` | `roster.member(actor: @entry)` with the roster on, else always | its name and each pool, current of most |

The author changes what "known" means by editing the condition. An item is known only while carried: no fact remembers one once had (D54's cost).

## The gate

In the editor e2e, the hut is brought in with its six screens set aside, keeping its theme, feedback and shell. Every stock screen its kits allow is made by New screen: HUD, Dialogue, Event, Shop, Inventory, Journal, Codex, Credits and Ending. A CC-BY image is imported with its provenance. The project is exported and played at `/play/` to its end through those screens alone:
- the codex holds rope back until it is bought;
- the credits name the image's author and licence;
- the ending's Back to title reaches the shell's title.

On phones at 360 and 390 px and in landscape, each stock screen is opened by touch, fits, has no target under 44 px and nothing axe finds. In unit tests, every template is checked clean against the hut's game and against fixtures with the stats and roster kits on.

## Open questions

1. **Items once had.** An `inventory` fact that remembers an item once gained would let the codex keep it after it is sold; the bag would have to keep a set, which changes its save.
2. **The licences of the engine's own code** an exported game carries (Preact's, among others) belong in its credits too. They come with M4.10's export, which knows what it bundles.
3. **A HUD for games without a start mode of their own:** a game that starts in a kit's mode gets a HUD showing nothing, for the author to place.
4. **Which stats a HUD shows.** Stats have no mark for a pool, so the HUD takes the first three by id. A field on a stat saying it is shown, or kept as a pool, would let the author choose.
