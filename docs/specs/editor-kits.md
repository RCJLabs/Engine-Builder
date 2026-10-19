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

## Checks

- **e2e on desktop** (`e2e/kits.spec.ts`):
  - the gate: kits ticked; an item, a resource and a shop made with their forms; a row on a shop's opening that gives the item; a field of the project's own on the item; the exported zip checked clean by `eb validate`;
  - a kit turned off with its need's, its records then of an unknown type, and undo;
  - the hangar fixture imported, its scripts allowed, and Run's report the same lines `eb sim` prints for the same seeds and bot.
- **Phones** (`e2e/kitsPhone.spec.ts`) at 360×740, 390×844 and 740×360: the kits ticked by touch, a kit's record in the inspector's sheet, and a kit's type with its fields locked, with nothing past the screen, 44 px targets and axe clean.
- **The stats gate** (`e2e/stats.spec.ts`): Gear ticked with its needs; a stat, a slot, an item, a status and an actor made with forms, the actor wearing the item; a row on a stat running out that damages a stat and adds a status; the export clean for `eb validate`. The arena fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/statsPhone.spec.ts`.
- **The factions gate** (`e2e/factions.spec.ts`): Economy, Factions and Time ticked; the calendar filled in with its form, a season's bad name shown at its box and fixed; a faction with two bands and drift, a resource, an item and a shop naming the faction, made with forms; a row on autumn's start that reads the guild's band and changes its standing, and a row on a shop opening that waits 6 hours; the sheet's form showing no problems; the export clean for `eb validate`. The steading fixture imported, its four seasons in the calendar's form, and its Run the same lines `eb sim` prints. Its phones are `e2e/factionsPhone.spec.ts`: Factions and Time ticked by touch, a season added, a faction's band and drift in the inspector's sheet.
- **The roster gate** (`e2e/roster.spec.ts`): Roster ticked, ticking Stats with it, and Economy; two stats, two statuses, two actors and a resource; a recruit template with two names, a rolled stat whose range runs down until fixed, a trait with a fee and a fee of its own; a hall offering it by weight; a roster with a cap, a start member, two ranks (the second's missing From shown until filled in) and bonds in two bands, all made with forms; rows on a hire, a rank changing and a member leaving, one whose If names a rank the roster lacks (E040) until fixed; the export clean for `eb validate`. The crew fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/rosterPhone.spec.ts`: Roster ticked by touch with Stats, and a recruit's names, rolled stat and trait in the inspector's sheet.
- **Units** (`app`, `editing`, `records`, `logic`, `scripts`): the roster's index (`records/rosterIndex.test.ts`) and its effects' words; the calendar's edits and problems; the index with factions and the calendar (`records/factionIndex.test.ts`); the four effects' words and the factions' facts'; Wait's fields from the calendar; schedule never offered as the game's own.

## Open questions

1. **Explaining a kit.** The boxes say what a kit brings in a line. A first-time author may want an example project per kit, as the templates of Phase 4 will have.
2. **A kit field's wording.** A project can rename its kit type ("Parts") but not relabel a kit's field ("Value" as "Cost").
3. **Whose kit a field is.** With Gear on, an item's Worn in and Modifiers show under "From the inventory kit", though the gear kit gives them.
4. **schedule's form.** A timer's effects are a list of effects, which no field kind holds, so schedule is JSON. The sheet editor's own list of effects (`EffectsField`) could hold them, as a roll's outcomes do.
5. **A season that starts on a month.** The engine takes `{ "month": "thaw", "day": 1 }` as a season's start, but the form's box is a day of the year: such a start shows as written, and typing in the box replaces it with a number.
6. **The calendar with Time off.** Its form shows only with Time ticked, so a calendar left behind (W116) can be taken out only by ticking Time again and clearing its boxes, or by hand.
7. **A recruit's offers in the editor.** A hall's form shows its templates and weights, not who it would offer: the offers are worked out from a game's salt, which only a played game has. Run's report doesn't list hires either.
8. **Names in bulk.** A template's names are a list typed one box at a time; Ludus's and Landnam's lists run to dozens.
