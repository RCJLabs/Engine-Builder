# Spec: project format and content packs

This covers:

- the project folder (format 1);
- how `packages/compiler` reads and checks it;
- the content pack it builds;
- how the runtime reads a pack (`readPack` in `packages/core/src/pack.ts`);
- the `eb` command line in `tools/cli`.

The editor and the CLI follow it, so the same files give the same diagnostics and the same pack hash in both.

## The project folder

```
my-game/
  project.json              id, name, version
  records/<type>/<id>.json  one record per file; records/flag/ and records/sheet/ are the engine's (M3.1)
  types/<type>.json         the project's own record types, as fields (M2.4)
  assets/                   files that asset fields name (M2.4; M2.7 imports them)
  assets/assets.json        every asset's provenance: licence, source, date (M2.7)
```

- **Later folders.** Later milestones add `scenes/`, `ui/`, `scripts/`, `dialogue/` and `locales/` ([architecture](../architecture.md#project-format)).
- **What gets read.** The compiler reads `project.json`, `records/`, `types/` and `assets/assets.json`, and lists `assets/` for asset fields to name. Anything else in the folder is left alone, so a project can sit at the root of a game's repo, next to its README and package.json.
- **The provenance log** is specified in [editor-assets.md](editor-assets.md#the-provenance-log) (D34).
- **Type files** are specified in [type-files.md](type-files.md).
- **Flags and trigger sheets** are records of the engine's own types, `flag` and `sheet`, which every project has ([triggers.md](triggers.md), D36).
- **Hidden entries are never read.** These are names that start with `.` (`.git`, `.DS_Store`, `.gitkeep`) and the `__MACOSX` folder that macOS adds to zips.

## project.json (format 1)

| Field | Rule |
| --- | --- |
| `format` | `1` |
| `id` | a record id: kebab-case, 1 to 64 characters (`salvage-run`) |
| `name` | text, not empty |
| `version` | a semantic version, `MAJOR.MINOR.PATCH` with an optional pre-release (`1.2.0-beta.1`) |

The object is strict, so an unknown field is an error (E008).

**Format numbers.** `PROJECT_FORMAT` is 1, and it follows the same rule as `SAVE_VERSION`:

- **A newer format** gets E009 and is read no further. An engine can't know what a later format means.
- **When the format goes up.** Only when a project written today would no longer load unchanged. Adding an optional field doesn't need a new format.
- **What a new format brings.** A migration from the format before it. The fixture saved by the old format, [`packages/compiler/test/fixtures/v1`](../../packages/compiler/test/fixtures/v1), must still compile.

## Record files

A record lives at `records/<type>/<id>.json`:

- the folder is the record's type, and the file name without `.json` is its id;
- the JSON is the record's value, which doesn't repeat its id or type, so they can't disagree;
- ids and type names follow the rule in [records.md](records.md).

Anything else under `records/` is handled like this:

- **A `.json` file at any other depth** (`records/medkit.json`, `records/item/spare/medkit.json`) is E010. It looks like a record and would otherwise be lost.
- **Any other file** (`notes.md`, `medkit.json.bak`) is W101 and is ignored.
- **Encoding.** Files are UTF-8; a byte order mark is allowed. Bytes that aren't UTF-8, or text that isn't JSON, are E007.
- **A record that fails E007 still exists**, so the references to it don't fail as well: one problem, one diagnostic.

## Sources

The compiler reads only through a `ProjectSource`:

- `files(dir)` lists every file under a folder;
- `read(path)` gives a file's bytes, or `undefined` when the file is missing;
- paths are relative to the project root, with `/` between folders, and hidden entries are left out.

| Source | Used by | Notes |
| --- | --- | --- |
| `memorySource(files)` | tests; the editor's memory | Strings are stored as UTF-8. |
| `directorySource(handle)` | the editor: OPFS and opened folders | File System API handles. `NotFoundError` and `TypeMismatchError` mean missing; other errors are passed on. |
| `zipSource(bytes, limits?)` | the editor and the CLI | The project may sit at the zip's root or in one top folder. `\` counts as `/`. Folder entries and hidden entries are skipped, never unpacked. Throws when the bytes aren't a zip, and a RangeError past `limits` ([Zips](#zips)). |
| `folderSource(path)` | the CLI (`tools/cli`) | Node's fs. Hidden folders are never entered, and symbolic links are not followed. |

`directorySource` is tested against a fake that behaves like the File System API. A type check confirms that the browser's own `FileSystemDirectoryHandle` fits it. Since M2.1 it also runs on real OPFS, in the editor's e2e tests ([editor-storage.md](editor-storage.md)).

## Zips

A project travels as a zip: the editor exports one, imports one, and the CLI reads one.

- **What a project carries** (`projectFiles`): project.json and every file in the project's folders (`PROJECT_FOLDERS`: `records`, `types`, `scenes`, `ui`, `scripts`, `dialogue`, `assets`, `locales`), sorted, with hidden entries left out. Anything else beside them, such as a game repo's README, `package.json` or `node_modules`, is not the project's and stays behind.
- **Export** (`zipProject(source, top)`):
  - the project's files, inside one top folder (the editor uses the project's id);
  - entries in path order, every one dated midnight, 1 January 1980, and deflated at level 6.
  - The same files therefore give the same bytes. The date is built from local parts, as zip stores local time, so the bytes don't depend on the machine's time zone either.
- **Import** (`zipSource(bytes, limits)`):
  - limits count files and unpacked bytes from the zip's own listing, before anything is unpacked; the editor allows 10,000 files and 100 MB;
  - fflate unpacks no file past its declared size, so memory stays bounded;
  - a zip that understates a size gets that file cut short, silently, because fflate checks no CRCs. A record cut that way fails to parse (E007), like a damaged one.
- **Reading many files** (`readFiles(source, paths)`) reads 32 at a time. A browser's file system answers many reads at once far faster than one after another (Readings).

## Compiling

`compileProject(source, types, options?)` returns `{ diagnostics, pack, usedBy, records, dataTypes }`. `types` are the game's code types; the engine's `flag` and `sheet` and the project's own `types/` join them. `options` are the game's facts, events and effects, each optional ([triggers.md](triggers.md#checks)):

1. **project.json**:
   - missing: E008;
   - not UTF-8 JSON: E007;
   - a newer format: E009;
   - otherwise each schema problem is E008, at its field.
2. **Type files** in `types/` are read beside the code types: E007, E015 to E017 and W105 ([type-files.md](type-files.md#compiling)). A type whose file has problems still names its type; its records aren't checked until it is fixed. A type file named for one of the engine's types is E017.
3. **`assets/`** is listed, for asset fields to name (E018), the log left out. Then the log is read and checked against the list (D34): E007 when it isn't JSON, otherwise E019 to E021, W106 and W107 ([editor-assets.md](editor-assets.md#problems)).
4. **Record files** are sorted into records, misplaced files (E010) and ignored files (W101), then parsed (E007).
5. **Records** go through `validateRecords` ([records.md](records.md)), giving E001–E006, E011–E014, E018 and, since M3.1, E022–E027 and W108–W110, each with its record's file.
6. **Diagnostics** are sorted in the order records.md gives.
7. **The pack** is built only when no diagnostic is an error. Warnings don't stop it. Conditions written as text go into it as their trees, inside the effects the catalogue knows too.

Steps 1 to 4, short of parsing the records, are `readProjectFiles(source, types)` (M2.8). The editor's catalog runs the same function, and its record index the records' checks, so the Problems panel lists what `eb validate` says ([editor-problems.md](editor-problems.md)).

The result doesn't depend on the order a source lists files in, or on the files' formatting or key order (property-tested).

### Diagnostics this adds

Diagnostics about a record carry its type and id, taken from its path. The others carry only the file.

| Code | Severity | Meaning | File | Path |
| --- | --- | --- | --- | --- |
| E007 | error | a file is not valid UTF-8 JSON | the file | empty |
| E008 | error | project.json is missing or doesn't match the project schema | `project.json` | the field |
| E009 | error | the project needs a newer engine | `project.json` | `/format` |
| E010 | error | a JSON file under `records/` is not at `records/<type>/<id>.json` | the file | empty |
| W101 | warning | a file under `records/` that the compiler ignores | the file | empty |

Type files add E015 to E017 and W105, and asset fields E018 ([type-files.md](type-files.md#diagnostics)). The provenance log adds E019 to E021, W106 and W107 ([editor-assets.md](editor-assets.md#problems)). Trigger sheets, effects and flags add E022 to E027 and W108 to W110 ([triggers.md](triggers.md#codes)).

## Content packs (format 1)

```json
{
  "format": 1,
  "project": { "id": "salvage-run", "name": "Salvage Run", "version": "0.1.0" },
  "records": { "item": { "medkit": { "name": "Medkit", "weight": 1 } } },
  "hash": "16 hex digits"
}
```

- **The hash** is FNV-1a 64 of the RFC 8785 canonical JSON of `{ format, project, records }`. That is `stateHash` ([state-hash.md](state-hash.md)).
  - The same content gives the same hash in the editor and in the CLI, whatever the files' formatting, key order or listing order.
  - It is a fingerprint, not a signature.
- **Bytes.** Packs are written as canonical JSON plus a newline, so the same content gives the same bytes too.
- **The pack's own format.** `PACK_FORMAT` is 1, and it is separate from the project format: the runtime reads packs and never reads projects.
- **The golden.** The v1 fixture's pack hash is `489cedf323bd33d9`, and [`state_hash_oracle.py`](state_hash_oracle.py) computes the same hash from the fixture's files. A change to it changes every pack built so far, so it needs a decision.

`readPack(value)` throws a `PackError` unless all of these hold:

- the format is 1, and a newer format asks for a newer engine;
- the pack has exactly `format`, `project`, `records` and `hash`;
- the project has exactly a valid `id`, a `name` and a `version`;
- `records` maps valid type names to objects keyed by valid ids;
- the hash matches the content.

The sim then reads the records through `createRecordStore(pack.records)`.

## The CLI

```
pnpm eb validate <project> [--types <module>] [--json]
pnpm eb build <project> [--types <module>] [--out <file>] [--json]
pnpm eb schemas <folder> [--types <module>] [--json]
```

- **`<project>`** is a project folder or a zip of one.
- **`--types`** names a JS or TS module whose `recordTypes` export lists record types made by `defineRecordType`.
  - Since M2.4 a project's own `types/` needs no module: `eb validate` reads them as the editor does.
  - Its `facts`, `events` and `effects` exports, or a `modules` export for the first two, are what conditions, rows and effect fields are checked against; without them, the engine's own, and any other name taken as written (M3.1, D36).
  - Until kits exist (M3), a module is how the CLI learns a game's code types.
  - When records are of types neither defines, the CLI says where types come from.
- **Output.**
  - One line per diagnostic, `file#/json/pointer: severity code: message`, with the pointer written as a URI fragment (RFC 6901).
  - Then a summary line, with the hash when the pack builds.
  - `--json` prints `{ ok, records, hash, out, diagnostics }` instead.
- **build** writes the pack to `--out`, or to `<project id>.pack.json` in the current folder, and only when there are no errors.
- **Exit codes:** 0 with no errors, 1 with errors, and 2 when the command couldn't run (bad arguments, an unreadable input or types module).
- **Paths.** Through `pnpm eb`, relative paths are relative to the repository root, where pnpm runs root scripts.
- **schemas** (M2.8) writes each record type's JSON Schema into the folder's `.vscode/`, for VS Code to check records edited by hand ([editor-problems.md](editor-problems.md#eb-schemas)). It takes a folder only.

## Open questions

1. **VS Code and record schemas.** Settled in M2.8: `eb schemas` writes them into `.vscode/eb-schemas/` and maps them in `.vscode/settings.json` (D35, [editor-problems.md](editor-problems.md#eb-schemas)). Record files stay pure data, with no `$schema` key for strict objects to reject.
2. **Duplicate keys in a JSON file.** `JSON.parse` silently keeps the last one, and a git merge can produce duplicates. A warning would need a JSON reader that sees them.
3. **Zip size.** Settled in M2.1: `zipSource` takes limits, and the editor's import allows 10,000 files and 100 MB ([Zips](#zips)).
4. **Where a project's record types come from.** Its own types are in `types/` since M2.4 (D31). Code types still come from `--types`: `project.json` gains a `modules` list with M3.3's kits, and the CLI then resolves those modules instead.
