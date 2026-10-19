# Factions, rosters and calendars in the existing games

What the rcjlabs games do with standing, with the people a player manages, and with time, so Kits II (M3.5 and M3.6, [D43](../decisions.md)) covers them. Read in the repos' files, nothing run, on 2026-10-18. Paths are each repo's own.

## Factions and standing

- **space-wrecked** (`src/sim/standing.js`, `data/balance.json`). Four sides, each a whole number from −10 to 10; the pursuer's starts at −10, the rest at 0. Five levels by where each begins: hostile, cold (−5), neutral (−1), friendly (2), trusted (6). A station charges a share of its price by its side's level, 150, 125, 100, 90 and 75 percent; jobs pay 10 or 20 percent more when friendly or trusted; a side's patrols wave a friendly crew through and fire first on a hostile one. A finished job gives +2 to the client and −2 to the side it worked against. No drift. Each of the four companions belongs to a side.
- **landnam** (`src/data/clans.ts`, `src/sim/neighbours.ts`). Four neighbours from −100 to 100, opening at −10 (Norse) or +10 (native), give or take a seeded 6. Bands: hostile, cold (−35), wary (−10), friendly (25), sworn (60), each with a line of words. Raiding −45, trading +9, tribute +22. Standing drifts 0.12 a day toward 0. No barter below −35; the trade rate runs 0.6 to 2.0 across the range; raids come from the angriest neighbour.
- **ludus** (`src/ludus.jsx`). Patrons with favour from 0 to 100, in six bands from "affronted" to "devoted", dripping 0.35 a week; their wants have deadlines of 4–5 weeks (+11 to 16 met, −8 to 11 lapsed). Rival houses carry two numbers, grudge and warmth. Four reputation tallies decay ×0.985 a week, and the leading one names the house.
- **dirtbag** (`app/src/sim/scene.ts`, `content/scene.ts`). Two crowds from 0 to 100, from 50, in five bands (Distrusted to Beloved at 25/45/56/76). Moves come in opposed pairs (old guard +12, gym crowd −3). Perks at 56 and 76; a fourth answer opens at 65.
- **chooser-of-the-dead** (`packages/engine/src/campaign/state.ts`). Five gods, standing unbounded from 0, moved by data rows in pairs (odin −1, hel +1). Favours open at 3, 4 and 8; two endings need 8 and a lead of 1 over the best of the others.
- **rule-or-drool** (`src/engine/config.ts`). Three blocs from 0 to 100, from 50: one at 0 ends the run, all three at 92 or more is an ending; each era pulls every meter 22 percent back toward 50.
- **wasteland-protocol** (`game.js`). Six recurring faces from −3 to 3 for a run, shown in words only (Bad blood to Trusts).
- **2060td** (`src/content/leagues.ts`). League standing from 0 up, in five bands (0, 150, 400, 800, 1,400) that raise loot; it decays 30 a day after 36 hours away.
- **spliceworld**, **football-manager-simulator**, **afterglass**: one number each (notoriety that never falls, a coach's reputation, the Church's dread from 0 to 5), each gating what comes next.
- **None:** project-ascent, sandbagged, who-am-i-. climbing-world-traveler has a design for regional standing (−100 to 100, bands at ±30 and ±60) but no code.

### What most share

1. **A whole number per faction,** in the save under the faction's id.
2. **Bands by where each begins,** read as the last one passed, usually five, often with words of their own.
3. **Moves written in content,** most often in pairs: a gain with one and a loss with another, written as two moves. None spreads a change to allies or rivals by itself.
4. **Prices by band** where there is trade: Space-Wrecked's five shares, Landnam's rate.

### Where they differ

- **Range:** −3 to 3, −10 to 10, −100 to 100, 0 to 100, or no bound.
- **Start:** 0, 50, or a value per faction (Space-Wrecked's pursuer, Landnam's two kinds of neighbour).
- **Drift:** Landnam, Ludus, 2060td and rule-or-drool pull standing back over time; Space-Wrecked, Dirtbag, chooser and wasteland don't.
- **Shown** as words only (wasteland, Dirtbag) or as numbers.

## Rosters

- **ludus.** 8 to 14 cells by the house's rank. A market of 4 men every 3 weeks, made from 7 origins and 30 names each, priced by quality; each man has 6 stats, an age, morale, and a 55 percent chance of a trait from 8. Injuries of 6 kinds, 1 to 4 weeks. Bonds are brother or rival, strength 1 to 100, at most 3 a man, growing each week; a brother's death brings grief. Men leave dead, freed, retired, sold or escaped. Ids come from a counter.
- **space-wrecked.** Crew room is the lesser of berths and life support. Each station offers 2 recruits worked out from the seed, the sector, the station and the slot, so a station offers the same people on every visit and only who was hired is saved. Names from 24 × 24 lists; a background sets the job and 0 to 2 of 20 traits; a fee of 30, +20 a trait, +40 a rank, times the station's band price. Ranks at 3 and 8 fights.
- **landnam.** Six people made off the ship, joiners up to 10 percent a day, armed men later; hands with low morale leave in their first 30 days. 12 xp gives +1 to a stat. Grudges between pairs grow from traits that clash. Ids from a counter.
- **wasteland-protocol.** A fixed squad of 7 and 3 fixed recruits on the road; 3 deployed. Bonds per pair at 4, 10 and 18 fights together. Everything resets each run.
- **spliceworld**, **2060td**, **football-manager-simulator**, **afterglass**: levels or ranks by xp thresholds (2060td's Green 0, Line 40, Veteran 110, Cadre 220); generated newcomers from name lists and the seed (football's rookies, afterglass's newcomer every 2 days, 2060td's officers); caps from a building or beds.
- **Fixed casts:** rule-or-drool (24 authored advisors for 8 roles), dirtbag (bonds by days climbing together, tiers at 1/3/5/7), chooser-of-the-dead (a household of 3).

### What most share

1. **Recruits made in play** from name lists and the seed, in seven of the ten games with a roster; a counter gives each an id.
2. **A cap** from a building, a ship's berths or beds.
3. **A rank is the number of thresholds passed,** each giving a little.
4. **Bonds as records of a pair,** grown by time or fights together.

### Where they differ

- **Recruits made or written:** Ludus and Space-Wrecked make them; wasteland and rule-or-drool have them written.
- **Saved or worked out:** Space-Wrecked works a station's offer out from the seed and saves only who was hired; Ludus saves its market.
- **A bond** as a count (wasteland, Dirtbag), a strength (Ludus) or fixed (Landnam's kin, afterglass's pairs).

## Time and calendars

- **ludus:** weeks, an 18-week year, six festivals in a data table (Floralia in week 5, Saturnalia in 17), seasons from weeks 1, 5, 11 and 15; the week's end runs its passes in a fixed order.
- **landnam:** days, 24-day seasons, a 96-day year, winter from day 49; `passDay` runs work, food, fire, healing, ageing, moods, leaving, raids, grudges, drift and tribute, in that order.
- **dirtbag:** a clock of minutes moved only by actions; 7-day weeks with bills on the 7th night, 14-day seasons, a 56-day year, holidays on days 7, 21, 35 and 49, competitions on schedules of 7 to 56 days.
- **chooser-of-the-dead:** 20 days, each a file, with phases (morning, shift, audit, night); events on days 5 to 18.
- **afterglass:** real time while playing (a 60-second day), 7-day seasons with raids on days 2, 4 and 6.
- **spliceworld** and **2060td:** wall-clock time, with time away applied on load (2060td caps it at 8 hours).
- **football-manager-simulator:** seasons of 18 weeks with byes. **rule-or-drool:** cards are the clock, 35 an era. **space-wrecked:** jobs, then jumps, then colony days.

### What most share

1. **Days,** with weeks, seasons and years over them, counted by actions in most games.
2. **One ordered pass at each day's or week's end,** the same steps in the same order every time.
3. **Dated events as a data table** (Ludus's festivals, Dirtbag's holidays and bills, afterglass's raids).

### Where they differ

- **By actions or the wall clock:** 2060td, spliceworld and afterglass run on real time; only 2060td and spliceworld catch up time away.
- **Lengths:** seasons of 7, 14, 24 or 28 days; years of 56 or 96 days, or 18 weeks.

## Open questions

1. **Fractional drift.** Landnam drifts 0.12 a day and Ludus 0.35 a week, below the engine's whole numbers; a whole point every few days is the nearest.
2. **Recruits made in play** need actors that content doesn't list, which the stats kit reads only from records.
3. **Two numbers for one relation,** Ludus's grudge and warmth, fit two factions or a script.
