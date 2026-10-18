# Spec: the Logic panel and the sheet editor

M3.1's place in the editor for trigger sheets and flags ([triggers.md](triggers.md), D36): the Logic panel, which lists each sheet with its rows as cards and each flag with what the lint says of it, and the sheet editor in the inspector. Logic is the phone's fourth tab, Evan's call of 2026-10-18. The code is `apps/editor/src/logic/`: `LogicPanel.tsx` and the `LogicBrowser.tsx` it loads, `rowText.ts` (a row in words), `sheetEdits.ts` (the changes the editor makes, as plain functions), and the sheet editor's parts, `SheetRows.tsx`, `WhenField.tsx`, `EffectsField.tsx`, `choices.tsx` and `JsonField.tsx`.

## The Logic panel

- **Where it sits.** The desktop dock's left group, beside Project; the tablet's side zone; the phone's fourth tab: Project, Records, Assets, Logic, Problems, More (D37).
- **Trigger sheets.** Each sheet, by name and id, with how many rows it has and how many problems, then its rows as cards, in the order they run. A card says the row's id and whether it runs once, then its When, If and Do in words ("When a flag changes (flag: raids)", "If raids is at least 3", "Do: set met-trader to on"), and how many problems it has. Events are named by their labels; a game's own event, which the editor doesn't know, by its id.
- **Flags.** Each flag, by name and id, with what it holds ("On or off: starts off", "A number from 0 to 5: starts at 0") and each of its problems: the lint's warnings (W108 to W110) most often.
- **New sheet and New flag** ask for a name, as New does in the Records panel (M2.5), and open the new record in the inspector: a flag as `{ "name": … }`, a sheet as `{ "name": …, "rows": [] }`.
- **Opening.** A sheet's title opens it; a row's card opens it at that row, with focus in the row's first field. A flag's card opens its form.
- **Loading.** The panel's list loads once a project is open, as the Problems panel's does, so the editor's start carries only the panel's shell.

## Flags' forms

The engine's flag is a type file (`FLAG_TYPE_FILE`), so a flag's form is a record form like any other: Name, Description, and Number, a group added with "Add Number" that makes the flag a whole number with Starts at, Lowest and Highest. The flag type has no Edit type button in the Records panel, and New type refuses the names `flag` and `sheet`.

## The sheet editor

A sheet's form is its record form, laid out from the sheet's layout type file (`SHEET_TYPE_FILE`): Name and Description as fields, then its rows, each a group headed by its number and id.

- **When.** The event, from a list of the engine's own ("A flag changes", "A row runs"), and the game's once its scripts have run (M3.2), or "Another event, written by hand". For one of the engine's, a field per argument, each optional, empty meaning any: a list of the records an argument names, a list for a choice or yes or no, a box for text and numbers. For another event, its id and its arguments as JSON. Choosing another event clears the arguments, which were the old event's.
- **If.** The condition field (M2.4), which reads text with the engine's facts, as `eb validate` does without `--types`: `flag.on(met)` needs no argument name, and the field says it in words below ("Reads: met is on.").
- **Do.** The row's effects in order, each a block with Up, Down and Remove:
  - **Set a flag:** the flag, then To: On or Off for an on/off flag, a whole number for a number flag;
  - **Add to a flag:** the flag, and By, below 0 to take away;
  - **Roll:** its outcomes, each a chance, an optional text and effects of its own, with the total of the chances shown. Outcomes are added and removed; a roll keeps at least one;
  - **anything else,** a game's own effect, as JSON, written once it parses (D36). Once the game's scripts have run, Add effect offers its own effects by name (M3.2).
  - "Add effect" adds the kind chosen beside it, at the end.
- **Once, Note and Row id.** The row id's help says what renaming it does to a once row in older saves.
- **Rows** are added at the end ("Add a row", named row-1, row-2…, starting as "When a flag changes", doing nothing) and moved and removed with their own buttons.
- **Every change is a step** that undo takes back, as every form's is. Typing in a field joins one step.

## Problems in sheets and flags

- **The same checks.** The record index and the form check sheets and flags with the compiler's checks, as every record (M2.5).
- **Checks that span records.** A flag's lint reads every record that names it, and a set-flag's check reads the flag. So when a record that names a flag changes, the index checks every flag and every record that names one again, and a form's own check reads them from the index (`flagRelated`). A property test holds the index after edit after edit to one read afresh.
- **Places.** A problem inside a row, an effect or an argument opens the sheet with focus in that field: each part of the editor says where in the record it is (`data-at`), as fields do (M2.8).

## On a phone

- Six tabs fit a 360 px phone, More the last (D37), each at least 44 px each way.
- The sheet editor sits in the inspector's sheet. Its controls are at least 44 px, and its rows' groups and an effect's Up, Down and Remove wrap rather than run past the screen.
- **The page never scrolls as a whole.** The words kept for screen readers are placed against each panel's scroll box, not the page: placed against the page, a long form made the page itself scroll, taking the top bar off a phone's screen. The e2e checks hold every page to the screen's height.

## Checks

- **Timing:** `test/logic-bench.ts`, the index with 200 flags and 100 sheets.
- **Unit:** `logic/logicText.test.ts` (rows and flags in words, the sheet edits); `forms/catalog.test.ts` (the engine's types in the catalog, the form's flag-aware check); `records/flagIndex.test.ts` (the index with flags, and a property test of edits); `records/names.test.ts` (a sheet's places in words).
- **e2e on desktop** (`e2e/logic.spec.ts`): flags and a sheet made in the Logic panel, the lint following each edit, an event changed after a flag was chosen for the old one, a second effect added after the first, exported and read by the CLI to the hash of the same files made in Node; a game's own event and effect kept as written and edited as JSON, the file keeping the effect while its JSON doesn't parse; a problem inside a row opening the sheet at its field; set-flag's To by the flag's kind.
- **e2e on phones** (`e2e/logicPhone.spec.ts`), at 360×740, 390×844 and 740×360: the six tabs, the panel and the editor in reach (no overflow, 44 px, axe), a roll's outcomes and effects edited by touch, rows moved; and a flag and a sheet made on a phone, exported and read by the CLI.

## Open questions

1. **Long sheets.** Every row is open at once. A sheet of fifty rows may want rows that fold, or a row at a time with the cards to move between them.
2. **Moving by dragging.** Rows and effects move a step at a time with buttons, which works by touch and keyboard alike; dragging would be quicker for long moves.
3. **A game's events and effects.** Settled by M3.2 (D38): once a project's scripts/game.ts has run, the pickers offer the game's own ([editor-scripts.md](editor-scripts.md#the-game-through-the-editor)). A game whose code lives outside the project, given to `eb` by `--types`, still gets the engine's alone in the editor.
4. **Rows of other records.** A quest or a scene could carry rows of its own (D36), once missions (M3.7) need it.
5. **Checking flags together.** An edit to a record that names a flag checks every flag and every record naming one again: 60 ms for 300 of them in Node (ROADMAP.md's Readings), growing with their number, and untried on a phone. A lint indexed by flag would check only the flags the edit names, and the records naming those.
