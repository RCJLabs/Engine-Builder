# Spec: editor types

M2.6's type designer: a project's record types ([type-files.md](type-files.md)) made and changed in the editor, on a desktop or a phone. Renames carry the records with them, as Evan chose (D33). The code is in `apps/editor/src/types/`.

## Where

- **The inspector shows a type** as it shows a record (`forms/selection.ts`: a record, a type, or the form that names a new type). On a phone that is the sheet.
- **Ways in:**
  - the Records panel's Edit type, beside the type list;
  - New type, in the Records panel, the Project panel's list of types, and the command palette ("New record type").
- **Loaded late.** The designer loads the first time a type is shown, as the record form loads when a record is first chosen (M2.4). The offline cache holds it like any other file.
- **A tab that only reads** shows the designer with nothing it can change: no Rename, Delete, Add, Move or Remove, and its boxes read only.
- **A kit's type** (M3.3) shows the kit's fields first, locked, and has no Rename or Delete; the project's own fields come after them ([editor-kits.md](editor-kits.md)).

## A new type

- **One box: its name in words.** "Chariot Team" is the title, and makes the type's name, `chariot-team`, which is its file's name (`types/chariot-team.json`). A name a type file has already can't be used.
- **It starts with a name field.** The file is `{ "title": …, "nameField": "name", "fields": { "name": { "kind": "text", "min": 1 } } }`, so New and Duplicate fill in each record's name (M2.5). The field can be removed like any other.
- **Records with no type file** (a `records/<type>/` folder written by hand) show in the designer with "Create types/<type>.json". That file starts with no fields, since the records' keys may not include a name: their keys show as problems until fields of those names are added.

## The designer

- **The type:** its title, description, and the field its records are named by (one of its text fields, or none).
- **Its fields, in the order forms show them:** a row each, with what it holds in a few words ("Whole number, 0 to 100", "Record: School or Beast", "List of text, at most 6") and buttons to move it up or down. A row opens to edit its field, and a shut row says when anything inside it has problems.
- **A field opened:**
  - its name in the files, with Rename;
  - its kind, a list of the twelve;
  - its label, its help, and whether it is optional;
  - what its kind holds (below);
  - for a required field some records leave out, a value to fill them in with;
  - for a top-level field, how many records don't fit it;
  - Remove.
- **What each kind holds:**

| Kind | Options |
| --- | --- |
| text | fewest and most characters, several lines |
| int, number | smallest and largest |
| enum | its choices: add, rename, move, remove |
| ref | the types it names, a box each; the last one ticked can't be ticked off |
| list | each item (a kind and its options), fewest and most items |
| map | its keys (names, choices or records) and each value |
| group | its own fields, a list like the type's |
| asset | the kind of file, or any |
| bool, colour, condition, effects | nothing more |

- **The title, labels, help and bounds are boxes from the record form** (M2.4), over the type file instead of a record: typing joins into one step per box, the editor's undo keys undo it, and problems show once a box is left.
- **The records,** below the fields: how many, how many have problems, and buttons to show them in the Records panel, all of them or only those with problems.

## Names

- **A field's name** comes from what is typed: words become camel case ("Hit points" is `hitPoints`, which forms read back as "Hit points"), and a name typed without spaces stays as typed, so snake_case and kebab-case names work too. The format's rule decides what is refused, in its own words (`fieldNameProblem` in `@eb/schema`, the message E015 gives).
- **A type's name and a record's id** are made from words as M2.4's New makes ids ("Ludus Maximus" is `ludus-maximus`).
- **A choice** may be any text but empty, and none twice.

## Problems

- **The compiler's own:** E015 from the type file's shape and rules, then, once those are sound, E016 for refs to types the project has no type file for, as `eb validate` checks them. A test holds the designer's list to the compiler's for the same file.
- **Each shows where the designer has a place for it:** the type, its title, description or name field, a field, an option, a choice, a type a ref names. A problem with no place of its own goes to the nearest place above it: an unknown key in a field shows on the field.
- **A type file with problems can still be designed:** that is how it gets fixed. Its records aren't checked meanwhile (type-files.md), and the table says so.

## Changes that carry the records

Each is one step of the command log (D30): the type file and every record it changes, which undo takes back whole.

| Change | The type file | The records |
| --- | --- | --- |
| Rename a field | the field renamed where it stands; the name field follows | the key renamed where it stands, in every object the field's group has: inside groups, lists of groups and maps of groups too |
| Remove a field | the field taken out; the name field too, if it was that | its values taken out |
| Add a required field | the field, last | filled in with the value chosen, in every object of its group that leaves it out |
| Fill in a required field | nothing | the same, for a field some records leave out: made required, say |
| Rename a choice | the choice renamed where it stands | values holding it, list items, map values, and map keys when the choice is a key |
| A ref from one type to several | `to` a list | bare ids qualified: `ludus-magnus` becomes `school:ludus-magnus`, map keys too |
| A ref from several types to one | `to` a name | that type's refs made bare; refs of other types stay, and won't fit |
| Rename a type | moved to its new name; every `to` that names it, in every type file, follows | moved to `records/<new>/`; every `"old:id"` a field of several types holds becomes `"new:id"`. Bare ids stay: the records keep their ids |
| Rename a record | nothing | the record's file moves; every ref to it follows: bare ids, `type:id`, map keys, its own refs to itself |
| Delete a type | deleted | deleted |

- **Nothing is lost quietly.**
  - A field renamed onto a name some records already hold beside the old one is refused, with how many.
  - A name, id or choice that is taken is refused before the step.
  - A type that other types refer to can't be deleted: their refs would break, and their records would go unchecked. The designer names them.
- **Changes that convert nothing:**
  - **A field's kind changed.** The records keep their values, the designer says how many don't fit, and the table's bulk edit (M2.5) sets them. A field changed to a choice starts with the texts its records hold there, so they still fit.
  - **A choice removed.** Records holding it keep it, and don't fit.
  - **A ref's types changed** other than between one and several.
- **Conditions aren't rewritten.** A condition names records through the game's facts, and the editor doesn't know them yet (Phase 3), so it can't tell which words of `rival.is(flamma)` are ids. Renaming a record lists the records whose conditions mention its id as a word, and leaves them as they are. Words inside a fact's name (`arena.day` for a record `day`) don't count.
- **Moving a field** changes only the type file: records keep their keys in their own order.

## How a change is made

- **The rewrites are plain functions** of one record's JSON and its type file (`types/rewrites.ts`). They walk a record by paths into the type file (`types/defPaths.ts`: `['fields', 'bouts', 'of', 'fields', 'won']` is `won` in every item of `bouts`), and give the record back itself when nothing changes, so a record a change doesn't touch keeps its bytes.
- **Type files being fixed are walked as far as they make sense:** nothing in the walk trusts a file's shape.
- **Each step reads what it changes from the working copy as the step runs,** never from the record index, which may be a step behind. Records are read only when a change rewrites or checks them, so typing in a type's title reads one file however many records it has.
- **Each file is written in its own layout** (M2.3's `editJson`): its byte order mark, line ends and indentation stay. A record file that isn't JSON is left as it is, and a renamed type's moves it as it is.
- **What shows a type or a record follows a rename:** the inspector, the Records panel's table and its search, filters and sort.

## The record index

- **What only names things checks nothing again:** a type's title, description and name field, a field's label and help. The index's grounds (M2.5) leave them out, so typing a label in the designer doesn't recheck every record. Whether a field is optional, its kind and its options still count.
- **Everything else** a type change makes rechecks every record, as in M2.5.

## On a phone

- The designer fills the inspector's sheet. Rows wrap, so a field's move buttons drop below its name rather than squeeze it, and the new choice's box and button stack when they can't share a row (found by the shared overflow check at 360 px, inside a map's fieldsets).
- Every control is at least 44 px each way.

## Checks

- **Unit:**
  - `types/defPaths.test.ts`: paths read from the start (fields named `fields` and `key`), every def visited, values reached through lists and maps, records kept when nothing changes, key order in type files, and every type file change, including every kind's starting def being sound.
  - `types/rewrites.test.ts`: every rewrite at every place a value can sit, clashes, and condition mentions.
  - `types/typeEdits.test.ts`: every step as file changes over a project of four types that refer to each other every way, each compiled after to no problems, layouts kept, undo giving back every byte, and records read only when needed. A property test (fast-check, 60 runs) makes runs of up to six renames of records, types, fields and choices, and holds that each keeps the project free of problems and every reference pointing at the same record under its new name, that renaming back gives every value back, and that undo gives every byte back.
  - `types/designProblems.test.ts`: the designer's problems are the compiler's, each where it shows; the summaries.
  - `records/recordIndex.test.ts`: changes that only name things check nothing again; making a field required does.
  - `forms/labels.test.ts`: field names from words.
  - `schema/typeFile.test.ts`: `fieldNameProblem` says what E015 says.
- **e2e:** `e2e/types.spec.ts` on a desktop, `e2e/typesPhone.spec.ts` at 360×740, 390×844 and 740×360:
  - a new type, fields of several kinds, a label, a move and its undo, and records made of it;
  - a type file written for records that had none;
  - renames of a field, a choice and a type, with what they carry and their undo;
  - a field removed and undone, a required field added and filled, made optional and required again and filled where it was left out, a kind changed and what no longer fits, choices seeded from the records, the last ref target held;
  - a record renamed with its references, the conditions that mention it, and deletes refused and allowed;
  - a read-only tab;
  - on phones, the designer in the sheet with a map's and a choice's options open;
  - the shared checks (overflow, 44 px targets, axe at every impact, no id twice).
- **The Phase 2 gate's automatic half for M2.6:** on a phone (390×844), a type designed in the sheet, a record made of it, the project exported; the CLI reads the zip, with no `--types` module, to the hash of the same files written in Node.

**Planted bugs.** Seventy-eight, at the unit and the UI level; the first run caught 63. Each survivor got a test, now seen failing:
- a record that refers to itself, whose rename rewrote its old file beside the moved one;
- a ref to a list of one type; one type becoming several, with the old type not first;
- a new field placed before keys the type doesn't list;
- a fill counted in the group's objects, and copied for each;
- a clash only when both names are there;
- a field made optional on its own, which must recheck;
- an optional new field filling nothing;
- rows saying whether they are open;
- a fill value showing its problems;
- the palette's New record type;
- each box's typing a step of its own.

One planted bug, every change reading every record, was too weak (it listed the files without reading them) and was planted again. The bench then showed renames reading each record twice; they read it once now.

## Open questions

1. **Fields from records.** A type made for records that had no type file starts empty. Guessing its fields from the records' values (text, number, list…) would save typing, but a guess at a kind can be wrong in ways a person must check.
2. **Conditions that name records.** Once the editor knows the game's facts (Phase 3), a record's rename can rewrite the ids conditions name, as `conditionRefs` already finds them for "used by" in the compiler.
3. **Conversions on a change of kind.** Whole numbers to numbers, numbers to text, text to a choice convert without loss; the reverse doesn't always. None convert now; the table's bulk edit sets values.
4. **Big renames in an opened folder.** A rename that touches many files writes them one by one there, so a crash can leave some renamed and some not (D30's cost). Stored projects save through the journal, all or nothing. The editor could warn before a rename of hundreds of files in a folder.
5. **Undo after a rename** brings the files back, but leaves the inspector on the new name, which says the type or record isn't there any more, as M2.4's form does for a record undone.
