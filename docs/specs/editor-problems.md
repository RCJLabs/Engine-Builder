# Spec: Problems, the console and eb schemas

M2.8's three ways of seeing what is wrong: the Problems panel, which lists what `eb validate` would say of the open project; the console, which says what the editor did and what went wrong in it; and `eb schemas`, which lets VS Code check records edited by hand. Where they sit on each layout is Evan's call of 2026-10-18 (D35). The code is `apps/editor/src/problems/` (the panel), `apps/editor/src/app/Console.tsx`, `ErrorToast.tsx` and `errors.ts` (the console), `packages/compiler/src/projectCheck.ts` (the reading of a project's files the panel shares with the compiler) and `tools/cli/src/schemas.ts`.

## The Problems panel

### What it lists

- **What `eb validate` would say, with no `--types` module.** Two parts the editor keeps up to date already:
  - the catalog's problems, from `readProjectFiles`: project.json, the type files, which files under `records/` are records, and the provenance log (E007 to E010, E015 to E017, E019 to E021, W101, W105 to W107);
  - the record index's, from the compiler's checks of each record (E001 to E007, E011 to E014, E018).
- **The same code.** `compileProject` is `readProjectFiles`, then the records' checks, then the pack, so a check added to the compiler reaches the panel without a second copy.
- **Held together by tests:** a property test over every combination of sixteen planted problems compares the panel's list with `compileProject`'s, and an e2e test compares it with `eb validate --json` on a zip of the same files.
- **Not the game's facts.** A `--types` module can give the CLI a fact catalogue, and then conditions are checked against it (E012, W102). The editor has no facts until Phase 3, so those problems are the CLI's alone.
- **Until the index is read**, the panel shows the files' problems and says "Checking the records…".

### The list

- **By file,** in the compiler's order. A file is titled by what it is: "Gladiator Spiculus" (the type's title and the record's name, or its id), "Type Gladiator", "Project settings (project.json)", "Provenance log (assets/assets.json)", or else its path.
- **Each problem** says Error or Warning, its code, the compiler's message, and where in the file in words: a record's field labels as "used by" gives them ("Wins and losses: Wins", "Skills, item 2"), a type file's field names ("name › min"), an asset's path and field.
- **Show** picks errors and warnings, errors, or warnings. **Search** keeps the problems holding every word typed, in the code, message, file, title or where. The count says "12 of 40" while they leave some out. Both stay set while the panel is away.
- **200 problems** are drawn, and Show more adds 200 at a time. Drawing 200 of 1,000 took a median of 39 ms at phone size in headless Chromium (Readings).

### Opening a problem

Each problem is a button to where it is fixed (`placeOf`, `openPlace`):

| Problem in | Opens |
| --- | --- |
| a record | its form in the inspector (the sheet on a phone), with focus in the field the problem is at, or the nearest field holding it |
| a type file | the type designer, which shows the problem at its field |
| a file under `assets/`, or a log entry for a file that is there | the asset in the inspector |
| the log itself, or an entry for a file that is gone | the Assets panel |
| project.json | the Project panel |

A file the editor has no place for, such as a stray `records/notes.md` (W101), says so instead: "Move or delete it outside the editor."

**Focus at a field.** Every field sits in a box carrying its JSON Pointer (`data-at`, a `display: contents` box that lays out nothing). The form takes the pointer from `fieldToFocus` once it has drawn, and focuses the first control in the box at that pointer; failing that, in the box at its parent, and so up, the way a field's problems are shown at the deepest field that holds them.

### The count on the tab

- **The Problems tab carries the count** on every layout, red while any is an error. It is `tally`, which counts without building the list, after every change: 0.08 ms for 1,000 problems (Readings).
- **On desktop** the tab draws its count itself rather than setting the panel's title, which dockview would save as a change to the layout, and it sets the tab's name to match, since dockview names a tab by its title ([editor-layout.md](editor-layout.md#the-desktop-dock)).

## The console

- **Two levels.** An error is something the editor couldn't do, or something that went wrong in it: a step refused, a save that failed, a panel that wouldn't load, an error nothing caught. Everything else is information. Errors are marked "Error:" in red.
- **A line said again is counted** (×3), not repeated. The newest 200 lines are kept.
- **Copy all** puts every line, with its time, on the clipboard for a bug report. The editor sends nothing anywhere itself (offline always). **Clear** empties it.
- **Where it is:** the desktop dock's bottom group, in front of Problems; the strip along a tablet's bottom; a phone's tab (D35).
- **Errors nothing caught** reach the console through `catchErrors`, from the window's `error` and `unhandledrejection` events. Chrome's "ResizeObserver loop" reports are left out: nothing went wrong.

### The error toast

- **The last error shows as a toast** at the top of the page, on every layout, for 8 s. On a phone the console is a tab away, and a step refused there used to say nothing in view.
- **Console** shows the console: its tab on a phone, its group on desktop, and focus in its lines on a tablet, where it is always in view. **Dismiss** closes the toast. The console keeps the line either way.
- **One at a time.** A burst of errors shows the last; the console has them all.

## eb schemas

```
pnpm eb schemas <folder> [--types <module>] [--json]
```

- **What it writes.** Each sound record type's JSON Schema (`recordJsonSchema`, draft 2020-12, [records.md](records.md)) to `.vscode/eb-schemas/<type>.json`, pretty-printed. Then the mapping in `.vscode/settings.json`:

  ```json
  {
    "json.schemas": [
      { "fileMatch": ["**/records/gladiator/*.json"], "url": "./.vscode/eb-schemas/gladiator.json" }
    ]
  }
  ```

  A relative `url` is the workspace folder's, so this works when the project folder is the one opened in VS Code.
- **Which types.** The project's `types/` and the `--types` module's, as `eb validate` reads them. A type whose file has problems gets no schema, and the command says which and why. Records of a type nobody defines are named, with where types come from.
- **Kept in step.** Schemas of types the project no longer has are removed; other files in the folder are left. Run it again after changing a type; a run that changes nothing writes nothing new.
- **The settings are merged.** Other settings and other tools' entries in `json.schemas` are kept, in front; entries whose `url` starts with `./.vscode/eb-schemas/` are this command's and are replaced. The file keeps its indentation.
- **Refused, writing nothing (exit 2):**
  - a settings file that isn't plain JSON: VS Code allows comments there, which a rewrite would lose, so the command prints the entries to add by hand;
  - a zip, which has nowhere to write;
  - a folder with no `project.json`;
  - `--out` and the sim's flags.
- **Hidden.** `.vscode/` starts with a dot, so the compiler, zips and the editor leave it out: the content hash doesn't change.
- **What the schemas check:** a record's shape, the same as a form: fields, kinds, bounds, choices, strict objects and the form of ids. **Not** whether a reference names a record, conditions written as text, or whether an asset file is there: those need `eb validate` or the editor.
- **VS Code.** Its docs say its JSON support covers drafts 4 to 7, and 2019-09 and 2020-12 in part. The tests run the written schemas through `vscode-json-languageservice` 5.7.2, the library VS Code's JSON support is built on, set up from the written settings: no problems in the fixture's records, each wrong value and unknown field marked, a type's fields and a field's choices offered. They have not been tried in VS Code itself.

## On a phone

- **Problems and Console are tabs** (D35), after Project, Records and Assets.
- **A problem opens its record in the inspector's sheet**, the field focused. In landscape, tablet width, it opens beside the panel.
- **Every control is at least 44 px each way**, the toast's buttons included.

## Checks

- **Unit:**
  - `problems/problemList.test.ts`: every code a data project can give, planted at once, listed as `compileProject` lists them; the clean fixture; a property test over subsets of the planted problems (40 runs); the files' problems before the index; where each problem opens; titles and wording; the filters; counts.
  - `records/recordIndex.test.ts`: a record of a type with no type file gets E002, as from the compiler.
  - `compiler`: `compileProject` on top of `readProjectFiles`, every fixture to its golden hash.
  - `app/layout.test.ts`: each layout's panels, the dock's bottom group, a phone opening on Project.
  - `tools/cli/test/schemas.test.ts`: the files written and the fixture's hash unchanged; other settings and their indentation kept; stale schemas removed; a second run the same; a broken type skipped; records of no type named and nothing written; comments refused, nothing written; JSON out; the refusals; and the schemas through VS Code's JSON language service.
- **e2e:** `e2e/problems.spec.ts` on a desktop, `e2e/problemsPhone.spec.ts` at 360×740, 390×844 and 740×360:
  - the list against `eb validate --json` on a zip of the same files, before and after a fix made in the form;
  - each place a problem opens: a record's field focused, the type designer, an asset;
  - the count on the tab, and its name on desktop;
  - the filters, kept while the panel is away;
  - Copy all and Clear;
  - on phones, a refused step (an import over a provenance log that isn't JSON) shown as a toast, its Console button, and the line kept;
  - the shared checks (overflow, 44 px targets, axe at every impact, no id twice).

**Found by these checks while building it:**
- the record index skipped records of a type with no type file, which the compiler reports (E002), found by the property test;
- dockview's tab names hid the count from screen readers;
- `showPanel` skipped the console, from when it was never a tab, so on a phone the toast's Console button and the palette's "Show the Console panel" did nothing.

**Planted bugs.** PLANTED_RESULTS

## Open questions

1. **The game's facts.** Conditions are checked against facts only when the CLI is given them (E012, W102). The editor can list those problems once it knows a game's facts (Phase 3).
2. **Messages for patterns.** An id that breaks the id rule is reported by VS Code with the rule's regular expression. VS Code reads a `patternErrorMessage` beside a pattern; adding it would change the record JSON Schema export.
3. **Settings with comments.** `jsonc-parser`'s `modify` can add the entries and keep comments and layout, at the cost of a dependency for the CLI. Until then the command prints the entries.
4. **A project inside a repo.** VS Code reads `.vscode/settings.json` from the folder it opened. A project in a subfolder of a game's repo needs the entries in the repo's settings, with paths from there; the command could take the workspace folder to write them in.
5. **The toast and screen readers.** It is `role="alert"`, so each error is read out as it comes; a burst of errors could be noisy. Not yet tried with a screen reader.
