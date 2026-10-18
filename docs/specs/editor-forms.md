# Spec: editor forms

M2.4's record forms: a record's fields, drawn from its type's file ([type-files.md](type-files.md)), edited in the inspector, and written back through M2.3's command log ([editor-editing.md](editor-editing.md)). The code is in `apps/editor/src/forms/`.

## Where forms show

- **The Records panel** (M2.5, [editor-tables.md](editor-tables.md)) shows a type's records as a table. The Project panel lists the types, with a count, and a tap shows that type's table. A type without a type file says its records can't be edited, and a type file with problems shows its first problem. M2.4 listed records as buttons in the Project panel; the table took their place.
- **A tap on a record's name** opens its form in the inspector: the dock's Inspector on desktop, the side zone's Inspector tab on a tablet or a phone held sideways, and the inspector sheet on a phone (M2.2). The record stays chosen, marked `aria-current`, until another is chosen or the project closes.
- **New.** Each type with a sound type file has "New &lt;title&gt;", in the table's tools since M2.5. What is typed makes the id: lowercase words joined by hyphens, accents dropped ("Ludus Magnus" is `ludus-magnus`), and the form shows the file it will be. A taken or empty id can't be created. The record gets every required field, each empty (below), and opens in the inspector. When the type names its records (`nameField`), what was typed is its name too.
- **Duplicate and Delete** sit on the form. Each is a step like any edit, so undo takes it back. A record that is gone (deleted, or its creation undone) says so in its place, and comes back with redo. Duplicate (M2.5) asks for the copy's name, as New does.
- **"Used by"** (M2.5) follows the fields: what refers to the record, each a button that opens it.

## Writing

**The rule:** a form writes every value its field's JSON type can hold, valid or not, and shows the same diagnostic the compiler gives. It holds back only input that isn't a value yet.

- 150 in a field with a max of 100 is written, with "At most 100" beside it, as typing it into the file by hand would be.
- "7x" in a number field, or a condition that doesn't parse in a field whose file holds a tree, isn't written. It stays in the box with why, even after the field is left. Undo, redo or a fix clears it.
- An optional field emptied (text, a number, a condition) or cleared ("Clear") leaves the record. A required field is never taken out by a form.

**Each change is a step** (D30):
- typing in one field joins into one step within 500 ms, grouped by the record's file and the field's JSON Pointer;
- adding, moving or removing an item, an entry or a group is a step of its own;
- steps are named for the field and the record: "Edit Might in spiculus", "Add to Skills in spiculus", "Delete spiculus".

**The file keeps its layout** (M2.3's `editJson`): byte order mark, line ends, indentation, last newline, and the order of the keys already there. A new key goes just after the last key the type lists before it, so a file in the type's order stays in it. A new record is written with two spaces and a final newline.

**Typed text shows at once**, and the stored value follows when the edit lands (`editing/draft.ts`, shared with the project's own fields). The draft goes once the stored value catches up. That check runs against the draft as it is at that moment, not as it was when the value changed: a key pressed in between would otherwise be wiped (found in M2.4, losing the "n" of "trident").

## Fields

| Kind | Control | Notes |
| --- | --- | --- |
| text | a text box, or a box that keeps line breaks for `multiline` and for any text holding one | a one-line box would drop line breaks. "12 of 40" under a field with a max |
| int, number | a text box, plus a slider when both bounds are set | see below |
| bool | a 44 px tick box beside its label | |
| enum | the platform's own picker, full size on a phone | a value the file holds that isn't one of the choices stays on the list, marked "(not one of the choices)". An optional or missing one adds "None" or "Choose…" |
| ref, asset | a button showing what the field holds, which opens a picker | see below. A ref to a record that is there has Open beside it (M2.5) |
| colour | the platform's colour picker, and the hex it holds | the picker shows black for no colour; the words beside it say so |
| list | its items, each with Move up, Move down and Remove, then Add | buttons, not dragging, so a thumb and a keyboard work the same. Focus follows the moved item, or goes to the new one. Add stops at `max` |
| map | its entries in file order, each key, value and Remove, then Add | keys of records or values are chosen from those not taken; other keys are typed, and a rename keeps the entry in place |
| group | its fields in a fieldset | one the record leaves out is added whole, with its required fields |
| condition | a box for its text, then the condition in words | see below |

**Number boxes are text boxes** with `inputmode`, not `type="number"`, following GOV.UK's reasons: a scroll wheel can change a number box by accident, and it hides half-typed input from the page. The keyboard a phone shows:
- digits for an `int` with a min of 0 or more;
- digits and a point for a `number` with such a min;
- the full keyboard otherwise, because iOS's number pads have no minus key ([WebKit bug 193825](https://bugs.webkit.org/show_bug.cgi?id=193825), open since 2019). The WHATWG spec lets a device leave the minus key out.

**Sliders** step by a power of ten near a hundredth of the range (0.01 for 0 to 1, 1 for 0 to 100), and by 1 at least for an `int`. Values are rounded to the step, so dragging writes 0.3, never 0.30000000000000004.

**Pickers** are the command palette's pattern (M2.2): a modal dialog with a search field and a list, as a WAI-ARIA combobox. Focus stays in the field, the arrows move, Enter chooses, and Escape, Cancel or a tap outside close it. Choosing closes the dialog first, which hands focus back to the field's button. The button's name is the label and the value together, so a screen reader says both. A ref picker lists the target type's ids, or `type:id` for several types; when the type names its records (M2.5), each shows its name with its id ("Ludus Magnus (ludus-magnus)"), and so does the button. An asset picker lists the files in `assets/` of the field's kind.

**Conditions** are always edited as text ([conditions.md](conditions.md)) and written in the form the field holds them (D31): text stays text, written as typed; a tree stays a tree, written once the text parses. A new condition is text. Under the box is the condition in `describeCondition`'s words ("Reads: Arena day and not crowd angry."). The editor has no fact catalog until kits arrive (Phase 3), so conditions are parsed and described without one, as the compiler does for a project made only of data.

## Problems

- **The same diagnostics as the compiler.** `checkRecord` runs `validateRecords` on the record on screen, with every other record counted as there (for refs to name) but not checked, and `assets/` listed. One record's checks per change, not the project's.
- **At the field they're about.** Each diagnostic shows at the deepest field on screen whose pointer holds its path. A problem inside a condition's tree shows at the condition. What no field claims shows at the top of the form, and a key the type doesn't list gets a Remove button there.
- **When.** A field being typed in shows no new problem until it is left; one it already had stays up while it is fixed, and goes as soon as it is. Practitioner guides agree on this (validate on leaving a field, clear on fixing), though no controlled study was found. Fields never touched show their problems at once, so a new record shows what is left to fill in.
- **Kinds' own messages** are written for people: "At most 100", "No school chosen yet", "Expected an image: .png, .jpg…" ([type-files.md](type-files.md#kinds)).

## Loading

The record form, with the record checks it runs, loads when a record is first chosen, as the dock loads only on desktop (M2.2). That keeps 13.3 kB gzipped off the editor's start, which grew 8.2 kB with M2.4 instead of 20 (Readings). The offline cache holds the form like any other file. Two changes made the split work:
- `@eb/core`, `@eb/schema` and `@eb/compiler` say `"sideEffects": false`, so a bundle keeps only the modules whose exports are used, whatever the packages' index files re-export;
- `schemaIssues` has its own module, so reading type files at the start doesn't bring the rest of validation with it.

## A tab that may not edit

When another tab edits the project, or an opened folder isn't writable yet (M2.3), the form shows the record read only: boxes are read only, pickers and buttons disabled, and New is gone. It follows the editing tab's saves.

## Checks

- **Unit:** `forms/*.test.ts`, covering:
  - values set in place and new keys in the type's order, empty values, numbers typed, slider steps;
  - labels and ids;
  - the catalog;
  - problems routed to fields;
  - edits that keep a file's layout and undo to its bytes.
- **e2e:** `e2e/forms.spec.ts` on a desktop, `e2e/formsPhone.spec.ts` at 360×740, 390×844 and 740×360, on the ludus fixture:
  - every kind edited and read back from OPFS, kept through a reload;
  - undo by field;
  - pickers by keyboard and touch;
  - lists and maps with focus following;
  - conditions in both forms;
  - problems and held-back input;
  - New, Delete and undo;
  - read only in a second tab;
  - the shared checks (overflow, 44 px targets, axe at every impact) with a whole form and a picker open.
- **The Phase 2 gate's automatic half:** a project edited through its forms and exported, which the CLI reads, with no `--types` module, to the hash of the same edits made to the fixture's files in Node.

## Open questions

1. **A phone's keyboard over the sheet.** The inspector sheet sits at the bottom of the screen, where the keyboard opens. Browsers pan the page to keep the box typed in visible, but this is untested on a real phone. `interactive-widget=resizes-content` would shrink the page instead, on Android only.
2. **A record's name in lists.** Settled in M2.5: `nameField` ([type-files.md](type-files.md#the-file), D32).
3. **Renaming a record** with what refers to it. Settled in M2.6: Rename on the form's head ([editor-types.md](editor-types.md#changes-that-carry-the-records), D33).
