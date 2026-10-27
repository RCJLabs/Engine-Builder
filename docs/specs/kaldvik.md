# Kaldvík (M6.10, D82)

Proof #2: a Bethesda-style mini world on Landnam's coast. One exterior and three interiors, five townsfolk on a day's schedule, three quests, combat and barter, made with the engine's kits and nothing of the project's own but its scripts' glue. Bots finish it headless, Rapier and Recast walk it in Node, and a player on a phone walks it from Pages. Its text is written fresh in Landnam's setting; nothing is copied from Landnam, which grants no reuse.

## Where it lives

- **`games/kaldvik/`** is an ordinary project folder: project.json, export.json, records/, scripts/, spaces/ (each space's navmesh beside it, and the shore's terrain files), ui/, and assets/ with the starter kit's pieces. It has no guide, no ink scenes and no prefabs. Its NOTICE says the game's text is all rights reserved, RCJLabs (D82).
- **`pnpm make:kaldvik`** writes the shore's terrain files: the heights, the paint and the foliage density PNGs, from `tools/make-kaldvik`. A test holds them to the generator byte for byte, as the moor's are held. Everything else is written by hand.
- **The web export** is written by `pnpm build` (`pnpm build:games`) into the editor's `dist/games/kaldvik/`, deployed at `engine.rcjlabs.com/games/kaldvik/` and loaded live by CI's confirm job.

## The place

- **The shore,** about 256 m on a side: a terrain 2 m between heights.
  - The fjord's water along the west, a beach of shingle, and Gudrun's booth above the tide line.
  - The steading on its rise, behind a palisade with a gate: the hall's door, the smithy's door, Tove's hut and the drying racks.
  - Pine woods to the north and east, planted as foliage, with two outlaw camps in them.
  - The knoll to the south-east with the howe's door in its side.
  - The wreck on the far beach to the south, where Tove's net washed up.
  - Fair weather by day and sea fog at dawn.
- **The hall:** Ragnhild's high seat, the long hearth, the benches and her bed-closet.
- **The smithy:** Ulf's anvil and forge, his bench and his bed.
- **The howe:** the old grave mound, now the outlaws' hole. Three outlaws and the steading's silver in a chest.

## The people

Each is essential (D82): struck to nothing, they go down and get up again.

An NPC lives in one space (open question 1), so each keeps a day within their own.

| Who | Where | By day | In the evening | At night | What they offer |
| --- | --- | --- | --- | --- | --- |
| Ragnhild, who holds the steading | the hall | the high seat | the hearth | her bed-closet | *The Howe* |
| Ulf the smith | the smithy | the anvil | his bench | his bed | weapons, bought and sold |
| Gudrun the trader | the shore | her booth | the fire by the racks | her tent | goods from her bag and purse |
| Tove, who fishes | the shore | the beach and her nets | the drying racks | her hut | *Tove's Net* |
| Halvard of the watch | the shore | the gate | walking the palisade | walking the palisade | *The Watch* |

## The quests

- **The Howe** (main): Ragnhild tells of the outlaws who took the steading's silver to the howe. The player goes into the howe, deals with Hallkel and his two, takes the silver from the chest, and brings it back. Ragnhild's thanks end the game on its ending screen.
- **Tove's Net** (side): Tove's net went out with the tide. It lies at the wreck on the far beach. Brought back, she pays in silver and dried fish.
- **The Watch** (radiant, M6.7): Halvard names an outlaw seen at the nearest camp. Dealt with, he pays, and the job comes again while a camp has one.

## Combat and barter

- **The outlaws** wander their camps until they see the player, then fight (M6.3, M6.4). Hallkel carries the howe's key and a ring; the others a pelt or a ring, found on their bodies.
- **The player** starts with a sword, 60 health, 6 silver and two flatbreads. Ulf sells an axe, a blade and a whetstone, and buys hides and metal. Gudrun sells flatbread, dried fish and a whetstone, and buys anything.
- **A shop's stock tops up its keeper's bag** (D80): each restock puts the keeper's `carries` back and adds the stock's items. Gudrun carries six flatbreads and her booth's stock adds the day's two.

## Essential NPCs

See [combat.md](combat.md#essential-actors). An actor with `essential` is down when its health runs out: no drops, no on-fall, no body to search, out of the fight. The stage sends `fighting/rise` ten seconds later and it stands at full health.

## The gate

- **`eb validate games/kaldvik`** finds no problems.
- **Bots:** seeded runs of its policy through the walk and fight stage match a golden file. The main quest is done in most runs, every stage of every quest is reached in some run, and no offer is refused.
- **Rapier and Recast in Node** (`apps/editor/src/walk/kaldvik.test.ts`): the shore walked headless; each of the five reaches the day's, the evening's and the night's places; the howe fought through Rapier until the outlaws lie; an essential NPC struck down and stood up.
- **The e2e** plays the built export:
  - by keys from New game to the ending (`kaldvik.spec.ts`);
  - by touch at 390×844 and 844×390 (`kaldvikPhone.spec.ts`): a talk, a trade with Gudrun, the hall's door, every screen fitting with 44 px targets and nothing axe finds.
- **The export** stays within its size budget, `kaldvik-web` in budgets.json.
- **On your phone:** walked from Pages at Low and Medium, for Phase 6's 30 fps. Evan's check.

## As built (M6.10)

- **The stage walks only the player's space.** The world module refuses `world/npcs-at` for any other, so the townsfolk keep their day only where the player is. The headless test walks the stranger through the doors to each space in turn to watch them.
- **Talks name no slots.** Halvard's talk can't say which outlaw The Watch picked; the journal names them.
- **The stranger's health is 60.** At 40, the headless howe fight left them at 6. At 60, it leaves them at 26. Untested for feel.
- **Each shop listed its keeper's goods twice.** Both the actor's `carries` and the shop's stock named the same goods, and a merchant's shelf is both, so Gudrun's six flatbreads showed as twelve. Each stock is now a top-up. The bot's golden runs were rewritten: with fewer flatbreads to eat, the silver comes home in 35 of their 50 runs where it came home in 41.
- **The prompt made a ghost click on touch.** Main's CI found a chest emptied under a thumb held on the prompt: the click a tap makes lands where the finger lifts, on what the use opened. The prompt cancels its touchstart now (`src/walk/prompt.ts`), and the e2e holds a prompt tap for 400 ms.
- **The e2e by keys runs at 800×600.** CI's software renderer draws the shore at about 20 fps there and 9 at 1280×900, and the walk slows with its frames. It takes 4.3 minutes alone.
- **Talks aim at the NPC, not their mark.** The crowd steps an NPC aside as the player comes, and the prompt wants them within 60° of where the player faces. At 390×844 Halvard stood beside the player at his mark and was never offered.
- **Readings** are in ROADMAP.md's Readings: the bot runs, the headless walk, the e2e and the export's size.

## Open questions

1. Should the townsfolk follow their schedules into the hall through its door, rather than each space keeping its own people? Today an NPC lives in one space.
2. The stranger bot brings the silver home in 71 of 100 runs; 26 reach the 1,000-turn cap still at it. Should the bot head for the main quest sooner, or is a bot that wanders a fair stand-in for a player?
3. Is 60 health right for a player who fights the howe's three at once, or should the howe let them be fought one at a time? Only play on a phone can say.
