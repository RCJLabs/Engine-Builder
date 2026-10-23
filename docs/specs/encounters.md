# Encounters (M4.7, D57)

The encounters kit: fights between the player's fighters and an encounter's foes, worked out round by round, exactly, and rolled once against the table of every way they can end. A fight is an effect, so an event's choice or a talk's option fights by holding it, and its preview is that table. The survey behind it is [research/encounters.md](../research/encounters.md).

**Words.** A **fight** is between two **sides**: the **party**, who fight for the player, and the **foes**. Each side is a **line** of **fighters**, the **front** first. A fight ends in a **result**: a **win**, a **draw** or a **loss**. What the party loses is **hurt**; a fighter whose health runs out **falls**. A choice's modifiers to the party are its **stance**.

## The kit

`encounters` in `project.json`'s kits, needing `stats`. It is built knowing whether the roster kit is on, since only then can the roster's members fight or a fallen fighter leave.

### Records

**`combat`**: the stats a fight reads.

| Field | Kind | |
| --- | --- | --- |
| `name` | text | |
| `health` | ref stat | what a hit takes off; what is left is the stats kit's `current` |
| `hit` | ref stat | a fighter's chance to hit, in percent, before the target's dodge |
| `dodge` | ref stat, optional | taken off the hit of anyone striking this fighter |
| `damage` | ref stat | what each hit takes off |
| `armour` | ref stat, optional | taken off each hit this fighter takes |
| `hit-min`, `hit-max` | int 0–100, optional | a hit's chance is kept between them: 5 and 95 when left out |
| `rounds` | int 1–50, optional | the most rounds a fight lasts: 20 when left out |

**`encounter`**:

| Field | Kind | |
| --- | --- | --- |
| `name` | text | |
| `description` | text, optional | |
| `combat` | ref combat | |
| `foes` | list, at least one | `actor` (ref actor) and `count` (int 1–9, optional; 1 when left out), the front first |
| `fighters` | list of ref actor, optional | who fights for the player, the front first; the roster's members when left out |
| `breaks` | int 1–100, optional | the foes break once they have lost this percent of their health: 100 when left out, to the last |
| `win`, `draw`, `lose` | effects, optional | run after the fight, by its result |
| `falls` | group, optional | what happens to each of the party who falls: `status` (ref status, optional) is added; `leave` (text, optional) is why a member leaves the roster |

### The effect

**`fight`** `{encounter, fighters?, hit?, dodge?, damage?, armour?}`. `fighters` (a list of ref actor) wins over the encounter's. The four numbers (ints −100 to 100, optional) are the stance: each is added to that stat of every one of the party, for this fight.

## Working a fight out

`fightTable(reader, encounter, fight)` is pure, and the effect's run and its preview both call it, so what is shown is what is rolled.

### The two lines

- **The party:** the fight's `fighters`, else the encounter's, else the roster's members in the order they joined (`roster.place`). A fighter whose `current` health is 0 doesn't fight. Each reads `stats.value` of the combat's stats, the stance added, and `stats.current` of its health.
- **The foes:** each `foes` entry's actor `count` times, in order, at `stats.value` of every stat, health too: a foe is fresh every fight.
- A stat the combat leaves out (`dodge`, `armour`) is 0.

Each side's **total** is its fighters' health added up. The foes are **broken** once their hurt reaches `ceil(total × breaks / 100)`, worked out as `floor((total × breaks + 99) / 100)`; the party is **down** once its hurt reaches its total.

A side's line at a hurt `t`: fighter `i`, with `before` the health of those ahead of it, has `clamp(health − max(0, t − before), 0, health)` left, and stands while that is above 0. The **front** is the first who stands. Hurt falls on the front, and what is left over on the next: so a side's whole state is its one number, its hurt.

### A round

Both sides strike at once, every fighter standing at the round's start.

- **A strike** at the other side's front hits with chance `clamp(hit − front's dodge, hit-min, hit-max)` percent, for `max(1, damage − front's armour)`.
- **A side's damage** this round is the sum of its strikes: its chances, worked out exactly by adding the strikes one by one, in line order, into a list by total (`dist[0] = 1`; each strike moves `p` of every total up by its damage).
- **Each pair** of the two sides' totals, in order of the party's then the foes', moves the fight's chance from `(party hurt, foes' hurt)` to the two new hurts, each held at its side's limit (the party's total, the foes' break).

The fight's state is a table of chances over every pair of hurts, gone through in order of the party's hurt, then the foes'. Before the first round it is `(0, 0)` at 1.

### The end

After each round, each pair whose fight is over moves to the ends:

| Foes broken | Party down | Result |
| --- | --- | --- |
| yes | no | win |
| no | yes | loss |
| yes | yes | draw |

What is left after `rounds` rounds is a draw. A party with no one standing loses at once; foes of total 0 lose at once.

An **end** is a result and the party's hurt. Its chance is the sum of every way to it.

### The table

The ends are made whole so the roll and the screen read the same numbers:

1. **Each result's chance** in whole percents: each result's chance times 100, rounded down, then the percents still short of 100 go one each to the largest remainders, ties to the earlier of win, draw, loss.
2. **Each end's weight** within its result, out of the result's percent times 100, the same way: the ends in order of hurt, ties to the smaller hurt.
3. Ends of weight 0 are left out. A result of 0% has no rows.

The table's rows, win's first, then draw's, then loss's, each in order of hurt, add up to 10,000.

### Fighting it

`fight` runs, in one attempt:

1. **The roll:** one draw of `int(1, 10000)` from the stream `encounters/fight`; the row is the first whose running total of weights reaches it.
2. **Hurt:** fighter `i` of the party takes `min(health, max(0, hurt − before))`, by `damage-stat` on the combat's health stat.
3. **Falls:** each of the party whose health that leaves at 0 falls: `encounters/fell {encounter, actor}` is heard, then the encounter's `falls`: `add-status` of its `status`, and with the roster kit on, `leave` with its `why` for a member.
4. **The counts:** the encounter's fights, wins or losses, and `encounters/fought {encounter, result, hurt, roll}` is heard.
5. **The result's effects:** the encounter's `win`, `draw` or `lose`.

### Its preview

```
{
  encounter, combat, health,          // the combat's health stat
  fighters: [actor…],                 // the party, the front first; those who stand only
  foes: [actor…],                     // each foe, its count over
  outcomes: [{ result, chance, hurt: [min, max], falls: [min, max], effects: [preview…] }…],
  rows: [{ result, hurt, weight }…]
}
```

`outcomes` has one entry for each result with rows, in the table's order, its `effects` the result's effects as their own previews give them. `hurt` and `falls` are the least and most over its rows.

### Facts

| Fact | Domain | |
| --- | --- | --- |
| `encounters.fought(encounter)` | int | fights against it |
| `encounters.won(encounter)` | int | of them, won |
| `encounters.lost(encounter)` | int | of them, lost |

The roster kit gains **`roster.place(actor)`** (int): where a member stands on the roster, from 1 in the order they joined; 0 for anyone not on it.

### State

The slice, version 1: `{ fought: {}, won: {}, lost: {} }`, each a count by encounter, none at 0.

## Checks

- **E035** for a `combat` whose `hit-min` is above its `hit-max`.
- **E054** for a `fight` that names no fighters, nor does its encounter, in a game without the roster kit: nobody would fight for the player.
- **W137** for an encounter whose `falls` has a `leave`, in a game without the roster kit: nobody can leave.

## On screen

- **A choice's odds:** the session words a choice whose effects hold a fight as its `odds` field, each result in turn with what it costs and does: "Win 67%, 0–10 Hull lost, Credits 30 → 42 · Draw 16%, 0–12 Hull lost, 0–1 fall, heat 0 → 5 · Lose 17%, 12 Hull lost, 1 falls, …". Hurt and falls of 0 say nothing; a range of one number is the number. A choice whose outcomes are written keeps "70% · 30%". With the event's odds hidden, there are none.
- **A button's `detail`:** a second, smaller line under its label, a template like the label. It is left out when every binding in it is empty, so a choice without odds shows no line. The stock event and talk screens show `{.odds}` there.

## The editor

- **The Encounters kit box** in the Project panel, needing Stats.
- **Records:** `combat` and `encounter` are the kit's types, with forms; `fight` is a kit effect with its form, in any list of effects.
- **Above an encounter's form,** the fight against its party, worked out as the sim works it: each result with its chance, hurt and falls. The party is the encounter's fighters, else the roster's start, at full health; a picker sets who. Changing a stat, a foe or `breaks` changes it as it is typed.
- **Checked together:** an encounter, its combat and every record whose fight names it are checked again when any of them changes (`encounterRelated`), since E054 reads the encounter's fighters.

## Where it lives

- `packages/kits/src/encounters/`: `types.ts`; `lines.ts` (the two lines); `table.ts` (`fightTable`: rounds, ends and rows); `fight.ts` (fighting it); `module.ts`.
- `packages/schema/src/`: `encounterTypes.ts`, `encounterEffects.ts`, `encounterCheck.ts`.
- `packages/ui/src/`: the choice's odds in `session/words.ts`; a button's `detail` in `format/screen.ts`, `render/Widget.tsx`.
- `apps/editor/src/encounters/`: `fightPreview.ts` (a plain function), `FightPreview.tsx`.
- `tools/cli/test/fixtures/drift/` (its hostile ships fought) and `pit/` (a slice of Ludus).

## The gate

- **Desktop** (`encounters.spec.ts`): the drift brought in without its combat, its raiders and their encounter; each made with forms in Records, landing as the fixture holds it; the table above the encounter's form reading as the sim works it out; the hostile event's Fight given the fight with forms. Played in the Play panel to a hostile ship, the choice's odds read as the table, and the fight is fought. The pit's bouts made with forms, a gladiator from the roster fighting. Both projects' bots in the Logic panel read as `eb sim` prints them.
- **Phones** (`encountersPhone.spec.ts`), at 360×740, 390×844 and 844×390, by touch: the drift flown through a fight, the event in reach (nothing offscreen, no target under 44 px, nothing axe finds); the encounter's table in the inspector sheet.
- **Shown is rolled** (`fights.test.ts`): over 300 seeds of each, before every fight the bots fight, the preview's rows are worked out; the fight's roll must land in a row of its result and hurt, and the share of wins over all fights must sit inside the Wilson interval of the shown chances' mean.

## Open questions

1. A Space-Wrecked boarding of 3 crew and 4 boarders is about a thousand pairs of hurt a round; a fight of hundreds of health a side is a million. Whether to warn of a fight too big to work out quickly waits for the reading.
2. Ludus's crux orders change a bout midway; a stance is chosen once, before.
3. Should a draw be split, as landnam and Spliceworld give the field to the side with more left?
