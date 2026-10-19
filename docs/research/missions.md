# Research: quests in the earlier games

What the games before the engine did for quests, goals and contracts (M3.9, [D47](../decisions.md)). Paths are each repo's under `rcjlabs/`; the repos were read, never run. Quest-like systems turned up in 13 of 16 repos. Only Space-Wrecked has multi-step quests with branches and a validator, and it is the closest model.

## Space-Wrecked: steps that go done or cold

- **Where:** `src/sim/quests.js`, `src/sim/questShape.js`, `data/quests.json`, `src/ui/campaign/questText.js`, `tools/validate-quests.js`.
- **Shape:** `{ id, name, blurb, background | side | companion, start?: { event, choice }, steps[], payoff }`. A step belongs to an act: a job in act 1, an event with `done` and `cold` choices in act 2, a place in act 3. Saved as `campaign.quests: { [id]: { step, state } }`, `state` one of `open`, `done`, `cold`.
- **Flow:** background threads start with the campaign, side chains at an event's choice, a companion's quest as they sign on. A done choice advances the step, a cold choice ends the quest, any other choice "leaves it for the next sector". The act is the only deadline: "A step not done in its act ends its quest (goCold)". No counters.
- **What points where:** steps name fixed ids. A quest job's client and pay are rolled from `${seed}:${quest.id}:${tries}`, and a step's event is placed on a node chosen per sector, seeded by quest and sector: the nearest thing to aliases.
- **Shown:** a Quests panel ("Step 2 of 3", "Gone cold"), the quest's job first on the board, a diamond on its chart node, and warnings before a step goes cold: "Launching ends the miner's debt: its step here isn't done."
- **Checks:** the validator finds chain starts that don't exist, steps out of act order, quest jobs or events no step names, and done and cold choices that overlap. Each event "needs a choice that leaves it for the next sector and needs nothing". The voyage bot reports quest outcomes over 100 seeds.
- **What went wrong (`PROGRESS.md`):** "A chain started in act 2's last sector goes cold as the ship leaves", with nothing to warn at its start; a step went cold in 26 of 100 voyages at one price and 8 at another; a step done by cheat left its event on the chart, and done mid-fight "the job's win would do the next step too"; the quest's job reshuffled the RNG, so "seeds 1 to 30 compare unrelated voyages".

## Goals, bounties and counters

- **dirtbag:** five acts of goals (`app/src/sim/story.ts`), each an aim such as `{cash}`, `{sends}` or `{summit}`, advanced in order and "checked after everything you do", with one integer saved. Weekly bounties count from when they're taken and lapse as the week turns. The "Next" pill shows have and need, and opens the journal. Its v0.956 audit (`docs/audit/meta.md`): "No quest has a deadline or a failure state"; the rival can claim the line a quest needs, so "the quest can never complete"; a final step "auto-completes"; "4 quest flags written and never read"; completed but unclaimed board challenges expire; "~28 overlapping trackers".
- **wasteland-protocol** (`game.js`): three bounties `{ type, desc, current, target, reward, claimed }`, counters ticked by type and shown as `[current/target]`. The board "settled in silence everywhere except in combat", and `claimed` "was written once… and never set". Consequences booked in nodes: "six in seven debts… were never collected".
- **2060td:** daily contracts that pay themselves, because "a reward that expires because nobody tapped it punishes" idle play; objectives the base can't offer greyed out.
- **project-ascent:** objectives are never failed: "the app never marks an objective missed". A test asks of every achievement "is there a log that earns this one at all?"
- **football-manager-simulator:** a season goal judged at the season's end.

## Arcs, oaths and ambitions

- **rule-or-drool** (`src/content/arcs/arcs.json`): arcs of cards, a choice's `next` going on and none ending the arc; `activeArcs: { id, nextCard }[]` saved. Its validator has `arc-unreachable`, `arc-no-exit`, `arc-cycle`, `arc-dead`, `cond-unsatisfiable`. Finished arcs kept holding slots, so later arcs started in "3.0-3.3%" of runs; "the bot never takes a mandate".
- **landnam:** oaths kept if not broken within a year, all in `state.flags`; "an oath a player would happily break is not a constraint, it is a coupon". Its tests: "no card may be locked behind a flag only it sets", and a probe that labels chains "chain-short": one "completes about once in sixty sagas and had been completing on luck". "The harness never… breaks an oath."
- **ludus** (`src/ludus.jsx`): ambitions (silent → asked → pressed → met, broken or despair, on a 12-week clock), pacts with a pace ("There are not enough weeks left"), vows. Two ambitions could never fire: "651 of them given and 0 ever met"; gates ran "exactly once, the week he was made"; promises "outlived their own date". `test/README.md`: "A reachability claim is a claim about a policy."
- **chooser-of-the-dead:** gods' requests `{ god, from, to, n, reward, since, until }` settled at the day's audit; journal threads listed while their `when` holds, with an optional count. Its rule: "mistakes never advance a plot"; its lint: "Every flag set is read somewhere, and every flag read is set."
- **sandbagged:** a three-act campaign whose journal pages are granted as "the next one he wrote"; closing the tab after a boss "lost the entire act"; a deed that "could never be earned".
- **spliceworld:** commissions "SATISFIABLE BY CONSTRUCTION", and "a deadline settles on load by being read"; missions sealed at launch, so "a reload cannot re-roll".
- **climbing-world-traveler:** design docs only, with placeholders `'@partner'`, `'@rival'` "resolved at fire time": the set's only design for Bethesda's aliases.

## Bethesda's quests

From the Creation Kit's documentation as known before this survey, not re-read for it: a quest has numbered **stages**, each with journal (log) entries and script fragments, any stage set from anywhere by `SetStage`; **objectives** shown, completed and failed by scripts, each pointing at an alias for its marker; **aliases**, slots filled as the quest starts (a specific reference, a unique actor, or a match by conditions), which is how radiant quests repeat with new targets. A quest can start with the game or when the story manager picks it.

## What they share

- **Small saved state, keyed by id:** a step and a state, one integer, or flags. What can be worked out from the world isn't stored.
- **Offers and placements drawn from the seed and a purpose,** so a reload never rolls them again.
- **Time limits in the game's own units:** act, sector, node, day, week. They settle as the game reads them, not on a timer.
- **Static validators, and bots reporting completion rates per quest.** The bots' numbers caught what the validators couldn't.
- **Mostly automatic:** counters and goals that check themselves. Accepting and declining appears only in wasteland's contracts, dirtbag's bounties and ludus's vows and pacts.

## What went wrong across them

- **Goals that can't be met, or meet themselves:** ludus's ambitions, sandbagged's deed, dirtbag's stolen line and self-completing step, rule-or-drool's gated arc.
- **Gates read once, slots never freed:** ludus, rule-or-drool.
- **Completion in silence, and missing markers:** wasteland's board, dirtbag's markers and dropped toasts.
- **Expiry wrong both ways:** rewards lost when unclaimed (dirtbag), promises that never expire (ludus).
- **Starts too late to finish,** with no warning: Space-Wrecked's last-sector chains.
- **Progress lost on reload:** sandbagged, rule-or-drool, project-ascent.
- **Dead flags and hand-kept lists:** dirtbag, landnam.
- **Bots that never try a path,** read as "unreachable": landnam's oaths, rule-or-drool's mandates.
- **Quest content moving the RNG** of everything after it: Space-Wrecked, landnam.
