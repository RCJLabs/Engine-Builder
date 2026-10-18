# Spec: kits in the editor

This is how the editor shows and edits kits (M3.3, M3.4, [D41](../decisions.md), [D42](../decisions.md)): the Project panel's boxes that turn them on, their types among the project's, their effects in the sheet editor, and a kit's type in the type designer. The kits themselves are [kits.md](kits.md).

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

## Checks

- **e2e on desktop** (`e2e/kits.spec.ts`):
  - the gate: kits ticked; an item, a resource and a shop made with their forms; a row on a shop's opening that gives the item; a field of the project's own on the item; the exported zip checked clean by `eb validate`;
  - a kit turned off with its need's, its records then of an unknown type, and undo;
  - the hangar fixture imported, its scripts allowed, and Run's report the same lines `eb sim` prints for the same seeds and bot.
- **Phones** (`e2e/kitsPhone.spec.ts`) at 360×740, 390×844 and 740×360: the kits ticked by touch, a kit's record in the inspector's sheet, and a kit's type with its fields locked, with nothing past the screen, 44 px targets and axe clean.
- **The stats gate** (`e2e/stats.spec.ts`): Gear ticked with its needs; a stat, a slot, an item, a status and an actor made with forms, the actor wearing the item; a row on a stat running out that damages a stat and adds a status; the export clean for `eb validate`. The arena fixture imported and its Run the same lines `eb sim` prints. Its phones are `e2e/statsPhone.spec.ts`.

## Open questions

1. **Explaining a kit.** The boxes say what a kit brings in a line. A first-time author may want an example project per kit, as the templates of Phase 4 will have.
2. **A kit field's wording.** A project can rename its kit type ("Parts") but not relabel a kit's field ("Value" as "Cost").
3. **Whose kit a field is.** With Gear on, an item's Worn in and Modifiers show under "From the inventory kit", though the gear kit gives them.
