# Space-Wrecked, acts 1–2, rebuilt (M4.12, D62)

Proof #1: the first two acts of Space-Wrecked made with the engine's kits and a project's own scripts, from the original's data by an import script, and played to the settle choice by bots and by a player on a phone. The survey behind it is [research/space-wrecked.md](../research/space-wrecked.md).

## Where it lives

- **`games/space-wrecked/`** is an ordinary project folder: project.json, export.json, types/, records/, scripts/, ui/. Its NOTICE says the game's text is all rights reserved, RCJLabs (D62); the engine's licence doesn't cover it.
- **`games/space-wrecked/source/`** is a copy of the files the import reads from the original's `data/`, kept as they were. CI imports from it, so the check needs no network and no sibling repo.
- **`tools/import-space-wrecked/`** is the import script: `pnpm import:space-wrecked [--from <data folder>]`. It writes `games/space-wrecked/records/` and nothing else. The project's types, scripts, screens and settings are written by hand.
- **A test runs the import again** over `source/` and holds what it writes to the committed records, byte for byte. So the records in the repo are what the script makes.
- **The web export** is deployed by the engine's Pages workflow at `engine.rcjlabs.com/games/space-wrecked/`, and the confirm job checks it live.

## What the import maps

Each family below names its records and what doesn't carry over. "Script" means one of the project's modules (below), over records it reads.

- **Resources:**
  - `credits` (step 5);
  - `supplies`, whose capacity the run script keeps (D62's cost: a resource's `max` is fixed);
  - `heat`, 0 to 100.
- **Parts:** the 79 modules become items.
  - Each is worth its cost, so the shop buys at 100% and sells at 50%, as the original does.
  - Each fits a slot kind by its tags.
  - Its stats become modifiers on the ship: power, mass, thrust, berths, life support, cargo, guns, shield, intercept, heal.
- **The ship** is an actor with slots by kind. Launch's condition is the flight checklist over its stats:
  - power at least 0;
  - thrust at least mass;
  - berths and life support for the crew;
  - a bridge, a reactor, an engine and an airlock.

  The builder's layout has no stand-in (D62's cost). Each background's start ship becomes what that ship wears, and its parts on hand go in the bag.
- **Crew:**
  - The 7 crew jobs become actors with hp, aim, defense, mobility, armor and their weapon's damage.
  - The 20 traits become statuses whose modifiers are the trait's effects.
  - Each background's start crew are written actors.
  - The captain is the first of them, named from the background's list, with two traits.
- **Fights:**
  - The 15 enemies become actors.
  - The act 1–2 encounters become encounters with one combat record, `boarding`: health is hp, hit is aim, dodge is defense, armour is armor, and damage is the weapon's.
  - The 5 act-3 encounters are imported too, though nothing fights them.
- **Factions:**
  - The 4 sides become factions on −10 to 10, banded hostile, cold, neutral, friendly and trusted, at 150, 125, 100, 90 and 75 percent.
  - Station ownership is keyed by station id, not by display name.
- **Events:**
  - All 29 events are imported. A choice's `needs` on credits or supplies becomes its `cost`; parts and berths become conditions.
  - Each outcome's chance and effects carry over.
  - Effects with no kit counterpart are the script's: `sw/wound` (one random crew member with more than 1 hp, or all), `sw/sell-dearest` and `sw/drop` (a part drawn from a drop table).
  - The run's kinds get a deck each, with no event twice until the deck is through.
  - The 7 quest events go in no deck: the run script opens them at a quest's node.
  - The 8 act-3 events go in no deck; nothing opens them.
- **Quests:** all 11.
  - A thread starts with the game when its background is chosen. A side chain starts on its event's choice.
  - An act-1 step counts the script's `sw/job-won` for its job.
  - An act-2 step counts `events/chosen` for its event's done choices, and leads to a failed stage on its cold choices.
  - A step goes cold, failing, once its act is over (`fail-when` on the act).
  - An act-3 step is the quest's last stage. Settle ends the game there, so the journal shows what's ahead.
  - Payoffs that need act 3 aren't applied.
- **Contracts, districts and backgrounds** have types of the project's own (`types/contract.json`, `twist.json`, `mission.json`, `district.json`, `background.json`, `pursuer.json`), read by the board and campaign scripts.
- **Recruits** become roster recruit templates:
  - one per background and crew job, drawn by weight in the hall at each station;
  - names from the original's lists;
  - traits drawn from the background's list.
- **Companions** are 4 written actors that join through `join` in their events.
- **Sectors** become a layered map, `sector`, with 7 layers of 2 to 3 nodes, links both ways, and a 35% extra link.
  - 2 stations and 1 nebula are placed apart; the rest are rolled from the original's mix.
  - Its 11 node kinds keep their names, texts and charted flags.
  - The system past the charts is a second layered map, `system`, of three world nodes.
- **Balance** becomes one record of a project type, `rules`, that the scripts read: every act 1–2 key with its original value.

## The scripts

- **`campaign.ts`** owns:
  - the background chosen at New game;
  - the act;
  - the hangar's actions (Jobs, Shop, Pay, Launch);
  - the raid;
  - Launch;
  - Settle and the endings.
- **`board.ts`** owns the job board.
  - Three jobs from the district, each with a client, a site, a twist by chance, pay in the job's range, and a drop.
  - Taking one fights its encounter, with the pursuer's hunters added from heat 50.
  - Winning pays and gives the part; heat and standing move either way.
  - It raises `sw/job-won`. The shelf and the board are rolled again after each job.
- **`run.ts`** owns the run:
  - a jump eats supplies per crew member, and hunger hurts;
  - heat per move, and the hunters' roll on arrival;
  - quest events placed on nodes;
  - hostile ships, fought as boardings;
  - station services (supplies, repair, patching, the hall, the transponder swap);
  - scan, regroup and hide;
  - the system's survey and Settle.
- **`game.ts`** lists the kits' modules and these, and the bot.

The original's approach phase, the dice between two ships, isn't carried over. A hostile ship is fought as one boarding at once, its odds from the encounters kit (D62). The rebuild's rates are read against the original's measured ones.

## The gate

- **Import with zero errors.** `templates`-style test: the import over `source/` matches the committed records, and `eb validate games/space-wrecked` finds no errors. Warnings are listed and each is explained.
- **Bots: 500 seeded runs end,** and every act 1–2 step of every quest is reached in some run. The runs go to a golden file, as the templates' do.
- **On your phone:** played from Pages in landscape, and installed. This is Evan's check.
- **A UI-only export within a budget:** the web export's size, set from its first measured reading, and held by a test.

## Engine issues

Found while mapping; each is fixed in M4.12 or logged under Phase 4 in the ROADMAP.

1. **Gear: an item fits one named slot.** A ship with four engine bays needs an engine to fit any of them. Fixed: a slot can have a `kind`, and an item's `slot` may name the kind, so it fits any free slot of that kind.
2. **Roster: traits drawn in list order by chance.** The original shuffles the list and takes exactly N. To fix: a recruit's `traits-draw` of `shuffle`.
3. **Roster: a fee by rank.** The original adds 40 per rank. Logged.
4. **Stats: an effect on a random member.** `sw/wound` is the script's. Logged as a kit effect worth having.
5. **Economy: restock on demand,** after a job rather than by days. Logged. The board script keeps its own shelf until then.
6. **Economy: a resource's capacity that moves with gear.** Logged. The run script clamps supplies.
7. **Encounters: a squad of N.** The original boards with its three healthiest. Logged. The script passes the three as `fighters`.
8. **Maps: a node made known from afar,** for quest nodes. Logged.

## Open questions

1. How close must the rebuild's win rates come to the original's measured ones before the fights feel right? Untested for feel until Evan plays it.
2. Should the approach phase come back as a kit later (ship against ship, round by round), or wait for Phase 7's ship builder?
