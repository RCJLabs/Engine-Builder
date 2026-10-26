# Spec: barter and containers

How the party trades with an NPC from their bag and purse, and takes from and puts into chests, barrels and bodies one line at a time (M6.8, [D80](../decisions.md)). It builds on the inventory and economy kits ([kits.md](kits.md)), an actor's bag ([npcs.md](npcs.md#bags), D73), the interact component ([worldspaces.md](worldspaces.md)) and a body's search ([combat.md](combat.md)).

## Purses

An actor can carry money of its own, with the economy kit on:

```json
{ "name": "Hild", "carries": { "lamp": 1, "bread": 3 }, "purse": { "coin": 30 } }
```

- **`purse`** names an amount of each resource the actor starts with. A resource it leaves out is 0.
- **The economy kit keeps a purse once it changes**, in its slice's `purses` by actor. Until then it is the record's, so a content update to `purse` reaches every save in which it never changed (as a bag, D73).
- **An amount stays within its resource's bounds**: never below its `min`, and past its `max` the rest is lost, as the party's.
- **`economy.purse(actor, resource)`** reads it.

## Merchants

A shop can name the NPC who keeps it:

```json
{ "name": "Hild's post", "actor": "hild", "currency": "coin", "buys": {}, "stock": { "table": "post-goods", "every": { "days": 3 } } }
```

- **What it sells is the actor's bag.** Each item the actor carries is on offer at the shop's price, as many as they carry.
- **Buying** takes the price from the party and puts it in the actor's purse; the item leaves the actor's bag for the party's.
- **Selling** takes the item from the party's bag into the actor's, and the price from the actor's purse to the party. An actor who can't pay refuses: `cant-pay`.
- **What was sold can be bought back**, at the shop's price, as anything else in the bag.
- **Restocking.** The first time the shop opens, and again once `stock.every.days` have passed, the actor's bag goes back to their `carries` with the stock's items and table added, and their purse back to their record's. What the party sold since is gone.
- **Prices** are the shop's, as before (M3.3): `sells-at`, `buys-at`, `rules`, and the faction's band (M3.5). With no `faction` of its own, the shop's faction is its actor's.
- **A shop with no actor** keeps its shelf and its unlimited money, as before.

## Containers

Any object's interact can hold items:

```json
{ "id": "chest", "shape": "box", "components": { "interact": { "label": "Open", "effects": [], "holds": { "bread": 2, "candle": 1 } } } }
```

- **`holds`** names how many of each item the object starts with. It may be `{}`: an empty chest to put things in.
- **Using it opens the container**, after the use's effects, unless one of them refused. The inventory kit's `container` mode opens on it.
- **The inventory kit keeps a container's items once they change**, in its slice's `held` by `space/object`. Until then they are the pack's.
- **Through prefabs and overrides,** `holds` is a field of the interact like any other: an override replaces it whole.
- **A fallen body opens the same mode on its bag.** `fighting/search` opens it, and `fighting.searched` holds once a body has been opened.

### In the container mode

| Action | Does |
| --- | --- |
| `inventory/take { item, count? }` | the item's whole line, or `count` of it, from the container into the party's bag |
| `inventory/put { item, count? }` | the item's whole line, or `count` of it, from the party's bag into the container |
| `inventory/take-all` | every line, in item id order |
| `inventory/close` | closes it |

- **What doesn't fit stays.** Take moves only what the party's bag has room for (an item's `max`); the rest stays in the container. Take refuses `full` when none fits.
- **Put** has no limit (D80).
- **Each move raises** the inventory kit's `took` or `put`, with the container's place or the body's actor, the item and the count, and the bags' own `gained` and `lost` as before.
- **Options** are what can be done now: Take for each line that fits, Put for each line the party carries, Take all while anything fits, Close.
- **Facts:** `inventory.held(space, object, item)`, the count in a container.

## The pack: format 16

A project in which any interact holds items packs as format 16: each use's `holds`, by space and object, beside its other fields. Every pack without keeps its format and its hash.

The inventory kit is built with the pack's containers, as the quests kit is with the places (D79). `kitsInWorld` builds it for `eb sim` and Run.

## Saves

- **The inventory kit's slice goes to version 3:** `held`, empty for a version 2 save, so every container is the pack's.
- **The economy kit's slice goes to version 2:** `purses`, empty for a version 1 save, so every purse is its record's.
- **A fixture saved by each old version** must keep loading.

## Checks

- **E089:** an interact that `holds` and `takes`, as a taken object can't be opened again; or `holds` in a game without the inventory kit.
- **W156:** a shop whose actor carries nothing and whose stock is empty: it never has anything to sell.
- **References:** `purse`'s resources, `holds`'s items and a shop's `actor` are references, E005 when they name nothing.

## The stage and the screens

- **The walk pauses under the container's screen,** as under a talk (M6.1).
- **The stock Container screen** (a modal): the container's name (its object's, or the body's actor's), its lines with Take, the party's bag with Put, Take all and Close. Each line is a 44 px button.
- **The stock Shop screen,** for a shop with an actor: its heading says what the actor has in their purse, its Buy list is their bag, and its Sell list says what they would pay.

## In the editor

- **An interact's form** gains Holds: items and how many.
- **An actor's form** gains Purse, with the economy kit on: resources and how much.
- **A shop's form** gains Actor.
- **Problems:** E089 and W156 at their fields, as `eb validate` gives them.

## The gate

The post (`tools/cli/test/fixtures/post`): a yard with a trading post where Hild trades from her bag and purse, a chest of bread and a candle, and an empty barrel.

It is checked four ways:

- **Headless, through the session:**
  - a lamp bought from Hild, her bag one less and her purse the price more;
  - a candle from the chest sold to her and bought back;
  - selling until her purse can't pay (`cant-pay`), then three days waited and her bag and purse restocked;
  - the chest taken from line by line and a lamp put in the barrel;
  - a save mid-trade loading to the same bags and purses;
  - a version 2 inventory save and a version 1 economy save loading;
  - the fixture broken once each for E089 and W156.
- **The camp's bodies** opened and taken from line by line, headless and by keys (M6.4's gate, updated).
- **By keys and by touch** at 360, 390 and sideways: the chest opened, a line taken and one put back; Hild's goods bought and sold through the Shop screen.
- **In the editor alone** at 1280 and 390, from the post with no holds and no purse: the chest's Holds, Hild's Purse and the shop's Actor set with forms, then played: the chest opens with its bread.

## As built (2026-10-26)

- **Where it lives.**
  - *The sim:* the inventory kit's `containers.ts` (open, take, put, take all, close, and what Take offers) and `bags.ts`'s `restock-bag`; the economy kit's `purses.ts` and `shop.ts` (`inStock`, a merchant's verdicts, the restock). The kit is `inventoryModule(containers, bodies)`, built with the pack's containers as the quests kit is with the places (D79); `kitModules` and `kitsInWorld` choose it. Core's `world/containers.ts` reads a pack's containers, and the world module's use opens one after its effects.
  - *The pack:* `holds` beside a use's other fields, format 16. A format 16 pack always has places, every space untagged when none has a tag, so format 15's shape holds.
  - *The checks:* E089 in the compiler's `spaceParts.ts`, at `holds`; W156 in `packages/schema`'s `kitCheck.ts`, at the shop's `actor`.
  - *The screens:* the session's `containers.ts` (each container's name, read from the pack's spaces) and `views.ts` (`held`, `container.name`, `shop.keeper`, `shop.purse`); the stock Container and Shop templates in the editor's `screens/stock/modal.ts`.
- **The container mode is only a game's that can open something:** a use that holds, or the fighting kit's bodies. Every other game's screens are asked nothing new, so no fixture or template got W133.
- **More refusals than specified.**
  - Take refuses `none` for a line that isn't there.
  - Take all refuses `none` once the container is empty, and `full` when nothing in it fits.
  - Selling to a merchant also refuses `no-room` when their bag can't take another of the item (its `max`).
- **A restock is an inventory effect,** `restock-bag { actor, add }`: the bag back to `carries`, `add`'s items on top as far as each fits. A merchant's shop keeps no shelf of its own: `economy.stock` and the Buy list read the bag, in item id order.
- **A purse is kept whole** once any of it changes, as a bag is, and within its resources' bounds. An actor's Purse field takes nothing below 0.
- **A body searched with something left** still offers Search; once its bag is empty the prompt says Nothing left (the fight view's `emptied`).
- **The compiler checks screens against a stand-in container** while the pack is unread: a project with any interact that holds is checked with a game whose world has one, so `ui/container.json`'s mode is known (E049 otherwise).
- **In the editor:**
  - The script worker gets a space's or a prefab's file whole when it holds items, and the game is checked again when the first `holds` is added or the last removed.
  - New screen offers the Container template once the game's modes include it, so not to a game whose scripts haven't run. M4.4's New screen read only the kits; it now reads the modes too.
  - A shop and its actor are checked together, so W156 goes when either changes.
- **Sixteen golden files changed** in their economy, inventory and kernel facets alone, the slices' new fields and versions: every run's turns, ends and content hash are as they were.

## Open questions

1. **Owners and theft** (D80): a container or a bag owned by an actor or a faction, taking from it seen lowering standing.
2. **Capacity and weight:** a container that holds at most so much, and items that weigh.
3. **Money in containers:** a chest holding coin, which is a resource, not an item.
4. **Merchants' own goods:** an actor's worn gear, or a quest item they carry, kept off the Buy list.
5. **Restocking without a visit:** a merchant's bag restocked by the calendar rather than when the shop next opens.
