# Spec: type files

A project can define its own record types as data, in `types/` (D31, Evan's call). Each file lists a type's fields by kind. The compiler builds it into the same strict zod schema a code type has, so validation, references, "used by" and the condition lint treat both alike ([records.md](records.md)). The editor's forms draw from the same files ([editor-forms.md](editor-forms.md)).

The code is `packages/schema/src/typeFile.ts` (the format), `typeSchema.ts` (the schema it becomes), `assets.ts` (asset fields) and `packages/compiler/src/types.ts` (reading `types/`). The editor designs them in the inspector (M2.6, [editor-types.md](editor-types.md)).

**Prior art.**
- **CastleDB**, the JSON database behind Dead Cells and Northgard: its sheets' column types are id, text, bool, int, float, enum, ref (to another sheet), list (a sub-sheet), color, file and image, among others. The kinds here are close to that set.
- **LDtk**: its entity fields add bounds on ints and floats, multi-line text, and arrays with a count limit.

## The file

```json
{
  "title": "Gladiator",
  "description": "A fighter of the arena.",
  "nameField": "name",
  "fields": {
    "name": { "kind": "text", "min": 1, "max": 40 },
    "might": { "kind": "int", "min": 0, "max": 100 },
    "style": { "kind": "enum", "values": ["retiarius", "murmillo", "secutor", "thraex"] },
    "school": { "kind": "ref", "to": "school" },
    "free": { "kind": "bool", "label": "Freed" },
    "skills": { "kind": "list", "of": { "kind": "text", "min": 1 }, "max": 6 },
    "kit": { "kind": "map", "key": { "kind": "ref", "to": "weapon" }, "of": { "kind": "int", "min": 1 }, "optional": true },
    "record": { "kind": "group", "fields": { "wins": { "kind": "int", "min": 0 }, "losses": { "kind": "int", "min": 0 } } },
    "portrait": { "kind": "asset", "of": "image", "optional": true },
    "fights": { "kind": "condition", "label": "Fights when", "optional": true },
    "story": { "kind": "text", "multiline": true, "optional": true }
  }
}
```

- **Where.** `types/<type>.json`. The file name is the type's name, as a record's file name is its id: kebab-case, 1 to 64 characters ([records.md](records.md#ids-and-type-names)). Its records sit in `records/<type>/`.
- **Keys.** `title` (text, not empty), `description` (text, optional), `nameField` (optional, below) and `fields`. The object is strict, like every object in the format: an unknown or misspelled key is a problem (E015).
- **`nameField`** (M2.5) names the field that holds each record's name: one of the type's own top-level fields, of kind `text`, required or optional. Tables, pickers and "used by" show a record's name beside its id, and New and Duplicate fill it in from what was typed ([editor-tables.md](editor-tables.md#new-duplicate-and-names)). A record without a name, or of a type with no `nameField`, is known by its id. Naming a field the type doesn't have, or one of another kind, is E015 at `/nameField`. It is the same idea as Contentful's `displayField` and the "primary field" an Airtable table has.
- **Fields** are in the order forms show them, and the order a form writes new keys in.
- **Field names** start with a letter, then letters, digits, `_` or `-`, up to 64 characters, so camel, snake and kebab case all fit. A name every JavaScript object already has (`toString`, `constructor`, `valueOf`…) is refused: zod reads a field as `value[name]`, so a record without that field would seem to hold a function. `fieldNameProblem` gives the same rule, in the same words, to the type designer.

## Fields and values

A field is a value plus what a named field may add:

| Key | Meaning |
| --- | --- |
| `kind` | one of the twelve below |
| `optional` | `true` lets a record leave the field out. Fields are required unless they say so, as zod's are. There are no defaults: records spell out their data. |
| `label` | what forms call the field; otherwise its name in words ("hitPoints" reads "Hit points") |
| `description` | help shown under the field, and the field's `description` in the JSON Schema export |

A list's items (`of`) and a map's keys and values are values: they take a kind and its options, but never `optional`, `label` or `description`.

## Kinds

The names follow the fact domains conditions already use (`bool`, `int`, `enum`, `ref`, `text`; [conditions.md](conditions.md#facts)).

| Kind | Options | Holds | Messages |
| --- | --- | --- | --- |
| `text` | `min`, `max` (characters, as JavaScript counts them: UTF-16 units), `multiline` (a hint for forms) | a string | "Write something here" (a min of 1), "At least 3 characters", "At most 40 characters" |
| `int` | `min`, `max` (whole numbers) | a whole number | "Expected a whole number", "At least 0", "At most 100" |
| `number` | `min`, `max` | any finite number | "Expected a number", "At least 40.5" |
| `bool` | none | `true` or `false` | "Expected true or false" |
| `enum` | `values`: one or more strings, none empty, none twice | one of them | "Expected one of: a, b" |
| `ref` | `to`: a type name, or a list of them | a bare id for one type; `"type:id"` for a list ([records.md](records.md#references)) | "No school chosen yet" when empty |
| `list` | `of` (a value), `min`, `max` (items) | a JSON array | "At least 1 item", "At most 6 items" |
| `map` | `of` (a value), `key` (a `ref` or an `enum` value) | a JSON object | see below |
| `group` | `fields` | a JSON object with those fields, strict | "Missing field", "Unknown field" |
| `colour` | none | `"#"` and six hex digits, either case | "Expected a colour like "#3a7bd5"" |
| `asset` | `of`: `image`, `audio`, `model` or `font` | a path inside `assets/` | see below |
| `condition` | none | a condition, as text or as its tree ([conditions.md](conditions.md#conditions-in-records)) | the parser's and `checkCondition`'s (E011 to E014) |
| `effects` | none | a list of effects, in order, each `{ "effect": name, … }` ([triggers.md](triggers.md#checks)) | E001 inside one, E025 for one the game doesn't have, and each effect's own checks |

- **Bounds** are inclusive. `min` above `max` is a problem (E015). The bounds of `text` and `list` are counts of 0 or more; an `int`'s are whole numbers.
- **Maps.** Keys are JSON object keys, so always strings.
  - With `key` of kind `ref`, they are ids of that type, checked like any ref (E005, E006), and "used by" lists them.
  - With `key` of kind `enum`, they are some of those values. zod's `z.record` with enum keys would demand every one, so the map is a `z.partialRecord`.
  - Without `key`, they follow the field-name rule.
- **Slider.** An `int` or `number` with both bounds gets a slider beside its box in forms. There is no option for it: a range means one, as in Godot's `@export_range` and Unity's `[Range]`.

## Assets

An asset field holds a path inside the project's `assets/` folder: `portraits/spiculus.png`.

- **Paths** have `/` between folders. No part may be empty, start with `.` (hidden: the compiler never reads those), be `__MACOSX`, or hold `\ : * ? " < > |` or a control character, so a zip made anywhere unpacks anywhere. A bad path is E001.
- **Kinds**, by extension, in either case. M2.7's asset browser imports these kinds and files of any other, which no asset field of a kind can name ([editor-assets.md](editor-assets.md)). This list is the browser's too.

  | Kind | Extensions |
  | --- | --- |
  | `image` | png, jpg, jpeg, webp, gif, svg, avif |
  | `audio` | mp3, ogg, opus, wav, m4a, aac, flac |
  | `model` | glb, gltf |
  | `font` | woff2, woff, ttf, otf |

- **The file must be there**: E018 when nothing in `assets/` has that path. Paths are compared exactly, case included, as OPFS and zips do, though a Mac's own disk would not. The editor's own imports and renames keep paths apart case aside, so no two differ only in case.
- **Not the log.** `assets/assets.json`, the provenance log (D34), is not an asset: asset fields can't name it.
- **Every file has its provenance** in the log, or the project doesn't build (E019, [editor-assets.md](editor-assets.md#problems)).
- **`asset(kind?)`** in `@eb/schema` gives code types the same field.

## How a file becomes a record type

`readTypeFile(value)` checks a file's shape with the format's own strict zod schema, then the rules a shape can't carry: bounds in order, nothing listed twice. `typeFromFile(type, file)` then builds `{ type, file, recordType }`:

- the top level and every `group` become `z.strictObject`, and `optional` fields `.optional()`;
- `ref` becomes `ref()` or `refAny()`, `asset` becomes `asset()`, `condition` becomes `condition()`, and `effects` becomes `z.array(effect())`, so the walk finds them as it finds a code type's ([records.md](records.md#validation));
- `label` and `description` become the field's JSON Schema `title` and `description`;
- `defineRecordType` checks the result like any other type.

The JSON Schema of the format itself is `typeFileJsonSchema()`, for editing type files by hand: `eb schemas` writes it to `.vscode/eb-schemas/_type-file.json` and maps `types/*.json` to it (M2.8, [editor-problems.md](editor-problems.md#eb-schemas)). It has the format's shape only; the rules a shape can't carry are `readTypeFile`'s.

## Compiling

`compileProject(source, codeTypes, options)` reads `types/` beside the game's code types:

1. **Each file under `types/`, in path order:**
   - a `.json` file in a folder below `types/` is E017, and any other file is W105, ignored;
   - a name that isn't a type name is E017;
   - a name the game's code already defines is E017, and the code's type stands;
   - `flag` or `sheet`, the engine's own types (M3.1, D36), is E017, and the engine's type stands;
   - bytes that aren't UTF-8 JSON are E007;
   - a shape or rule problem is E015, at its pointer in the type file.
2. **Refs between types.** Every `to` must name a type the project has: a code type, or any file in `types/`, sound or not. A ref to a type with problems is not one more problem. Otherwise E016, at the `to`.
3. **A type with problems** (E007, E015 or E016) still names its type. Its records exist, so refs to them resolve, but they aren't checked until the file is fixed: one problem, one diagnostic. A stand-in record type holds the name.
4. **Records** are validated against code and data types together, with `assets/` listed for asset fields.
5. **The pack** holds each condition written as text as its tree (`packValue`), so the runtime only ever reads trees. The same project gives the same hash whichever form its conditions are written in.

A project needs no `--types` module when its own types cover its records: `eb validate` and `eb build` read `types/` the same way.

## Diagnostics

| Code | Severity | Meaning | File | Path |
| --- | --- | --- | --- | --- |
| E015 | error | a type file doesn't match the type file format | the type file | the key at fault |
| E016 | error | a type file names a record type the project does not have | the type file | the `to` |
| E017 | error | a type file is misplaced, misnamed, or names a type the game already defines | the file | empty |
| E018 | error | an asset field names a file that is not in `assets/` | the record | the field |
| W105 | warning | a file under `types/` that the compiler ignores | the file | empty |

Diagnostics about type files carry no record type or id.

## The format over time

- **No project format bump.** `types/` is new, and a project without it loads as before. An engine from before M2.4 reports E002 for records of a project's own types, and E011 for conditions written as text: loud, never silently wrong.
- **Adding to the format** (a kind, an option) needs no new format, as for project.json ([project-format.md](project-format.md#projectjson-format-1)). A change that would read an existing type file differently does.
- **`nameField`** (M2.5) was added this way: an engine from before it reports E015 for a type file that uses it.
- **The fixture.** [`packages/compiler/test/fixtures/ludus`](../../packages/compiler/test/fixtures/ludus) is a project made only of data: three types that between them use every kind there was before M3.7's `effects`, each naming its records by `name`, a condition as text and one as a tree, and an asset. It compiles to `34035cc3fb5fba7a` with no `--types` module; `nameField` changed nothing in its pack, which holds records only.

## Open questions

1. **A record's name in lists.** Settled in M2.5: `nameField` (above, D32).
2. **Colours with alpha.** The platform's colour picker has none, so `colour` is six hex digits. Add `#rrggbbaa` when a game needs see-through colours.
3. **A required field added to a type.** Settled in M2.6: the type designer fills it in on the records there are with a value chosen as it adds the field, and offers the same for a field some records leave out ([editor-types.md](editor-types.md#changes-that-carry-the-records)).
4. **Renaming a type or a field.** Settled in M2.6 (D33, Evan's call): renames rewrite every record and reference to match, as one step undo takes back ([editor-types.md](editor-types.md#changes-that-carry-the-records)).
5. **Kits drawn with the same forms.** Settled in M3.3 (D41): a kit's types are type files, so their forms come free, and a project's `types/<type>.json` for one adds fields after the kit's ([kits.md](kits.md#fields-of-a-projects-own)). A kit's effects are written as fields too, which give both their schema and their form. Tuples and plain unions still have no kind.
6. **A list of effects.** Settled in M3.7 (D45): the `effects` kind, which the events kit's choices and outcomes, its `later` effect and a project's own types use. The editor draws it with the sheet's list of effects. A record renamed isn't renamed inside one, nor in a kit's fields or a sheet's rows: a rename follows only the ref fields of a project's own `types/` files, and the compiler shows each reference left behind (E005).
