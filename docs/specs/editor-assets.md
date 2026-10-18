# Spec: editor assets

M2.7's asset browser: a project's images, sounds, 3D models and fonts, each with where it came from and under what licence, brought in and kept in the editor on a desktop or a phone. The provenance log and its checks are Evan's calls of 2026-10-18 (D34). The code is `packages/schema/src/provenance.ts` (the log's format and checks), `packages/compiler/src/compile.ts` (where it reports them) and `apps/editor/src/assets/` (the panel, the inspector's view of an asset, and the steps they make).

## The provenance log

`assets/assets.json` has an entry for every file under `assets/`, by its path inside that folder:

```json
{
  "files": {
    "portraits/spiculus.svg": {
      "licence": "CC-BY-4.0",
      "author": "Evan",
      "source": "Painted for the ludus",
      "date": "2026-10-18",
      "edits": ["Cropped to the face"]
    }
  }
}
```

| Key | Holds | Needed |
| --- | --- | --- |
| `licence` | one of the licences below, by id | always |
| `author` | who made it, as they ask to be credited | when the licence asks for credit |
| `source` | where it came from: a link, or words ("Kenney's UI pack") | always |
| `date` | when it came into the project, YYYY-MM-DD, a real day | always |
| `tool`, `prompt` | what generated it, and what the tool was asked | for `generated` |
| `edits` | hand edits since, oldest first, none empty | no |
| `standIn` | `true` for a stand-in the editor made | no |

- **The log is not an asset.** Asset fields can't name it, the browser doesn't list it, and no file inside `assets/` may be called `assets.json` at its top.
- **Strict.** Unknown keys, at the top, in `files` or in an entry, are E021. A path in `files` must be a path inside `assets/` the format takes (type-files.md, Assets).
- **The editor writes it in one order:** entries by path (UTF-16 order), keys in the table's order. A log written by hand keeps its layout and any order it has: each change edits the file in place, as M2.3's `editJson` does for records.
- **Per file only.** An entry covers one file. A pack of 200 sprites from one source gets 200 entries, which the editor writes in one step (Log their provenance).

## Licences

A fixed list passes (D34): anything else is refused until the list gains it, which is a change to the engine.

| Id | Name | Asks for credit | Covers |
| --- | --- | --- | --- |
| `own` | Own work | no | any file |
| `generated` | Generated | no (logs its tool and prompt) | any file |
| `public-domain` | Public domain | no | any file |
| `CC0-1.0` | CC0 1.0 | no | any file |
| `CC-BY-4.0`, `CC-BY-3.0` | CC BY 4.0, 3.0 | yes | any file |
| `MIT`, `Apache-2.0` | MIT, Apache 2.0 | yes (its notice) | any file |
| `OFL-1.1` | SIL Open Font License 1.1 | yes (its notice) | fonts, and files of no kind: the notice (`OFL.txt`) it asks to travel with them |

- **Refused by name:** an id with NC, ND or SA among its terms (split on anything but letters and digits, in either case: `CC-BY-NC-4.0`, `cc by-nc-sa 4.0`), each saying what it forbids.
- **Refused otherwise:** any other id, with the list of those that pass.
- **What a licence passing doesn't say:** whether a generator's own terms allow a use. The log records the tool and prompt, and the person decides.

## Problems

| Code | Severity | Meaning | File | Path |
| --- | --- | --- | --- | --- |
| E019 | error | a file under `assets/` has no entry | the asset | empty |
| E020 | error | a licence is refused, covers another kind of file, or what it asks for isn't logged | `assets/assets.json` | `/files/<path>/licence`, `/author`, `/tool` or `/prompt` |
| E021 | error | the log doesn't match its format | `assets/assets.json` | where |
| W106 | warning | an entry for a file that isn't in `assets/` | `assets/assets.json` | `/files/<path>` |
| W107 | warning | a stand-in is still in `assets/` | the asset | empty |

- **No log** with files in `assets/` gives E019 for each. An empty `assets/` needs no log.
- **A log that isn't JSON** is one E007 for the log, never an E019 for every file it would have covered. A log whose `files` isn't an object gives its E021s alone.
- **An entry of the wrong shape** still has its licence checked when it has one.
- **The pack doesn't change.** Packs hold records only, so the log adds no bytes to a pack, and the ludus fixture's hash stays `34035cc3fb5fba7a`.

## The Assets panel

- **Where:** beside Records in the desktop dock's centre group and the tablet's main zone; a sixth tab on a phone, after Records. A layout saved before M2.7 gains the panel, as the dock gives back any panel a saved layout lacks (M2.2).
- **Loaded late.** The panel's frame is in the editor's start; its browser and checks load when it is first shown with a project open: at once on desktop, where the dock mounts every panel, and at the first tap on its tab on a phone.
- **A tile per file**, in path order:
  - images drawn as they are (an SVG only as an image, where its scripts never run);
  - fonts as "Aa" in the font itself;
  - glyphs for sounds, models and other files;
  - a badge for the worst problem: No provenance, Licence problem, Stand-in.
- **Search** matches every word typed, in the path, licence, author and source. A **kind** filter (images, sounds, 3D models, fonts, other files) and **With problems** narrow it.
- **A hundred tiles at a time**, and Show more. Each tile reads its file when it is drawn, again only when a change names that file (`fileVersion` in `projects/opened.ts`), and lets it go when it isn't drawn.
- **Notices above the grid:** files with no provenance (with Log their provenance, one form for all of them), entries for files that are gone (with Remove those entries), and a log that can't be read.
- **A tab that only reads** shows everything and offers nothing that changes the project.

## Import

- **The Import files button** opens the file picker, several files at once. On desktop, files dropped on the panel do the same; the button stays the way for keyboards, screen readers and phones.
- **Where each file goes:** the folder typed, or by kind (`images/`, `audio/`, `models/`, `fonts/`; other files at the top). Names are cleaned to what a zip made anywhere can hold, never hidden, and never over a file that is there or one before it in the same import: `hero.png`, then `hero-2.png`. Paths are compared case aside, as a Mac's or Windows's disk sees them.
- **One provenance for the batch**, written before anything is imported, and checked as the compiler checks it for every file it will cover: Import does nothing until it passes. Until Import is tried, a box shows its problem only once something is in it. The date starts at today.
- **Limits:** 25 MB a file, 50 MB an import. A save carries its files whole in the journal (below), and an import is one save.
- **One step.** The files and their entries go in together, and undo takes them out together.

## Stand-ins

- **New stand-in** asks what it stands in for ("Flamma's portrait") and draws an SVG of 512 px square: the words in white on a colour from their hash, so two stand-ins tell apart at a glance. The same words always give the same bytes.
- **It goes in `stand-ins/`** under a name made from the words, kept free as imports are, and is logged as `own`, "A stand-in the editor made", with `standIn: true`. W107 lists it until it is replaced.
- **Replacing a stand-in** with real art keeps every record that names it: a file of another extension moves the path, and the records follow.

## The inspector

The inspector shows an asset as it shows a record or a type (`forms/selection.ts`), from a tile or from an asset field's Open:
- **A preview:** the image with its size in pixels, a sound to play, a font's sample, a model's counts (meshes, triangles, materials, textures, animations, nodes) and the files a `.gltf` needs beside it, which are marked missing when they aren't there, or the start of a text file. Models aren't drawn until the 3D viewport (Phase 5).
- **Its provenance as a form,** the record form's own fields over its entry: each box a step, typing in one joining into one, the editor's undo keys taking it back. The licence is a list of those that pass, with what the chosen one allows and asks under it; one written by hand off the list shows as refused. Tool and Prompt show for generated art, or once written. Hand edits are a list.
- **No entry yet:** the same form, in no file until Log it.
- **Used by:** the records whose asset fields name it, from the record index (M2.5), each opening its record.
- **Rename or move:** a new path inside `assets/`, folders and all. Refused: a path the format doesn't take, the log's name, another extension (a new name doesn't convert a file), a path taken case aside, and a change of case alone, which a Mac's or Windows's disk can't see. The file, its entry and every asset field that names it move in one step.
- **Replace:** new bytes of the same kind, with their own provenance. The form starts from the old entry, without its date and hand edits, or from nothing but the date over a stand-in. Same extension, same path; another extension moves the path, and the records follow.
- **Delete:** says how many records use it. They keep its name and show E018 until they name another file. Undo brings the file and its entry back.

## How a change is made

- **Plain steps over the working copy** (`assets/assetEdits.ts`), each reading what it changes as it runs, each one step of the command log (D30): import, log, change an entry, rename, replace, delete, stand-in.
- **Records are rewritten only where a type has asset fields** (`assetSites` in `types/rewrites.ts`), each in its own layout. A record whose asset fields name something else keeps its bytes.
- **The log is created when a project has none,** and a log that isn't JSON refuses every step that would change it: fixing it by hand comes first.

## The save journal

A stored project saves through M2.3's journal: every file of the save, as base64 inside one line of JSON with its hash, then the files themselves. Big assets made its cost show:
- **Base64 in parts.** It was one string of every byte, built by spreading slices, and read back by `Uint8Array.from` with a function per character: 1.8 s to build and 2.7 s to read for 25 MB in Node. Built in parts of whole three-byte groups and read with a plain loop, it writes the same text in 0.6 s and reads it in 0.4 s (Readings). A test holds the parts to the base64 of one pass at every size around them.
- **Memory.** Building the journal still holds about five times the save's size again: the base64, the JSON line and its bytes. A 25 MB import takes about 130 MB on top of itself in the writer's worker, which is why one import is capped at 50 MB.

## On a phone

- **The panel is a tab;** the asset shows in the inspector's sheet. Three columns of tiles at 360 px, and the import form's boxes stack.
- **Every control is at least 44 px each way,** the With problems box included.

## Checks

- **Unit:**
  - `schema/provenance.test.ts`: the licence list, refusals by name, kinds, dates, every code and where it points.
  - `compiler/types.test.ts`, `compile.test.ts`: the ludus fixture clean with its log and the same hash, each code from a compile, a single E007 for a log that isn't JSON.
  - `assets/assetLog.test.ts`: the log's order, moves, paths cleaned and kept free, moves refused, stand-ins' bytes and escaping.
  - `assets/assetEdits.test.ts`: every step over the ludus fixture, each compiled after; undo giving back every byte; records read only for types with asset fields; refusals.
  - `assets/assetList.test.ts`: the panel's problems held to the compiler's, file and pointer alike; the view's filters.
  - `assets/modelSummary.test.ts`: counts from a `.glb` and a `.gltf`, the files a `.gltf` needs, and why a model can't be read.
  - `editing/journal.test.ts`: base64 in parts equal to one pass.
- **e2e:** `e2e/assets.spec.ts` on a desktop, `e2e/assetsPhone.spec.ts` at 360×740, 390×844 and 740×360:
  - an import refused until its licence asks for nothing more, then undone;
  - the inspector's form, its steps and their undo;
  - a rename that carries the record naming the file, and its undo;
  - a stand-in a record names, replaced by real art the record follows;
  - a delete that says what will show a problem, and its undo;
  - files added by hand logged, entries for gone files removed;
  - files dropped, one too big refused, and a licence off the list shown refused;
  - a read-only tab;
  - on phones, the grid, the import form and the asset in the sheet;
  - the shared checks (overflow, 44 px targets, axe at every impact, no id twice).
- **The Phase 2 gate's automatic half for M2.7:** on a phone (390×844), an image imported with its provenance and named by a record, the project exported; the CLI reads the zip to the hash of the same files written in Node, provenance checked.

**Planted bugs.** Sixty-one, at the unit and the UI level; the first run caught 45. Each survivor got a test, now seen failing:
- an entry for a gone stand-in, which is W106 alone;
- an entry for a gone file with problems of its own, which is one orphan;
- a file named with capitals, taken case aside;
- a rename touching only the asset fields that name the file;
- the forms' rules, moved into plain modules to be tested: a blank form's problems, two files of one name in one import, both limits, a replacement of another kind, a replacement keeping its path (capitals and all: a first test with a lower-case extension missed the planted bug), and a stand-in's entry not carried to real art;
- a `.glb` whose first chunk isn't JSON;
- a replacement at the same path redrawing its preview and tile;
- a second stand-in of one name going beside the first;
- typing in a provenance box undoing as one step;
- the panel taking a drag of files over from the browser. On desktop the dock does that too, which hid the planted bug, so the check runs at tablet width.

## Open questions

1. **Folder entries.** A pack of 200 sprites from one source is 200 entries. An entry for a folder, which every file in it inherits, would keep the log short, but a file moved out of the folder would lose its provenance quietly.
2. **Small thumbnails.** Each tile decodes its image whole: 100 images of 512×512 hold about 100 MB of pixels while shown (worked out, not measured). Small copies made once (`createImageBitmap` with a size) would hold about 4 MB.
3. **The command log keeps imported bytes.** Undo needs them, so every import stays in memory as long as its step is in the log (D30's depth, not a size). A size budget for the log would let old imports go.
4. **The journal's memory.** A save of big files holds about five times their size while the journal is built. Writing big files beside the journal, named in it with their hashes, would keep a save whole for a crash without the copies.
5. **Credits from the log.** Phase 4's export can write a game's credits from the entries that ask for credit.
6. **A .gltf's files.** A `.gltf` imported without the buffers and images it names shows them missing, and an import that renames one (`ship-2.bin`) breaks it. A `.glb` carries its own.
7. **Drops are tested by a dispatched event.** Playwright can't drag a file from the desktop, so the e2e test dispatches the drop; a real drag in Chrome, Safari and Firefox wants a look by hand.
