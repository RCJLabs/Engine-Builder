# Space-Wrecked, acts 1–2, rebuilt (M4.12, D62)

Proof #1: the first two acts of Space-Wrecked, made with the engine's kits and the project's own scripts. Its content comes from the original's data by an import script. Bots play it to the settle choice, and a player on a phone does too. The survey behind it is [research/space-wrecked.md](../research/space-wrecked.md). This page describes the game as built.

## Where it lives

- **`games/space-wrecked/`** is an ordinary project folder: project.json (eleven kits, a calendar of one tick a day), export.json, types/, records/, scripts/, ui/. Its NOTICE says the game's text is all rights reserved, RCJLabs (D62). The engine's licence doesn't cover it.
- **`games/space-wrecked/source/`** is a copy of the files the import reads from the original's `data/`, kept as they were. The import reads from it, so the check needs no network and no sibling repo. Biome leaves `source/` and `records/` alone.
- **`tools/import-space-wrecked/`** is the import script: `pnpm import:space-wrecked [--from <data folder>]`. It writes `games/space-wrecked/records/`, 455 files, and nothing else. The project's types, scripts, screens and settings are written by hand.
- **A test runs the import again** over `source/` and holds what it writes to the committed records, byte for byte. So the records in the repo are what the script makes.
- **The web export** is written by `pnpm build` (`pnpm build:games`) into the editor's `dist/games/space-wrecked/`. The Pages workflow deploys it at `engine.rcjlabs.com/games/space-wrecked/`. CI's confirm job loads it live and checks every file it loads. The editor's service worker leaves `/games/` to the game's own.

## What the import maps

Each family below names its records and what doesn't carry over. "Script" means one of the project's modules (below), working over records it reads.

- **Resources:**
  - `credits` (step 5);
  - `supplies`, whose room the run script keeps, since a resource's `max` is fixed (engine issue 6);
  - `materials`, act 3's, which nothing gives.
- **Flags:**
  - `heat`, 0 to 100: hunters from 50, a raid from 75;
  - `room`, the roster's cap, set by the refit script to the lesser of the berths and the life support.
- **Parts:**
  - The 79 modules become items tagged `part` and their own tags. Their project fields are category, maker, base and size.
  - Each is worth its cost. The three shops, one per district, sell at 100% and buy parts at 50%, as the original does.
  - Each shop's stock is a table of 4 picks, none twice, restocked every day (engine issue 5).
  - A part's stats become modifiers on the ship: power, mass, thrust, berths, life support, cargo, hull, guns, shield, intercept and heal. They also add the counts of bridges, reactors, engines and airlocks.
- **The ship** is an actor with 40 hull slots, `hull-01` to `hull-40`, each taking any part. The frame's `maxModules` is 40. A part fits any free slot: the builder's layout has no stand-in (D62).
  - Each background's start ship becomes what that ship wears, and its parts on hand go in the bag.
  - Launch's condition is the flight checklist over the ship's stats. Power must be at least 0, thrust at least the mass (lift-off's 100 in act 1), and there must be berths and life support for the crew. It also needs a bridge, a reactor, an engine and an airlock.
- **Crew:**
  - The 7 crew jobs become actors with hp, aim, defense (both of these down to −100), mobility, armor, damage (their weapon's mean, rounded) and fights.
  - The 20 traits become statuses tagged `trait`, whose modifiers are the trait's effects.
  - Each background's start crew are recruits rolled at New game. The captain is the first of them: named from the background's list, with two traits shuffled from all 20.
  - Ranks are the roster's bands on `fights`: green, rank 1 from 3 fights, rank 2 from 8.
- **Recruits:**
  - 3 captain templates, 7 crew templates (one per job) and 30 hall templates (one per background and job the original lists).
  - Names come from the original's lists, and traits are shuffled from the background's.
  - A hall template costs 30 credits, plus 20 a trait, with no fee by rank (engine issue 3).
  - The station bar, `station`, offers 2 a visit, weighted as the original's.
- **Companions** are 4 written actors that join through `join` in their events.
- **Fights:**
  - The 15 enemies become actors.
  - The act 1–2 encounters become 24 encounters, the original's consecutive foes merged. There is one combat record, `boarding`: health is hp, hit is aim, dodge is defense, armour is armor, damage is damage, and hits land between 5% and 95%.
  - The 8 ships with boarding parties each get an event, an encounter and a loot table, `ship-<id>`. The event offers:
    - **waved through**, if the ship's side is friendly;
    - **fight**;
    - **run**: 35% to get away with +4 heat, else fight.

    Winning rolls the ship's salvage and costs 3 standing with its side. A pursuer's ship also sets heat to 40.
  - The `hostile` deck draws the cutter (weight 3), and the corvette from the third map entered (weight 1).
  - Each background's raid is an event and an encounter, `raid-<bg>`. Win or lose, heat goes to 40; losing also takes the dearest part on hand, or half the credits.
- **Factions:**
  - The 4 sides become factions on −10 to 10. They are banded hostile, cold (−5), neutral (−1), friendly (2) and trusted (6), at 150, 125, 100, 90 and 75 percent of the price.
  - The 12 stations are records of the project's `station` type, with a name and a side. A station's ownership is keyed by station id, not by display name.
- **Events:** all 29 are imported.
  - A need on credits or supplies that every outcome pays becomes the choice's `cost`.
  - A berth becomes `roster.room >= n`, and parts become `inventory.tagged(tag: part) >= n`.
  - Effects map to `add-resource`, `add-to-flag` on heat, `change-standing`, `roll-loot`, `join`, and the quests' `start-quest`.
  - Two effects are the crew script's: `wound {hp, all}` hurts one crew member with more than 1 hp, rolled, or all of them, never the last one; `sell-part {count}` sells the dearest parts on hand at half their worth (engine issue 4).
  - Decks: `derelict`, `distress`, `trader` and `hazard`. An event doesn't come again until the deck's others have. The 7 quest events go in no deck: the run script opens them. The 8 act-3 events go in no deck, and nothing opens them.
  - Loot tables: `salvage` and `colony`.
- **Quests:** all 11.
  - A background's thread starts once `campaign.background` names it. A side chain starts on its event's choice.
  - An act-1 step counts `board/won` for its job, and fails once `campaign.act >= 2`.
  - An act-2 step is done on its event's done choices, and fails on its cold choices or once the ship is past the charts.
  - Every quest ends at `colony`, act 3's stage, done once `campaign.act >= 3`, which Settle sets. So the journal shows what was ahead. Payoffs that need act 3 aren't applied.
- **The project's own types:** `mission` (with the board's breaks: clear 95, grab 60, hack 58), `twist`, `contract`, `district`, `client`, `site`, `background`, `pursuer`, `station`, `world-kind` and `rules`. The scripts read them.
- **The run's maps:**
  - **`sector`** is a layered map of 7 layers of 2 to 3 nodes, linked both ways with a 35% extra link. It places 2 stations and a nebula apart, and rolls the rest from the original's mix.
    - Its moves are `jump` and `long` (reach 2). Each runs the run script's `jump` effect.
    - Its 11 node kinds keep their names and texts. A station's arrival docks. Derelict, distress, trader, hazard and hostile draw from their deck.
  - **`system`** is a drawn map past the charts: the way in and three worlds, moved by `fly`. Each world's kind is one of the 5 `world-kind` records, rolled as the system is entered, with its name from the rules.
- **Balance** becomes one record, `rules/balance`. It holds every act 1–2 key the scripts read, with its original value, plus the sector and world names.

## The scripts

`game.ts` lists the kits' modules and five of the project's, starts in `choose`, and names the bot, `captain`.

- **`campaign.ts`:**
  - the background chosen at New game;
  - the act;
  - the hangar's actions in act 1;
  - Launch, once the checklist passes;
  - the raid;
  - Settle and the ending.

  `who` is the captain's name and background, for the hangar.
- **`refit.ts`:**
  - fitting parts on hand to free hull space, and stripping them back into the bag, at the hangar and docked;
  - `room` kept to the ship's berths and life support;
  - facts `fitted` and `free`.
- **`crew.ts`:**
  - `wound` and `sell-part`;
  - after every fight, each member's fights counted for their rank. In act 1 everyone is healed; after it, a fallen member comes back on 1 hp. Nobody dies.
  - The crew screen's rows by place (`member`, `hp`, `about`) and the bar's offer kind (`offer-kind`).
- **`board.ts`, act 1's job board:**
  - Three jobs from the district. A quest's job comes first while its quest waits on it, then the rest are shuffled.
  - Each job has a client, a site, a twist by chance, pay in the job's range, and a part.
  - The board is a made event, `event:board`, and each job a made encounter, `encounter:job-1` to `job-3` (D44). So each choice's button shows the odds its fight rolls.
  - Pay, the part, heat and standing are in the encounter's win, lose and draw. From `huntHeat` the pursuer's hunters join the foes.
  - After a fight it raises `board/won` for its job, waits a day (the shops restock) and rolls the board again.
- **`run.ts` and `voyage.ts`, act 2:**
  - five sectors crossed by the maps kit's jumps;
  - a jump eats supplies, a long one more, and hunger hurts;
  - heat moves per jump, and the hunters roll where a jump comes out;
  - quest events are met at a layer rolled as the sector is entered (2 to 5), or past it;
  - docked, a station's services: supplies by the crate, patching up, the bar's hires, the transponder swap and refits, each priced by the side's band;
  - scan, regroup and hide;
  - past the charts, the system's survey and Settle.
- **`captain.ts`** is the bot. It sees only what a player sees: the options, the facts and the odds a choice shows.
  - In the hangar it fits what the checklist lacks, and buys the cheapest part a failing line needs, looking in the shop one turn in three. It pays the pursuer down when heat runs high, and takes the job with the best odds, or its own thread's job most of the time.
  - At an event it takes a choice that moves a quest on, and otherwise fights three times in four.
  - Docked, it fills the holds, patches up, swaps the transponder when hot, and now and then hires.
  - On the run it jumps toward the jump point, hides or jumps long when hot, and settles at the first world.

The original's approach phase, the dice between two ships, isn't carried over. A hostile ship is fought as one boarding at once, its odds from the encounters kit (D62). The whole crew fights, not the original's three healthiest (engine issue 7).

## The tuning

The original's fights end sooner than the encounters kit's do by default, which go on until a side is down. Left at that default, the start crew's odds were far from the original's. So each fight has its `breaks`, the share of the foes' health whose loss makes them give up, set so the start crew's odds match the original's measured rates:

| Fight | `breaks` | Here | The original |
| --- | --- | --- | --- |
| Grab (12 contracts) | 60 | 68.7% | 69% |
| Clear (10) | 95 | 38.2% | 39% |
| Hack (7) | 58 | 77.9% | 76% |
| Raid (3 backgrounds) | 40 | 56.3% | 51–61% |
| Cutter boarding | 62 | 53.0% | about 52% |

"Here" is the table's win share for each background's start crew, averaged over the contracts of each mission. These are stand-ins: the fights are untested for feel.

The fight table is worked out exactly, round by round, and a run works out many of them. `endsOf` in the encounters kit keeps the last 64 it worked out, keyed by every number that shapes them. That made 20 runs 2.6 times faster (Readings).

## The gate

- **Import with zero errors.** The import over `source/` matches the committed records. `eb validate games/space-wrecked` finds no errors and two warnings, each explained:
  - W108 on `heat`, which only the scripts read;
  - W109 on `room`, which only the refit script sets.
- **Bots: 500 seeded runs end** (`tools/cli/test/spaceWrecked.test.ts`):
  - all settle a world;
  - no offer is refused;
  - every act 1–2 stage of every quest is reached in some run;
  - each matches its golden run in `fixtures/space-wrecked-captain.golden.json`.
- **The screens draw everything the game offers.** The captain's runs for 4 seeds are played again through the worker's host, with the game alongside. At every step, the captain's action and every other action on offer must be a button that the screens on top, or the refit screen they open, draw. All 8 screens show on the way, and all 26 kinds of action are offered somewhere in those runs, so each is held to a button.
- **On your phone:** played from Pages in landscape, and installed. This is Evan's check.
- **The e2e** (`apps/editor/e2e/spaceWrecked.spec.ts`) plays the built export by touch at 844×390 and 390×844: a captain chosen, the checklist read, a job taken from the board with its odds shown, and a part fitted. Each screen is checked for fit, 44 px targets and axe.
- **A UI-only export within a budget:** 540,000 bytes for the web export, set from its reading of 520,046 (Readings), held by the same spec.

## Engine issues

Found while mapping. Each is fixed in M4.12 or logged under Phase 4 in the ROADMAP.

1. **Gear: an item fits one named slot.** A ship with four engine bays needed an engine to fit any of them. Fixed: a slot's `takes` lists tags, and an item with no `slot` fits any slot that takes one of its tags. It goes in the first free one unless `equip` names the slot ([stats.md](stats.md)).
2. **Roster: traits drawn in list order by chance.** The original shuffles the list and takes exactly N. Fixed: a recruit's `draw` of `shuffle` ([roster.md](roster.md)).
3. **Roster: a fee by rank.** The original adds 40 per rank. Logged.
4. **Stats: an effect on a random member.** `wound` is the crew script's. Logged as a kit effect worth having.
5. **Economy: restock on demand,** after a job rather than by days. Logged. The board waits a day after each job, so the shops restock then.
6. **Economy: a resource's capacity that moves with gear.** Logged. The run script leaves behind supplies past what the holds take.
7. **Encounters: a squad of N.** The original boards with its three healthiest. A deck's event can't pass fighters, so the whole crew fights. Logged.
8. **Maps: a node made known from afar,** for quest nodes. Logged. A quest's event is met at a rolled layer instead.
9. **Roster: a hall's offers as facts.** A screen couldn't say who a hire button hires. Fixed: `roster.offer`, `offer-recruit`, `offer-traits` and `offer-fee` ([roster.md](roster.md)).
10. **Maps: a map's name as a fact.** Fixed: `maps.name` ([maps.md](maps.md)).
11. **Screens: a list of part of what's on offer.** A list of `offered` held every action on offer, so the refit screen listed Launch and Undock beside its parts. Fixed: an `offered` list's `takes` names the action types it lists, here `refit/*` ([screens.md](screens.md#lists)).

## Open questions

1. How close must the rebuild's win rates come to the original's measured ones before the fights feel right? Untested for feel until Evan plays it.
2. Should the approach phase come back as a kit later (ship against ship, round by round), or wait for Phase 7's ship builder?
3. Should fights break as the original's do, as a field of the encounters kit, rather than through each fight's `breaks`?
