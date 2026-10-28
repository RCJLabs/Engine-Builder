# Space-Wrecked's boarding fight, rule by rule

A read of Space-Wrecked's battle sim for M7.5's tactics kit (2026-10-28), read only, nothing run. Files are under `space-wrecked/src/sim/` unless a path is given. Every hit chance and damage roll in the golden battle (`tests/golden/example-battle.txt`) was recomputed from the rules below and matches. [kits-iii.md](kits-iii.md) is the survey this follows; [tilemaps.md](tilemaps.md) covers the map text, sight and cover already ported in M7.2.

## The numbers

From `data/balance.json`:

| Name | Value | | Name | Value |
|---|---|---|---|---|
| actionPoints | 2 | | sightRange | 20 |
| halfCover | 20 | | bleedOutTurns | 3 |
| fullCover | 40 | | rubbleMoveCost | 2 |
| overwatchPenalty | 15 | | fireDamage, airlessDamage | 2, 2 |
| flankCrit | 30 | | suitAir | 3 |
| closeRange, midRange | 3, 7 | | forgivingStep, forgivingMax | 10, 30 |

Weapons (`data/weapons.json`): damage, accuracy close / mid / long, crit, crit damage, clip.

| Weapon | Damage | Accuracy | Crit | Crit damage | Clip |
|---|---|---|---|---|---|
| rifle | 3–5 | 0 / +10 / 0 | 10 | 2 | 4 |
| shotgun | 4–6 | +20 / −5 / −30 | 20 | 3 | 3 |
| pistol | 2–4 | +15 / 0 / −15 | 10 | 1 | 6 |
| carbine | 3–4 | +10 / +5 / −10 | 5 | 2 | 3 |
| longrifle | 3–5 | −10 / +5 / +20 | 15 | 2 | 3 |
| dartgun | 2–3 | +10 / +5 / −20 | 5 | 1 | 4 |

Jobs and boarders (`data/jobs.json`, `data/enemies.json`): hp, aim, defense, mobility, armor, weapon; a job's order with its base numbers, and rank 1's.

| Unit | hp | aim | def | mob | arm | weapon | order: base / rank 1 |
|---|---|---|---|---|---|---|---|
| marine | 10 | 70 | 0 | 4 | 1 | rifle | suppress: uses 2, aim −30 / 3, −40 |
| engineer | 8 | 65 | 5 | 4 | 0 | shotgun | weld: uses 2, rounds 3 / 3, 5 |
| medic | 8 | 60 | 10 | 5 | 0 | pistol | patch: uses 2, hp 3 / 3, 5 |
| pilot | 8 | 65 | 10 | 5 | 0 | pistol | hustle: uses 1, ap 1 / 2, 2 |
| scout | 8 | 75 | 5 | 5 | 0 | longrifle | mark: uses 2, aim 15 / 3, 20 |
| xenobiologist | 7 | 60 | 5 | 4 | 0 | dartgun | sedate: uses 2, aim 0 / 3, 10 |
| quartermaster | 10 | 60 | 0 | 4 | 1 | carbine | kit: uses 2, armor 1 / 3 |
| pirate | 7 | 60 | 0 | 4 | 0 | carbine | |
| brute | 11 | 55 | 0 | 3 | 1 | shotgun | |

## The battle

- **State** (`battle.js:8-42`, `battleShape.js`): the map, which never changes; units in setup order; open doors as sorted keys; welds `{key, until}` in the order made; the side to play and the side that plays first (crew unless told otherwise; no game call says otherwise); the round from 1; one uint32 of RNG state; each side's misses in a row; options (forgiving, permadeath, sight, deadline, press); an objective; the winner.
- **A unit** (`battle.js:96-133`): id (`c1…` and `e1…` by side in setup order), side, kind, name, tile; `maxHp = max(1, hp + bonus)`, hp (a wounded start is allowed); aim, defense, armor; `mobility = max(1, …)`; weapon and ammo (a full clip); ap 0 until its first turn; overwatch false; status `active`, later `down`, `stable`, `dead` or `out`; bleed 0; air 3; the order's uses (0 for boarders); mark `{aim, turns}` or none; suppressed `{aim}` or none; asleep and kitted false. Setup refuses a unit off a walkable tile or two on one.
- **Who acts:** only `active` units act, are shot at or count as standing. Every unit but a dead one holds its tile (`moves.js:19`).

## Turns

- **`act`** (`battle.js:165-181`) works on a copy. `end` ends the turn. Anything else needs the unit to exist, be its side's, be active and have an ap. After an action, with no winner and none of the side's units active with ap left, the turn ends by itself.
- **`endTurn`** (`:392-407`): the side's ap to 0; its units lose `suppressed` and its sleepers wake; if the side is the crew, every mark wears (`turns > 1 ? turns − 1 : none`); a crew turn ending at or past the deadline loses; the side changes, and when it comes back to the first, the round goes up and welds with `until < round` give way, in the order made; then `startTurn`.
- **`startTurn`** (`:412-445`): for each of the side's units in order, until someone has won. Active ones lose overwatch and get 2 ap, and a sleeper gets 0. Hazards: fire burns for 2; vacuum takes a breath of air, then 2 a turn. Down ones bleed: `bleed − 1`, and at 0 they are `out`, or `dead` with permadeath. Then `decide`.
- **`decide`** (`:449-455`): no enemy active, the crew wins; else no crew active, the enemy wins (a squad all down loses at once); else an objective done wins for the crew. No draws.

## Costs

| Action | Cost | Needs |
|---|---|---|
| move, cost ≤ mobility | 1 ap | |
| dash, cost ≤ 2 × mobility | 2 ap | budget `mobility × min(ap, 2)` |
| shoot | all ap | ammo, an active enemy it can see |
| overwatch | all ap | ammo; no target |
| reload | 1 ap | a clip not full |
| stabilize | 1 ap | a down ally within one tile any way (Chebyshev), walls not checked; it is `stable`, bleed 0 |
| open | 1 ap | a shut door on that side of its tile, not welded |
| order | as below | |
| end | the side's ap to 0 | |

## Moving (`moves.js`)

- **`reachable(unit, budget)`:** Dijkstra with a bucket a cost, rising, first in first out within one, trying n, e, s, w. A step is refused across a wall, the hull, a hatch or a welded door (a door shut or open is no bar), onto a tile that can't be walked, or onto a foe; allies, down ones too, are passed through. A step costs 2 onto rubble, else 1. A tile keeps the first cost found that is lowest. At the end, every tile someone holds is taken out. The tiles come in the order first found, which the AI's ties follow.
- **`stepsFrom(sources)`:** breadth first from all at once, n, e, s, w; doors pass unless welded, units don't count, every step 1.
- **`walk`** (`battle.js:313-343`), step by step: a door not yet open is opened (the leg so far told, then the door); the unit steps; if the tile holds another unit, no one fires; otherwise each foe in setup order that is active, on overwatch and sees the tile fires once (the leg told, its overwatch cleared, the shot made with the penalty), until the mover is no longer active. A mover that falls stays where it fell; one hit and still standing walks on. The ap are paid before the walk.

## Shooting (`odds.js`, `battle.js:346-388`)

- **Range band:** `d² = dx² + dy²`; close at `d² ≤ 9`, mid at `≤ 49`, else long.
- **Sight:** `d² ≤ sight²` and a clear line (`sight.js`, ported in M7.2 as `lineOfSight`), with open doors clear and welded ones standing. Units never block it.
- **Cover** (`cover.js`, ported as `coverFrom`): a side faces the shooter when the shooter is strictly beyond it; an edge still standing (a wall, the hull, a hatch, a door shut or welded) is full cover, else the tile beyond's own; the best facing side counts, and with none the target is flanked. Open doors give none.
- **Hit**, the parts added in this order: aim; the weapon's accuracy for the band (always, even 0); −20 half or −40 full cover; −defense; −15 on overwatch; the shooter's suppression (negative); the target's mark, when the shooter is the other side; the forgiving bonus, `min(misses × 10, 30)` for the crew with the option on. Clamped to 0–100.
- **Crit:** the weapon's, +30 flanked, clamped 0–100. Flanking doesn't touch the hit.
- **`fire`:** ammo − 1. Draw 1: `percent(hit)`, a roll of 0–99 that hits below the chance. A miss adds to the side's misses and ends it. A hit zeroes them; draw 2: `percent(crit)`, made even at 0 or 100; draw 3: damage, `int(min, max)`. Damage `max(1, roll + (crit ? critDamage : 0) − armor)`.
- **`hurt`:** hp to `max(0, hp − damage)`. At 0, ap and overwatch go; the crew are `down` with bleed 3, boarders `dead`. Then `decide`.
- **The RNG** (`src/core/rng.js`): mulberry32. A string seed is FNV-1a over UTF-16 code units, then murmur3's fmix. `int(lo, hi) = lo + floor(u32 × (hi − lo + 1) / 2³²)`; `percent(c) = int(0, 99)`, refusing a `c` that isn't a whole number 0–100.

## Overwatch

Set by its action with ammo, for all ap, no target needed. It fires only at a foe stepping onto a tile it sees (not the start, not a tile shared with the mover's ally), once, with −15, suppression, marks and forgiving as for any shot, counting misses. It is cleared by firing, by its own side's next turn, by going down and by a sedate dart. Doors opened and shots don't set it off. Several watchers fire in setup order.

## Down and out

Crew at 0 hp go down with bleed 3 and lose a point at the start of each of their own side's turns; at 0 they are out (dead with permadeath, which the game never turns on). Stabilize makes them stable for good; patch gets them up. A down, stable or out unit can't be shot, doesn't count as standing, blocks foes, lets allies through without stopping, stops overwatch on its tile, and never blocks sight. Boarders at 0 are dead at once.

## The seven orders (`orders.js`)

The crew's only. Each costs a use (per fight) and needs an ap. Targets (`orderTargets`): an enemy is an active foe it sees (suppress and sedate also need ammo); an ally is another of its side within one tile any way, down, stable or hurt; kit is itself or an ally beside, active and not yet kitted; self is itself; door is a side of its tile with a door not welded.

| Order | Effect |
|---|---|
| suppress | all ap, ammo − 1, the target's `suppressed = {aim}`; cleared at the end of the target's side's next turn. No roll |
| weld | ap − 1; the door shut and welded until `round + rounds − 1`; it blocks walking, sight and opening and is full cover |
| patch | down or stable: `hp = min(maxHp, hp)` of the order, up, bleed 0, ap 0; active: `hp + order.hp` to maxHp. The medic's ap − 1 |
| hustle | ap + the order's ap, at no cost; a move's budget stays capped at 2 × mobility |
| mark | ap − 1; the target's `mark = {aim, turns: 2}`: through this crew turn, the enemy's and the crew's next |
| sedate | the dart's odds (a shot's without overwatch, plus `steady` = the order's aim when nonzero), all ap, ammo − 1, one `percent` draw; misses count; a hit puts it asleep (0 ap at its side's next turn, then awake) and clears its overwatch |
| kit | ap − 1; the target's armor + the order's, ammo to a full clip, kitted for the fight |

## The AI (`ai.js`, `orderAi.js`, `press.js`)

- **`aiAction`** plans one action a call, from scratch, with no randomness: the first unit of the side in order that is active with ap; for the crew, an order first if `orderAction` gives one; reload when out; else the best plan, which opens a door, moves, shoots or watches.
- **Plans** (`plansFor`): each tile of `reachable(mobility × min(ap, 2))` in its order, with the doors its path opens; a breach plan for each shut door beside it when ap ≥ 2. At each spot: `threat`, the sum of each foe's `harm` on it there; `risk`, the overwatch along the path; `steps`, foes' `stepsFrom` (99 when unreachable); `exposed`, the foes it would be flanked by. With an ap left after the move, a shot plan at each foe it sees (`attack = harm`) and a watch plan (`attack` 1 within 8 steps, else 0.3).
- **Score:** `attack − 0.8 × (threat + risk) − (shot ? 0 : 0.2 × steps)`.
- **`harm`:** `hit/100 × (Σ over each damage roll of [(1 − c) × (min(dealt, hp) + 4 × kill) + c × (min(dealt', hp) + 4 × kill')]) / rolls`, c the crit chance, dealt and dealt' without and with crit, kill when dealt ≥ hp.
- **`bestPlan`:** prefer plans not exposed; a shot is allowed exposed only with `attack ≥ 1` above every covered shot; of the allowed, shots with `attack ≥ 0.4` and `score ≥ holding − 3` win over the rest; the first highest score wins ties.
- **`orderAi`:** suppress the most dangerous foe when its own best shot is under 40; weld the nearest door toward the foes when fresh, hurt and unseen; patch the first down, else the most hurt; hustle when fresh with a foe seen and a poor shot; mark the weakest unmarked; sedate the strongest awake with odds ≥ 40; kit an ally, else itself.
- **`press`:** with no foe in sight, step toward them (one ap's walk to the lowest `stepsFrom`, then the cheaper, then the first found), else open a door; else `aiAction`. Boarders on the player's ship press.

The AI's `harm` and score are fractions in doubles (`ai.js:162-173`, `:116`): a port in whole numbers must scale them and may part from Space-Wrecked at near ties.

## Deploy (`deploy.js`)

The crew on the bridge's tiles, the boarders at the tiles nearest the hatches by `stepsFrom`, each side taking tiles by steps, then y, then x. On the example ship: the squad at (9,2), (9,3), (10,3), the boarders at (5,4), (5,3), (4,4), (6,4).

## Taps (`fight.js`)

Nothing on the enemy's turn. A tap on a crew member selects them; on an enemy, previews the shot `{target, odds}` with its parts, and a second tap shoots; on a tile it can reach, previews the move `{to, cost, dash, path}`, and a second tap moves; elsewhere clears. An order previews its target and what it changes (a mark's shot before and after; a suppression's best enemy shot before and after), and a second press gives it. Buttons for overwatch, reload, stabilize, open, end. The enemy's turn plays action by action, a failed action standing in for `end` and 100 actions forcing it.

## The golden battle

`tests/fixtures/example-battle.json`: the seed `"example battle"`; a marine, an engineer and a medic at (9,2), (9,3), (10,3) against two pirates and a brute at (5,4), (6,4), (4,4); 16 actions. `tests/golden/example-battle.txt` logs its 33 events, one a line, from Round 1's crew turn to "The crew wins." It uses no overwatch, orders, forgiving, hazards, bleeding or objectives. Its 26 draws, 3 a hit and 1 a miss: 14, (crit), 5; 19, (crit), 2; 61, (crit), 3; 7, 6, 5; 93; 57, 14, 2; 58, 28, 4; 90; 27, 26, 5; 22, 36, 3 (a crit roll shown only when it crits). Its map is `tests/golden/example-ship.map.txt`, 12 × 7, which the engine's `test/tileMaps.ts` crops to 11 × 5: Space-Wrecked's (x, y) is the engine's (x, y − 1).

## Open questions

1. The AI scaled to whole numbers: does it pick as Space-Wrecked's does on its own `ai.test.js` cases?
2. Rubble, fire and vacuum are hazards on the map: where would the engine's tilemap keep them?
3. Objectives (grab, hack) and the deadline: wanted for Proof #3's raids, or not at all?
