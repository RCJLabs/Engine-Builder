# Research: fights in the RCJLabs games

How the games define a fight, resolve it, and say beforehand what it will cost, and what that asks of the engine's encounter kit (M4.7, [D57](../decisions.md)). Paths are under `rcjlabs/<repo>/`; each repo was read, never run. landnam-ue and mythos-clash were left out, and chooser-of-the-dead was read for its mechanics only. "Inferred" marks a reading the code doesn't state.

**The finding.** No game here auto-resolves a fight and shows exactly the odds it rolls. Ludus auto-resolves every bout but quotes a separate model; Spliceworld quotes 32 sampled fights on another stream; Space-Wrecked has no auto-resolve at all. What every game does get right is a single roll whose chance one function both shows and rolls: Space-Wrecked's approach orders, Wasteland's retreat, Ludus's appeal for mercy, landnam's blows, Chooser's last battle.

## Fights as data

- **space-wrecked.** `data/encounters.json` is a `squad` and a list of `{id, name, enemies: [enemyId…]}`; `data/enemies.json` gives each enemy `{hp, aim, defense, mobility, armor, weapon}`. Contracts (`jobs[].encounter`), ships (`party`), quests (`place.party`), backgrounds and expeditions name an encounter by id. No event starts a fight.
- **wasteland-protocol.** `ENEMY_POOL` units (`game.js:11685-11724`): `maxHp`, `speed`, `armor`, `dmgBase`, resistances and a weighted table of intents. `FORMATIONS` (`:11746-11794`) are named groups used 55% of the time, named on the node before it is taken.
- **ludus.** No data file: offers are built in code (`ludus.jsx:7473-7483`), fighters have six stats, a class and its counter.
- **landnam.** No authored encounters: foes are rolled from weighted archetypes (`src/data/foes.ts:47-58`), their count from the warband's size (`src/sim/battle.ts:198-209`).
- **spliceworld.** `data/enemies.json`: `{id, waves: [unit…], reward, tier}`; a wave's next unit comes in as the last falls.
- **dirtbag.** An expedition is a wall: `{grade, gradeReq, pitches, days, stormOdds, cost, pays}` (`content/expeditions.full.ts:6-20`).

**Common:** an encounter is a list of references into a table of stat blocks, and what winning pays.

## How a fight is resolved

| Game | Resolution | Seeded | Rounds |
| --- | --- | --- | --- |
| space-wrecked | approach: up to 3 rounds of orders, each gun its own percent roll; boarding: an XCOM battle | yes | 3, then a battle |
| wasteland-protocol | turns by speed, damage `dmgBase` + `rand 0–4`, no miss roll | no: "combat stays on Math.random" (`game.js:2662`) | to the last |
| ludus | `simulateFight`: up to 12 rounds of power × tactic × `(0.72 + R() × 0.56)`, ends at vigour 20 or the horn (`ludus.jsx:12600-13063`) | yes, one shared stream | 12 |
| landnam | per action: `2d6 + might + wall` against evasion, damage `1d6 + might/2` (`sim/swing.ts`, `strike.ts`) | yes, a stream per action | 50 |
| spliceworld | `step(battle, action)`, one round, an event stream out (`battle/engine.js`) | yes, a counter in the save | 60 |
| chooser | the last battle: no dice, souls counted at each front (`engine/src/campaign/battle.ts:83-205`) | no draws | one |
| dirtbag | the player climbs; the sim rolls storms and a partner's pitches | yes | days |

Every game caps its rounds. At the cap, landnam gives the fight to the side with more standing, spliceworld to the larger share of health left, Ludus to blood spilt.

## What is shown beforehand

- **Exact, by the function that rolls:**
  - Space-Wrecked's approach orders, each with its chance (`approach.js:172-185`), with a test that the rolled chance is the shown one (`tests/encounter.test.js:252-271`);
  - Wasteland's retreat (`retreatOdds`, `game.js:13166-13171`);
  - Ludus's missio (`ludus.jsx:12672-12695`);
  - landnam's per-blow hit odds, counted over all 36 outcomes of 2d6 (`swing.ts:171-193`);
  - afterglass's sally ("about N%", `prototype/src/slice/sim.js:105`);
  - Chooser's whole battle, the UI calling the same `fight()` the commit does (`ui/src/campaign/screens.tsx:2884`).
- **Exact by enumeration:** dirtbag's summit odds, a memoised walk over day, pitch, energy and weather (`expeditions.ts:161-269`), but with partner chances taken from 24 sampled runs (`:115-131`), and with `**` and `Math.exp`, which our sim can't use.
- **Approximate:**
  - Ludus's win % is a separate analytic model, measured by its own test as 2.5 points too close to even at the extremes (`test/checks/odds.mjs:65-82`);
  - Spliceworld's forecast is 32 replays on the stream `forecast`, while the fight sent rolls on `pilot` (`battle/forecast.js:91-135`, `autoplay.js:52-55`), shown as bands from Walkover to Not survivable;
  - Wasteland's threat board likely shows a floor (inferred: it leaves out the roll, `game.js:11305`).
- **Nothing:** Space-Wrecked's boarding and Wasteland's fights show no win chance, only what a win pays and a loss costs.

## What a fight leaves

- **Wounds carry over:** Space-Wrecked's crew keep the health they end with and the downed come back at 1; Ludus gives injuries by weeks; Wasteland drags its downed clear with a scar roll.
- **Death is conditional:** Space-Wrecked's permadeath, Ludus's stakes ("sine": the loser dies; otherwise an appeal), Wasteland's bleed-out, landnam's fate roll by ground held.
- **Rewards:** credits and parts (Space-Wrecked), scrap by tier (Wasteland), purse and fame (Ludus), food and wood per foe (landnam).
- **A way out that costs:** Space-Wrecked's flee and leave, Wasteland's withdraw (a wound to everyone) and retreat (scrap, 80% less 9 a foe), Ludus's white cloth (the purse and fame), Spliceworld's scamper.

## Testing

- landnam's `test/odds.test.ts` plays 2,000 real strikes, buckets them by the odds shown and holds each bucket within 3 points.
- dirtbag's harness holds its summit odds within 10 points of 300 bot trips.
- Chooser checks properties over 300 runs: held means strength at least the foe's.
- Space-Wrecked, Ludus and Wasteland measure win rates by self-play in tools.

## What this asks of the kit

1. **One table, read by both the preview and the roll** (Chooser, Space-Wrecked's approach). A fight worked out round by round is still one roll, against the exact table of how it can end.
2. **Exact, with no sampling** (landnam's counting, dirtbag's walk). Our sim allows `+ − × ÷` on numbers, which every engine rounds alike, and no `**` or `exp`.
3. **A cap on rounds,** with an outcome of its own when it is reached.
4. **Encounters as records** naming foes from a table of stat blocks, as Space-Wrecked's do, so M4.12's import is a mapping.
5. **Wounds that stay, and falls with a consequence** the author chooses: a status, or leaving the roster.
6. **Ways out are other choices** of the same event, with their own costs (Wasteland, Space-Wrecked, Ludus).
7. **A test that the shown table is the rolled one,** exactly, rather than within points.

## Open questions

1. Ludus's tactics change the fight's own odds, while Wasteland's and Space-Wrecked's ways out are separate choices. The kit's stances are choices with modifiers; whether that is enough for Ludus's crux orders mid-bout is for M4.12's import to find.
