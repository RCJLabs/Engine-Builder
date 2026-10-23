# Space-Wrecked's acts 1–2: what the rebuild has to carry (M4.12)

What the original game is made of in its first two acts, read from the space-wrecked repo for M4.12's import. Nothing in it was run. The decisions it led to are D62; the design is [specs/space-wrecked.md](../specs/space-wrecked.md). Paths are the original repo's.

## The acts

`data/campaign.json` holds three acts.

- **Act 1, Homeworld.** The hub is the hangar, and a fight heals everyone.
  - The player starts in their background's district with a half-built ship.
  - A job board offers three jobs; a shop buys and sells parts; heat rises with each job.
  - The act ends with Launch, once the flight checklist passes. Act 1 adds a rule to it: thrust must be at least mass.
- **Act 2, the run.** The hub is the ship.
  - Five sectors, each a seven-column map. Jumps eat supplies and add heat.
  - The nodes hold events, two stations, a nebula and hostile ships.
  - Past sector 5 lies a system of three worlds. The act ends with Settle.
- **Act 3, the colony,** is out of scope (`colony.json`, `expeditions.json`, the eight place events, each quest's act-3 step).

A quest's step is typed by its act: 1 is a job, 2 an event, 3 a place. Events carry no act of their own; their `kind` says where they appear. Contracts are act 1 only.

## The content

| Family | File | Records | Acts 1–2 | Notes |
| --- | --- | --- | --- | --- |
| Events | `events.json` | 29 | 21 | 14 in the run's pools (derelict 4, distress 5, trader 3, hazard 2), 7 for quests, 8 act-3 places; plus two drop tables |
| Quests | `quests.json` | 11 | 10 of 17 steps | 3 threads (one per background), 4 side chains, 4 loyalty quests (act 3 only) |
| Contracts | `contracts.json` | 29 jobs | all | 26 on boards and 3 for quests; 3 missions (clear, grab, hack), 6 twists |
| Districts | `districts.json` | 3 | all | 18 clients, 12 sites, a shop each |
| Backgrounds | `backgrounds.json` | 3 | all | miner, deserter, smuggler, each with a pursuer, a start and a district |
| Encounters | `encounters.json` | 24 | 19 | each a list of enemies |
| Enemies | `enemies.json` | 15 | all | hp, aim, defense, mobility, armor, weapon |
| Ships | `ships.json` | 9 | 8 | hostile presets: parts, tactics, scrap, the party that boards |
| Factions | `factions.json` | 4 sides | all | and which station names each owns |
| Traits | `traits.json` | 20 | all | each adds to hp, aim, defense, mobility or armor |
| Recruits | `recruits.json` | 8 backgrounds | all | 24 first and 24 last names |
| Companions | `companions.json` | 4 | all | each joins through a side chain's event |
| Crew jobs | `jobs.json` | 7 | all | stats, and a `station` edge each that works in act 2 |
| Sectors | `sectors.json` | 1 | all | the generator's rules and 11 node kinds |
| Worlds | `worlds.json` | 5 kinds | act 2's end | the system past the charts |
| Modules | `modules.json` | 79 parts | all | cost, power, mass, thrust, berths, life support, cargo, hp, damage, shield, intercept, heal |
| Balance | `balance.json` | 96 keys | 63 | heat, prices, supplies, the approach's chances, standing |

About 6,500 words of act 1–2 text are in the data. Many more sentences are built in the UI's code (`src/ui/campaign/*Text.js`).

## The rules the content leans on

- **Prices.**
  - A part buys at its cost and sells at half, rounded down to a 5.
  - Station prices follow standing: hostile 150%, cold 125%, neutral 100%, friendly 90%, trusted 75%; 100% at a station nobody owns.
- **The board.**
  - Three of the district's jobs, shuffled. Each picks a client and a site.
  - A twist comes half the time. Pay is `5 × int(min/5, max/5)`, changed by the twist's percent.
  - A drop comes by its chance. A won once-job never comes back.
- **A job's end.**
  - A win pays, with +10% or +20% for friendly or trusted standing with the client's side, and gives any part.
  - Heat rises by 8, or by 15 when the job is loud.
  - Standing moves: +2 for the client's side and −2 for the side the job is against on a win; −2 for that side on a loss.
- **Heat in act 1.**
  - From 50, the pursuer's hunters join every job.
  - From 75 a raid on the hangar is due, which blocks jobs. After a raid, heat drops to 40.
  - A payment buys 15 heat off: 50 credits for the miner, 75 for the smuggler; the deserter has none.
- **Heat in act 2.**
  - A jump adds 2 and a long jump takes 10 off; a scan, a survey and leaving a sector add 2 each.
  - At a station of the pursuer's side, the first trade adds 10.
  - Hunters wait where a jump comes out:
    - below heat 50, never;
    - from 50, 10% of the time;
    - from 75, 35%, as a task force;
    - at 100, always.
    - Never at a nebula or a station.
- **Supplies.**
  - The holds fill when the run begins. Capacity is 30, plus the quartermaster's lockers, plus cargo.
  - A jump eats 1 per crew member, three times that for a long jump.
  - Short of supplies, everyone loses 2 hp (never below 1) and the holds empty.
- **Crew.**
  - Room is the lesser of berths and life support.
  - Rank 1 comes at 3 fights, rank 2 at 8.
  - No wages, no morale and no death: someone who falls comes back on 1 hp.
  - In act 2 the med bay heals per jump, and each job's `station` edge adds its best value once (heal, gunnery, evasion, repair, scan, lockers).
- **Recruits.**
  - Two are offered at each station, from a seed of their own, so the same two are there each visit.
  - Each has a background, a job from its list, exactly `traitCount` traits shuffled from its list, and fights in its range.
  - Fee: `30 + 20 × traits + 40 × rank`.
- **Fights.**
  - The original has no auto-resolve. Every job, raid and boarding is a tactical battle.
  - Its tools measured win rates with the start crew: by mission, clear 39%, grab 69%, hack 76%; a hangar raid 51–61%; a cutter boarding about 52%.
  - The approach between ships is a dice phase of its own (`src/sim/approach.js`).
- **Act 1's goal** is the flight checklist:
  - power ≥ 0, and thrust ≥ mass;
  - berths and life support for the crew;
  - a bridge, reactor, engine and airlock;
  - the layout joined.

  `partsNeeded` (`src/sim/campaign.js:269-280`) turns it into a list of parts from stats alone.
- **Settle.** At any world node. The world's ratings are kept for act 3.

## Ownership

- **The repo has no licence file** and is `"private": true` in `package.json`.
- **Its owner is RCJLabs,** shown by its git remote, its `CNAME` and its own CLAUDE.md, which says the repo is public. No text in its data is marked as third party. `assets/LICENSES.md` says there are no third-party files yet.
- D62 marks the imported text all rights reserved, RCJLabs.

## Hard to carry as data

- **Closed lists whose meaning lives in code:**
  - event effects and needs;
  - quest step kinds by act;
  - twist fields;
  - job edges.
- **Station ownership is keyed by a station's display name.**
- **Seeds are built from strings,** for quest jobs, quest placement, recruits and the start crew's names. An exact replay of the original would need its mulberry32 and string hash. The rebuild doesn't aim for one.
- **Quest placement rewrites a sector's node:** its kind, name and event.
- **The approach and every battle are tactical code,** so their results can only be approximated.

## Open questions

1. Which of the original's measured win rates should the rebuild's fights be tuned toward first: by mission, or by job? D62 says toward the measured rates; the spec starts by mission.
