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
  records/<type>/<id>.json  one record per file
```

- **Later folders.** Later milestones add `scenes/`, `ui/`, `scripts/`, `dialogue/`, `assets/` and `locales/` ([architecture](../architecture.md#project-format)).
- **What gets read.** The compiler reads only `project.json` and `records/`. Anything else in the folder is left alone, so a project can sit at the root of a game's repo, next to its README and package.json.
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
| `zipSource(bytes)` | the editor and the CLI | The project may sit at the zip's root or in one top folder. `\` counts as `/`. Folder entries are skipped. Throws when the bytes aren't a zip. |
| `folderSource(path)` | the CLI (`tools/cli`) | Node's fs. Hidden folders are never entered, and symbolic links are not followed. |

`directorySource` is tested against a fake that behaves like the File System API. A type check confirms that the browser's own `FileSystemDirectoryHandle` fits it. It meets real OPFS in M2.1, when the editor starts storing projects.

## Compiling

`compileProject(source, types)` returns `{ diagnostics, pack, usedBy, records }`:

1. **project.json**:
   - missing: E008;
   - not UTF-8 JSON: E007;
   - a newer format: E009;
   - otherwise each schema problem is E008, at its field.
2. **Record files** are sorted into records, misplaced files (E010) and ignored files (W101), then parsed (E007).
3. **Records** go through `validateRecords` ([records.md](records.md)), giving E001–E006, each with its record's file.
4. **Diagnostics** are sorted in the order records.md gives.
5. **The pack** is built only when no diagnostic is an error. Warnings don't stop it.

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
```

- **`<project>`** is a project folder or a zip of one.
- **`--types`** names a JS or TS module whose `recordTypes` export lists record types made by `defineRecordType`.
  - Until kits exist (M3), this is how the CLI learns a project's types.
  - Without it every record is E002, and the CLI says why.
- **Output.**
  - One line per diagnostic, `file#/json/pointer: severity code: message`, with the pointer written as a URI fragment (RFC 6901).
  - Then a summary line, with the hash when the pack builds.
  - `--json` prints `{ ok, records, hash, out, diagnostics }` instead.
- **build** writes the pack to `--out`, or to `<project id>.pack.json` in the current folder, and only when there are no errors.
- **Exit codes:** 0 with no errors, 1 with errors, and 2 when the command couldn't run (bad arguments, an unreadable input or types module).
- **Paths.** Through `pnpm eb`, relative paths are relative to the repository root, where pnpm runs root scripts.

## Open questions

1. **VS Code and record schemas** (moved here from records.md). I recommend an `eb schemas` command that does two things:
   - writes each type's JSON Schema;
   - writes a `.vscode/settings.json` that maps `records/<type>/*.json` to that schema.

   Record files then stay pure data, with no `$schema` key for strict objects to reject. It is listed under M2.8.
2. **Duplicate keys in a JSON file.** `JSON.parse` silently keeps the last one, and a git merge can produce duplicates. A warning would need a JSON reader that sees them.
3. **Zip size.** `zipSource` unpacks everything into memory, so a hostile zip could exhaust it. That's fine for the CLI on our own zips. The editor's zip import (M2.1) should cap the total size.
4. **Where a project's record types come from.** `project.json` gains a `modules` list with M3.3's kits, and the CLI then resolves those modules instead of taking `--types`.
