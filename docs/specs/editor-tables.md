# Spec: editor tables

M2.5's Records panel: a type's records as a table, to sort, search and filter, and, in the tab that edits, to change many at once, copy and delete. Also "used by" in the inspector, and the record index both read. The code is in `apps/editor/src/records/`; the decision is D32.

## The Records panel

- **Where.** It leads the desktop dock's centre group and the tablet's main zone, since the World panel waits for Phase 4. On a phone it is a tab after Project. A saved dock layout from before M2.5 gets it in its active group (M2.2's rule for panels added since).
- **Which type.** A list at the top picks the type ("Gladiator (3)"). The Project panel lists the project's types with their counts, and a tap shows that type's table here. Each type keeps its own search, filters and sort while the project is open.
- **Loaded late.** The table and its tools load the first time the panel shows with a project open, as the record form loads when a record is first chosen (M2.4). The offline cache holds them like any other file.
- **A type without a sound type file** shows its records by id, with why they can't be checked or edited here.

## The record index

Every record of the open project, read and checked: each record's value, its problems, the references it makes, and the other way round, what refers to it (`recordIndex.ts`). The table and "used by" read it.

- **The compiler's own checks.** `validateRecords`, with the project's types and assets, so a table and `eb validate` agree. A file that isn't JSON gets the compiler's E007.
- **Loaded with the first project opened**, not with the editor, so the checks stay out of the editor's start (Readings).
- **Read 32 files at a time** (`readFiles`, M2.1's export reader).
- **Kept up to date by file.** A record's problems depend on its own value, on which records exist, and on the types and assets, nothing else. So:
  - an edit, undo or redo checks again only the records whose files it changed;
  - creating or deleting a record also checks those that refer to it, which "used by" already knows (it keeps references to missing records);
  - a change to a type file or to the assets checks every record;
  - a record whose bytes read the same keeps its entry, checks and all.
- **Another tab's save** names the files it wrote (`TabMessage` `saved.paths`), so a read-only tab reads only those again. An editor from before M2.5 leaves them out; then, and whenever anything may have changed, the index reads every file and checks those whose bytes differ:
  - when the project opens;
  - when a tab stops editing and drops its unsaved edits;
  - when a page comes back from the back/forward cache with another tab still editing, since saves made while it was away went unheard;
  - when a tab takes over editing.
- **One read at a time** (`projects/refresh.ts`): changes made during a read gather into one more, and "anything may have changed" outweighs a list of paths. Opening no longer reads the project twice: the editing layer asks for a read as it starts only when it finished a save cut short, or when the tab takes over.

## Columns and cells

- **Columns:** the record, then each field the type lists, then Problems and Used by. The record's column shows its name when the type names records (`nameField`, below) and its id; the name field has no column of its own.
- **A cell is one line of text:**

| Kind | Shows |
| --- | --- |
| text | the text, line breaks as spaces |
| int, number | the number as JSON writes it, aligned right |
| bool | Yes or No |
| enum, asset, colour | the value; a colour gets a swatch |
| ref | the name of the record it names, or its id |
| list | its items, joined by commas |
| map | key: value pairs, keys of refs by name |
| group | its fields that are set, each with its label |
| condition | its text, or a tree's text form |

- **Long values** are cut at 160 characters; the cell's width cuts them shorter on screen.
- **A value of the wrong shape** shows as its JSON.
- **An empty cell** shows a dash, and says "not set" (or "empty", "none") to a screen reader.
- **A swatch only for `#rrggbb`.** A colour field holding `url(…)` would otherwise have the page fetch it, and the editor makes no network calls.

## Sort

- **Every column sorts** from a button in its header. The sorted column's header carries `aria-sort`; no other header does, as the WAI-ARIA APG's sortable table and Adrian Roselli's "Sortable Table Columns" advise. Its mark is a character (▲, ▼; ◇ for a column not sorted), so it holds up under high contrast.
- **A first tap sorts ascending**, except Problems and Used by, which start with the most. A second tap reverses.
- **Order:** numbers as numbers; Yes after No; a choice in the order its type lists; text in the person's own language's order, digits as numbers ("g2" before "g10").
- **Records without the value sort last** either way, and ties keep id order, so the order never depends on how the rows came.
- **A table starts sorted by its record column**, ascending.

## Search and filters

- **Search** keeps the rows that hold every word typed, case and accents aside. It looks at the id, the name, every cell's text, and the ids that ref cells show by name.
- **Filters** are rows of a column, a test and, for most tests, a value. Every filter applies as it changes, and a row must pass them all.

| Column | Tests |
| --- | --- |
| record | contains, is |
| int, number | is, is not, is less than, is at most, is more than, is at least, is set, is not set |
| bool, enum, ref | is, is not, is set, is not set; the value is chosen from a list |
| list, map | has an item with, is empty, is not empty |
| group | is set, is not set |
| text, colour, asset, condition | contains, is, is not, is set, is not set |
| Problems | some, none |
| Used by | some record, no record |

- **"is not"** is the opposite of "is": a record without the value passes it.
- **"has an item with"** looks at what the cell shows and what the file holds, so a list of refs is found by names or ids.
- **A filter not yet complete** (no value, or a number that doesn't read as one) tests nothing, and says why beside it.
- **Removing a filter** moves focus to Add a filter, never to the next filter's ✕.

## Rows shown

- **100 rows at a time**, with "Show 100 more of …" below. Enough to scroll through, few enough to draw at once on a phone; the search, filters and sort run over every row. When the last rows show, focus goes to the first of them.
- **A count** above the table says how many rows the view leaves ("2 of 3 records"), in a status region a screen reader announces.

## On a phone

- **The table scrolls sideways inside its own region**, so the page never does (Adrian Roselli's "Under-Engineered Responsive Tables"): a region named by the table's caption, focusable so a keyboard can scroll it. WCAG's reflow rule exempts data tables, which need two dimensions to mean anything.
- **The select box and the record stay at the left edge** as the rest scrolls under them.
- **The region is positioned**, so the words kept for screen readers (`.visually-hidden`, absolutely placed) stay inside it. Placed against the page, they widened a phone's page past its screen (found by the shared overflow check).
- Every control is at least 44 px each way, the select boxes included, as the record form's tick boxes are.

## Selection and what it does

Only in the tab that edits.

- **A select box per row** ("Select spiculus"), and one in the header that selects every row the view leaves, beyond the 100 drawn too. It is mixed when some are selected.
- **What is selected is what the view shows of it.** A record deleted drops out; a change to the search or the filters clears the selection, so nothing hidden is ever acted on. Sorting keeps it.
- **The bar** shows while some are selected: how many, then Edit a field, Duplicate (one record only), Delete and Clear selection.
- **Edit a field** sets one field on every record selected, as one step ("Set Might on 3 records"):
  - the field is chosen from the type's own, and filled in with the control the record form has for it;
  - it starts at the value the records share, if they do, and says when they differ;
  - its problems are those the first record would have with it, shown as the form shows them;
  - its boxes keep the browser's own undo while typing (`FormApi.ownUndo`), since the editor's would undo a step the bulk edit never made;
  - an optional field can be taken off them all ("Clear Portrait on 3 records");
  - records whose files aren't JSON are left out, and it says so.
- **Duplicate** copies one record under a name, as New names one: it offers "Spiculus 2" (the first number whose id is free), shows the file it will be, and refuses a taken id. The copy is the original's bytes in their own layout, with the name field set to what was typed. It opens in the inspector.
- **Delete** deletes every record selected as one step ("Delete 3 records"). When records not selected refer to them, the bar says so beforehand; undo brings them back.
- **Each is one step** of the command log (D30): undo takes all of it back.

## New, Duplicate and names

- **New** moved from the Project panel to the table's tools.
- **A type may name its records** (`nameField` in its type file, [type-files.md](type-files.md#the-file)). Then:
  - the table's record column, pickers and "used by" show names beside ids;
  - New and Duplicate write what was typed into the name field, so "Carpophorus the Bold" is both the name and, as `carpophorus-the-bold`, the id.

## Used by and Open

- **The inspector lists what refers to the record shown**, below its fields: each record once, as a button that opens it, with where it refers in the form's words ("Weapons carried: gladius", "Skills, item 2"). The first 50 show, then "Show all".
- **A record that is gone** (deleted, or its creation undone) still lists what refers to it, so those references can be found and fixed.
- **Ref fields have Open** beside their picker button when the record they name is there.
- **Delete on a form** is still one tap: "used by" sits on the same form, and undo brings the record back.

## Ids

Labels, descriptions and lists point at elements by id. Preact's `useId` counts within one render root, and the desktop dock renders each panel as a root of its own, so two panels made the same ids: a form's Name label pointed at the Records panel's search box (seen in this milestone's e2e tests). `app/ids.ts`'s `useUniqueId` counts for the whole page, and the shared e2e check now refuses an id on two elements.

## Checks

- **Unit:**
  - `records/recordIndex.test.ts`: records read and checked, used by, an edit checking only what it changed, deletes and creates checking their users, types and assets checking all, E007, unchecked types, and the index after any run of edits matching one read afresh (fast-check, 60 runs) and the compiler.
  - `records/table.test.ts`: columns, cells of every kind, sorts, search and every filter test.
  - `records/names.test.ts`: names, copies' names, path words, ref choices with names.
  - `projects/refresh.test.ts`: reads gathered, "anything" outweighing paths, a stop, a failure, a change as a read ends.
  - `forms/recordEdits.test.ts`: many records changed, copied and deleted as one step, each in its own layout.
  - `editing/projectEditing.test.ts`: saves naming their files, and when a tab reads everything again.
  - `schema/typeFile.test.ts`: `nameField`.
- **e2e:** `e2e/records.spec.ts` on a desktop, `e2e/recordsPhone.spec.ts` at 360×740, 390×844 and 740×360:
  - sort, search and filters, with the count;
  - bulk edits, Clear, select all and its mixed state;
  - Duplicate from the bar and from the form;
  - Delete of several, the warning, and undo;
  - used by, Open, and a deleted record's users;
  - a read-only tab that sorts but can't change, and follows the other tab's edits by file;
  - the table offline;
  - on phones, the table scrolling inside its region with its columns pinned;
  - the shared checks (overflow, 44 px targets, axe at every impact, no id twice).

## Open questions

1. **Renaming a record** and what refers to it. A record's id is its file name, and refs hold ids, so a rename is a move plus a rewrite of every reference, including those in condition text. M2.6 needs the same rewriting for renamed types and fields ([type-files.md](type-files.md#open-questions), question 4); the two belong together. Until then: Duplicate, fix what "used by" lists, Delete.
2. **Duplicating several records at once**, and editing cells in place. Neither is in M2.5.
3. **Views kept across a reload.** A type's search, filters and sort last while the project is open. Keeping them (per project, in this browser) is cheap; whether they belong in the project, for everyone, is not.
4. **A worker for the index.** Checking all 2,008 records of the bench project takes 45–123 ms in Node (Readings). A mid-range phone may be several times slower, and opening a project, a change to a type, or a full re-read checks everything. Measure on Evan's phone before moving it.
5. **Choosing columns**, and their order; a group's fields as columns of their own.
