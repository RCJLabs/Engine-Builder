# Spec: kits in the editor

This is how the editor shows and edits kits (M3.3 to M3.6, [D41](../decisions.md), [D42](../decisions.md), [D43](../decisions.md), [D44](../decisions.md)): the Project panel's boxes that turn them on, their types among the project's, their effects in the sheet editor, and a kit's type in the type designer. The kits themselves are [kits.md](kits.md).

## Turning kits on

The Project panel has a **Kits** group under the project's name and version: a box for each kit, named, with what it brings beneath it.

- **Ticking a kit ticks what it needs**, and clearing one clears what needs it, so `project.json` never lists a kit without its need (E034). Ticking Economy ticks Inventory; clearing Inventory clears Economy.
- **Each change is one step**, worded with what came along: "Turn on the economy kit, with inventory". Undo takes it back.
- **The file.** `kits` is written in the engine's order, kept where it is in `project.json`, and taken out when no kit is on, as a project made before M3.3 has it (`editing/projectEdits.ts`).
- **What follows.** The kits' types join the Records panel's list; their facts and events join the condition field's and When's lists; their effects join the list a row's Do adds from. The project's game, if it has one, runs again with the kits' modules joined, since the script worker now gets `project.json` with the scripts.
- **A kit turned off** takes its types away: their records are of a type the project doesn't have (E002) until it is turned on again.

## The kits' types

A kit's types are listed and edited like the project's own: a table each, New, forms and "used by". Their forms come from the kit's type file, as the engine's flag and trigger sheet types' do (D36).

- **The record picker** names a type by its title with its article: "Choose an item", "Choose a loot table".
- **Checked together.** A loot table's loop check (E036) and a shop's stock check read every table, so an edit to a loot table or a shop checks all of them again, as flags are (`records/flagRelated.ts`).

## Kit effects in a row

The list a row's Do adds from gains each kit's effects, by name: Give an item, Take an item, Roll a loot table, Add to a resource, Pay a cost, Open a shop.

- **Their forms are drawn from their fields**, the same list their schemas are made from (`@eb/schema`'s `kitEffects.ts`), so the form and the checks can't disagree, and no kit effect has a form written by hand (`logic/KitEffect.tsx`).
- **A new one** has its fields as a new record's are: what must be filled in, empty, and shown as a problem until it is.
- **On the cards**, each is a few words: "give 2 × medkit", "pay 10 credits and 2 fuel", "open dutch-yard", or "give an item not yet chosen".
- **With its kit off**, a kit's effect is edited as JSON, as a game's own effects are.

## A kit's type in the designer

Edit type on a kit's type opens the designer (`types/TypeDesigner.tsx`):

- **The kit's fields first, shown and locked**, in a box "From the inventory kit": each one's label, name and kind. The kit's module reads them, so they can't be renamed, removed or changed.
- **No Rename or Delete.** The type's name is the kit's; turning the kit off is how its type goes.
- **Fields of the project's own** (D41). Until there are any, the designer offers "Add fields of your own", which writes `types/<type>.json` with the kit's title and no fields. From then on the designer edits that file as it edits any type's: Add a field, rename, move, remove, its title, description and name field (a text field of the kit's or the project's).
- **Its problems** are the compiler's, joined to the kit's fields first: a field with a kit field's name is E037.
- **New type** refuses a kit's type name while the kit is on: "item is the inventory kit's type: Edit type adds fields to it".

## The stats and gear kits (M3.4)

The two kits of [stats.md](stats.md) come into the editor as the first two did, with nothing written for them alone:

- **Their boxes:** Stats ("Actors, their stats and the damage they take, and statuses") and Gear ("Slots, and items actors wear in them. Needs Stats and Inventory"). Ticking Gear ticks both its needs: "Turn on the gear kit, with inventory and stats".
- **Their types** (stat, actor, status, slot) in Records with forms and tables. With Gear on, an item's form gains Worn in and Modifiers, and an actor's Slots and Wears, all of them locked in the designer as the kit's.
- **Their effects** in a row's Do, by name, each with its form: "Damage a stat", "Add a status", "Equip an item". On the cards, whose comes first: "damage ana’s health by 3", "heal all of ana’s health", "add 2 × bleeding to bo", "equip bo with rifle", "unequip bo’s hand".
- **Checked together** (`records/flagRelated.ts`): an actor's bases read its stats' bounds, so a change to a stat or an actor checks the others again (`statRelated`); with Gear on, what an actor wears reads the items' slots, so an item's change checks the actors again (`wornRelated`).

## The factions and time kits (M3.5)

The two kits of [factions.md](factions.md) and [time.md](time.md#the-time-kit) come in the same way, with one thing of their own: the calendar, which is project.json's, not a record's.

- **Their boxes:** Factions ("Standing with each faction, in bands that set shops’ prices and that conditions read") and Time ("Days, weeks, months and seasons, and rows that run as each one starts"). Neither needs another; a shop's Faction field shows only with Economy on too.
- **The calendar's form.** With Time ticked, the Project panel shows a Calendar group under the kits (`app/ProjectCalendar.tsx`, loaded then by `app/CalendarSlot.tsx`, so the editor's start doesn't carry the record form's fields): a record form over project.json's `calendar`, drawn from the calendar's fields as a type file (`app/calendarFile.ts`): Ticks a day, Lengths of time (a map of unit to ticks), Parts of the day, Days of the week, Months, Days a year, Seasons and Start.
  - **Each change is a step** in project.json, in its own layout: "Edit Days a year in the calendar". A calendar left out reads as an empty one, a day a tick, so the first box typed in adds it, last in the file.
  - **A list left empty is taken out**, since the engine reads an empty list of weekdays or months as a calendar that doesn't hold together, and none is what removing the last one means; a calendar with nothing left in it is taken out too (`editing/projectEdits.ts`, `withCalendar`). An empty Start stays: Add Start makes one to fill in.
  - **Its problems** are project.json's under `/calendar`, at their box: a season named "Spring" shows "A name is lowercase words joined by hyphens" when its box is left. One about the whole calendar ("give months or daysPerYear, not both") shows at the top. They come from the catalog, read again after every change, so the form never checks the calendar its own way.
  - **What reads it.** The start-of events a row's When offers are the calendar's: "A season starts" with a season to pick only once there are seasons. Wait's lengths are its units: with hours, Wait has Hours.
- **Their types:** the faction in Records, with Lowest, Highest, Starts at, Bands (each an Id, a Name, From and Prices (%)) and Drift (Every (days), Toward).
- **Their effects** with forms: "Change a standing", "Wait" and "Cancel a timer". `schedule` holds a list of effects, which no field can, so it is added as Other, as JSON; it is never offered as the game's own. On the cards: "take 5 from guild’s standing", "wait 1 day and 6 hours", "cancel the timer harvest", "do 2 effects in 1 day and every 2 weeks after".
- **Conditions in words.** The factions' facts word their own tests, by the faction's id: "If guild is at least friendly", "guild’s band is not hostile", "guild’s standing is at least 10".
- **Checked together** (`records/flagRelated.ts`, `factionRelated`): a condition naming a band is checked against its faction's bands (E039), so a change to a faction checks every record naming it again. A change to the calendar checks every record again, since the time kit's effects are checked in its units (`records/recordIndex.ts`, the index's grounds).

## The roster kit (M3.6)

The kit of [roster.md](roster.md) comes in as the others did, with nothing written for it alone but its words and what is checked together:

- **Its box:** Roster ("Members who join and leave, recruits rolled in halls, ranks on a stat, and bonds. Needs Stats"). Ticking it ticks Stats: "Turn on the roster kit, with stats".
- **Its types** in Records: the recruit (Actor, Names, Bynames, Rolled stats, a map of stat to From and To, Traits with a Status, a Chance (%) and a Fee, Most traits, Fee), the hall (Offers a round, Recruits with a Weight) and the roster (Most members, Most members from a flag, Starts with, Ranks with a Stat and its ranks, Bonds with Lowest, Highest, Starts at and Bands). A Fee is a map keyed by resources with Economy on, and by any name without it, as W117 warns.
- **Its effects** with forms: "Make a recruit", "Join the roster", "Leave the roster", "Change a bond", "Change every bond", "Open a hall", "Start a hall’s next round". On the cards: "recruit deckhand", "put ana on the roster", "take ana off the roster: dead", "add 2 to the bond of ana and bo", "add 1 to every bond on the roster", "open dock", "start dock’s next round".
- **Conditions in words**, by the ids they name: "ana is on the roster", "ana’s rank is veteran", "ana is at least veteran", "the number of members at least veteran is at least 2", "the bond of ana and bo is mates".
- **Its events** in a row's When: "A member joins", "A member leaves", "A recruit is hired", "A member’s rank changes", "A bond changes", "A bond’s band changes", "A hall opens", "A hall is left".
- **Checked together** (`records/flagRelated.ts`):
  - `rosterRelated`: the roster record, the statuses, and every record whose file names a roster fact, found by the text `roster.` once for each record the index keeps, since `roster.ranked(veteran)` names no record that references would find. A rank or bond band a condition names is checked against the roster's (E040), a rank's status against its ladder, and a second roster against the first (E035).
  - `recruitRelated`: actors and recruit templates, since a written actor may not have an id a recruit could take (E035).
  - The roster's cap-flag is a reference, so `flagRelated` already checks the roster again when its flag changes.

## The events kit (M3.7)

The kit of [events.md](events.md) comes in as the others did. What it needed beyond its words is the type files' `effects` kind ([type-files.md](type-files.md#kinds)), which every form draws with the trigger sheet's own list of effects, so a choice's effects, an outcome's and a consequence's Do are made as a row's Do is:

- **Its box:** Events ("Choice events, the decks they’re drawn from, and consequences that land days or choices later"). It needs no other kit.
- **Its types** in Records: the event (Text, Show odds, and Choices, each with an Id, a Label, Shown if, Needs, Cost, Result, Effects and Outcomes, each outcome a Chance (%), a Result and Effects) and the deck (Events, each with a Weight, an If and Once, Passes over the last and Unseen boost). A Cost is a map keyed by resources with Economy on, and by any name without it, as W119 warns.
- **Its effects** with forms: "Open an event", "Draw an event", "Do later" (After, with Days, Choices, Flag and Risen by; If; Do, a list of effects; Id) and "Cancel a consequence". On the cards: "open the event raiders", "draw an event from road", "pursuit: do 1 effect after 2 days", "do 1 effect once nodes has risen by 3", "do 2 effects after 1 choice", "cancel the consequence debt".
- **Conditions in words**, by the ids they name: "fight was chosen at raiders", "the times raiders has been seen is at least 2", "debt is still to land", "debt’s countdown is at most 1".
- **Its events** in a row's When: "An event opens", "A choice is made", "A choice’s outcome is rolled", "An event is drawn", "A deck has nothing to draw", "A consequence is booked", "A consequence lands", "A consequence is dropped", "A consequence is cancelled".
- **Checked together** (`records/flagRelated.ts`): `eventRelated`, an event and every record that names one, since a condition naming a choice is checked against its event's choices (E041). A consequence's flag is a reference, so `flagRelated` already checks it again when the flag changes, for whether it is a number flag (E035).
- **A list of effects in a table** reads as the cards do, "give 2 × medkit, open dutch-yard", and filters as a list: has an item with (its words or the JSON it holds), is empty, is not empty.

## The dialogue kit (M3.8)

The kit of [dialogue.md](dialogue.md) comes in as the events kit did, its talks drawn by the same forms, with a map above each talk ([D46](../decisions.md)):

- **Its box:** Dialogue ("Speakers, and talks of lines and what the player says back, with a map of where each line leads"). It needs no other kit.
- **Its types** in Records: the speaker (Name, Portrait) and the talk (Name, Speaker, Show odds, Starts, each an If and a Line, and Lines, each with an Id, a Speaker, Text, Effects, Options and Then). An option is an event's choice (Id, Label, Shown if, Needs, Cost, Once, Effects, Outcomes, each a Chance (%), Effects and Leads to) with its own Leads to. A Cost is a map keyed by resources with Economy on, and by any name without it, as W119 warns.
- **Its effect** with a form: "Open a talk"; on the cards, "open the talk marge".
- **Conditions in words,** by the ids they name: "the times marge has been talked to is at least 2", "the times sent has been heard in marge is at least 1", "gas was said to marge".
- **Its events** in a row's When: "A talk opens", "A line is heard", "An option is said", "An option’s outcome is rolled", "A talk ends", "A talk has nothing to say".
- **Checked together** (`records/flagRelated.ts`): `talkRelated`, a talk and every record that names one, since a condition naming a line or an option is checked against its talk (E042), and a talk nothing opens is warned of (W123).
- **The map** (`dialogue/talkMap.ts`, a plain function of the talk's value, and `dialogue/TalkMap.tsx`), above the talk's fields: a row for each number of steps from a start ("Opens at", "1 step on", "2 steps on"), each line a box in the order written, with its id, its speaker's name and its text, and below them where it leads: "“Chip in for gas” → thanks", "“Watch me send it”, 60% → sent", "Then → again", "“See you around.” → the end of the talk". A line no start reaches is in a last row, "Nothing leads here", dashed (W121); an exit to a line the talk lacks says "(no such line)" (E035). Tapping a box opens its line's form at its Text, as the Problems panel opens a field. Boxes wrap rather than run past the screen, so a phone shows the same map; the arrows are words, not drawn, for that reason. A talk caught half made draws what holds together and leaves the rest out.

## The quests kit (M3.9)

The kit of [quests.md](quests.md) comes in as the dialogue kit did, its quests drawn by the same forms, with a map above each quest ([D47](../decisions.md)):

- **Its box:** Quests ("Quests of stages whose objectives check themselves, kept in a journal, with a map of where each stage leads"). It needs no other kit; a stage's Days want a time module, as W120 warns.
- **Its type** in Records: the quest (Name, Starts with the game, Starts when, and Stages, each with an Id, a Log, Effects, Objectives, Then, Fails, Fails when, Days and Why it fails). An objective has an Id, a Text, Done when or a Count (an Event, With, its arguments by name, and Times), and a Leads to.
- **Its effects** with forms: "Start a quest", "Set a quest’s stage" and "Fail a quest"; on the cards, "start the quest debt", "move debt to its stage square", "fail the quest debt: You left the yard."
- **Conditions in words,** by the ids they name: "debt is done", "debt is at its stage owed", "debt has reached square", "pay of debt is done", "the count of scrap of bounty is at least 2", "the number of quests done is at least 3".
- **Its events** in a row's When: "A quest starts", "A quest reaches a stage", "An objective is done", "A quest is done", "A quest fails", "A stage’s effects are refused".
- **Checked together** (`records/flagRelated.ts`): `questRelated`, a quest and every record that names one, since a condition naming a stage or an objective is checked against its quest (E043), and a quest nothing starts (W125) or brings to a stage (W124) is warned of.
- **The map** (`quests/questMap.ts`, a plain function of the quest's value over the kit's `quests/graph.ts`, and `quests/QuestMap.tsx`), above the quest's fields: a row for each number of steps from the first stage ("Starts at", "1 step on"), each stage a box in the order written, with its id and its log, and below them where it leads and how it can end: "“Pay the miner” → square", "Then → hand", "Then → the quest is done", "Its effects → round" for a `set-stage` of its own, "Fails after 5 days", "Fails when its condition holds", "Fails as it is reached". A stage the first doesn't reach is in a last row, "Not reached from the first stage", dashed (W124); a lead to a stage the quest lacks says "(no such stage)" (E035); a Then from a stage whose objectives all lead elsewhere says "(never: every objective leads elsewhere)"; a stage the quest can't end from says so (W126). Tapping a box opens its stage's form at its Id. The map shares the talk map's styles (`styles/kitMap.css`), so it wraps on a phone the same way.
- **Run** reports each quest's state at the runs' end after the game's own metrics, as `eb sim` does: the two call the kit's `kitMetrics`.
- **A tap that leaves a field** (`forms/pressing.ts`): the problems a field shows as it is left wait until the press that left it is over, at its click. M3.8 waited for the pointer to lift, which on touch is too soon: a phone moves the focus after the finger lifts, so "Add to Objectives" under a Leads to naming a stage not yet written was pushed from under the tap and the tap was lost.

## Checks

- **e2e on desktop** (`e2e/kits.spec.ts`):
  - the gate: kits ticked; an item, a resource and a shop made with their forms; a row on a shop's opening that gives the item; a field of the project's own on the item; the exported zip checked clean by `eb validate`;
  - a kit turned off with its need's, its records then of an unknown type, and undo;
  - the hangar fixture imported, its scripts allowed, and Run's report the same lines `eb sim` prints for the same seeds and bot.
- **Phones** (`e2e/kitsPhone.spec.ts`) at 360×740, 390×844 and 740×360: the kits ticked by touch, a kit's record in the inspector's sheet, and a kit's type with its fields locked, with nothing past the screen, 44 px targets and axe clean.
- **The stats gate** (`e2e/stats.spec.ts`): Gear ticked with its needs; a stat, a slot, an item, a status and an actor made with forms, the actor wearing the item; a row on a stat running out that damages a stat and adds a status; the export clean for `eb validate`. The arena fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/statsPhone.spec.ts`.
- **The factions gate** (`e2e/factions.spec.ts`): Economy, Factions and Time ticked; the calendar filled in with its form, a season's bad name shown at its box and fixed; a faction with two bands and drift, a resource, an item and a shop naming the faction, made with forms; a row on autumn's start that reads the guild's band and changes its standing, and a row on a shop opening that waits 6 hours; the sheet's form showing no problems; the export clean for `eb validate`. The steading fixture imported, its four seasons in the calendar's form, and its Run the same lines `eb sim` prints. Its phones are `e2e/factionsPhone.spec.ts`: Factions and Time ticked by touch, a season added, a faction's band and drift in the inspector's sheet.
- **The roster gate** (`e2e/roster.spec.ts`): Roster ticked, ticking Stats with it, and Economy; two stats, two statuses, two actors and a resource; a recruit template with two names, a rolled stat whose range runs down until fixed, a trait with a fee and a fee of its own; a hall offering it by weight; a roster with a cap, a start member, two ranks (the second's missing From shown until filled in) and bonds in two bands, all made with forms; rows on a hire, a rank changing and a member leaving, one whose If names a rank the roster lacks (E040) until fixed; the export clean for `eb validate`. The crew fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/rosterPhone.spec.ts`: Roster ticked by touch with Stats, and a recruit's names, rolled stat and trait in the inspector's sheet.
- **The events gate** (`e2e/events.spec.ts`): Events, Economy and Time ticked; a resource; two events made with forms, one with a choice that costs, a fight whose two outcomes' chances add up to 90 until fixed (E035 at the outcomes' box), and a consequence two days later inside the worse outcome, opening the other event; a deck drawing both by weight; rows on a day's start that draw from the deck and on a choice, one whose If names a choice the event lacks (E041) until fixed; the export clean for `eb validate`. The convoy fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/eventsPhone.spec.ts`: Events and Time ticked by touch, and a choice's two outcomes and a consequence opening an event, lists inside lists, in the inspector's sheet.
- **The dialogue gate** (`e2e/dialogue.spec.ts`): Dialogue and Economy ticked; a resource and two speakers; a talk made with forms, its opening line with an option that costs, one whose two outcomes' chances add up to 90 until fixed (E035 at the outcomes' box) and a goodbye; a line nothing leads to (W121 at its id and in the map's last row) until the goodbye leads to it; the map's rows read, and a box tapped opening its line's Text; a row on a talk's end opening the talk, whose If names a line the talk lacks (E042) until fixed; the export clean for `eb validate`. The crag fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/dialoguePhone.spec.ts`: Dialogue ticked by touch, a start, a line with an option rolling two outcomes and the line one leads to, in the inspector's sheet, and the map's box tapped.
- **The quests gate** (`e2e/quests.spec.ts`): Quests and Time ticked; a flag; a quest made with forms, its first stage with an objective done by a flag, one counted that names neither Done when nor Count until it does (E035 at the objective), and one reading the count; a failing stage nothing brings the quest to (W124 at its id and in the map's last row) until an objective leads there; a deadline; the map's rows read, and a box tapped opening its stage's Id; the warning that nothing starts it (W125) until it starts with the game; a row on a day's start that sets the flag and sets the quest's stage, whose If names a stage the quest lacks (E043) until fixed; the export clean for `eb validate`. A project's own quest type with the kit off gets no map. The yard fixture imported and its Run the same lines `eb sim` prints, the quests' states among them. Its phones are `e2e/questsPhone.spec.ts`: Quests ticked by touch, a stage whose objectives lead on and count, its map's box tapped. `e2e/formsPhone.spec.ts` taps a button just below a field that shows a problem as it is left.
- **Units** (`app`, `editing`, `records`, `logic`, `scripts`, `dialogue`, `quests`): the quest map's layout (`quests/questMap.test.ts`); the index with the quests kit (`records/questIndex.test.ts`) and the quests kit's effects' words; the talk map's layout (`dialogue/talkMap.test.ts`); the index with the dialogue kit (`records/dialogueIndex.test.ts`) and open-talk's words; the index with the events kit (`records/eventIndex.test.ts`), its effects' words, and a list of effects in a table's cells and filters; the roster's index (`records/rosterIndex.test.ts`) and its effects' words; the calendar's edits and problems; the index with factions and the calendar (`records/factionIndex.test.ts`); the four effects' words and the factions' facts'; Wait's fields from the calendar; schedule never offered as the game's own.

## Open questions

1. **Explaining a kit.** The boxes say what a kit brings in a line. A first-time author may want an example project per kit, as the templates of Phase 4 will have.
2. **A kit field's wording.** A project can rename its kit type ("Parts") but not relabel a kit's field ("Value" as "Cost").
3. **Whose kit a field is.** With Gear on, an item's Worn in and Modifiers show under "From the inventory kit", though the gear kit gives them.
4. **schedule's form.** A timer's effects are a list of effects, which the `effects` kind holds since M3.7, but schedule is still JSON: its lengths must come to a tick at least, a rule its schema checks and no field says.
5. **A season that starts on a month.** The engine takes `{ "month": "thaw", "day": 1 }` as a season's start, but the form's box is a day of the year: such a start shows as written, and typing in the box replaces it with a number.
6. **The calendar with Time off.** Its form shows only with Time ticked, so a calendar left behind (W116) can be taken out only by ticking Time again and clearing its boxes, or by hand.
7. **A recruit's offers in the editor.** A hall's form shows its templates and weights, not who it would offer: the offers are worked out from a game's salt, which only a played game has. Run's report doesn't list hires either.
8. **Names in bulk.** A template's names are a list typed one box at a time; Ludus's and Landnam's lists run to dozens.
9. **An event played in the editor.** An event's form shows its fields, not what the player would see: its choices with their locks, costs and odds, as `open-event`'s preview gives them. A deck's form doesn't show what its weights and rules come to either.
10. **Deep lists on a phone.** A choice's outcome's consequence's Do is four lists deep, and each level's box takes 26 px of the width: the Do's box is 102 px wide at 390 px, and 196 px in the desktop's 320 px inspector, its picker with Open wrapped below and the effect to add in a select that shrinks with it. It fits, and the specs check it in Inter and in DejaVu Sans, but a fifth level would not. Groups inside groups could take less padding.
11. **A talk's lines picked, not typed.** A start's Line, a Then and a Leads to are typed ids, and a mistyped one shows as E035 at its box and "(no such line)" in the map. A picker of the talk's own lines would save the typing, as a ref field's picker does for records.
12. **The map's arrows drawn.** The map says where each line leads in words, which wrap on a phone. On a wide screen, drawn arrows between the boxes would show a talk's shape at a glance; a talk of many lines might then want boxes that fold.
13. **A quest's stages picked, not typed.** A Then, a Leads to and a `set-stage`'s stage are typed ids, as a talk's lines are (question 11); a mistyped one shows as E035 or E043 at its box and "(no such stage)" in the map.
14. **A quest played in the editor.** A quest's form and map show its fields and where its stages lead, not its journal as a player would read it at each stage, which `start-quest`'s preview gives.
