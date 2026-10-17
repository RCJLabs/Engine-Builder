# Spec: records

This covers record ids, references, the runtime record store in `packages/core/src/records.ts`, and the record types, validation and JSON Schema export in `packages/schema/src/`. The editor, the CLI and any port read records by these rules, so they agree on what a valid project is and on every diagnostic it gets.

Records are the engine's Creation Kit forms: typed data with stable ids, such as items, actors and loot tables. A project's records are checked when it compiles. At runtime the sim only looks them up.

## Ids and type names

A record id is 1 to 64 characters: words of `a`–`z` and `0`–`9`, joined by single hyphens. Record type names follow the same rule.

| Valid | Invalid |
| --- | --- |
| `medkit`, `dead-hauler`, `loot-table`, `9`, `a1-b2` | `Medkit`, `dead_hauler`, `-medkit`, `medkit-`, `dead--hauler`, `dead hauler`, `ö`, 65 characters, `medkit` plus a newline |

`RECORD_ID_PATTERN` is the whole rule as one regular expression:

```
^(?=[a-z0-9-]{1,64}(?![a-z0-9-]))[a-z0-9]+(?:-[a-z0-9]+)*$
```

The lookahead caps the length. The same piece works on either side of the colon in `type:id`, and JSON Schema carries it as a `pattern`.

- **Uniqueness.** An id is unique within its type. Different types may share an id: `item:medkit` and `actor:medkit` are two records.
- **Where they come from.** A record's JSON doesn't contain its own id or type; they come from where the record is stored. From M1.4 that is its file name and folder.
- **For ports.** ECMAScript's `$` matches only at the end of the text. Python's `$` also matches before a final newline, so use `re.fullmatch` there.

## References

A field that points at another record holds one of two forms.

- **A bare id.** A field declared with `ref('loot-table')` holds `"dead-hauler"`. The field names the type, so the value doesn't repeat it.
- **A qualified reference.** A field declared with `refAny(['actor', 'item'])` holds `"item:medkit"`. `QUALIFIED_REF_PATTERN` is the id pattern twice, joined by `:`.

`formatRef(type, id)` writes `type:id`, and `parseRef(text)` reads it back or returns `null`. Both forms are plain JSON strings, so content stays data.

A reference can sit anywhere in a record:

- a field, or an optional or nullable one;
- an array item, a tuple item, or a tuple's rest;
- a record's value, or a record's key (`"carries": { "medkit": 2 }` with keys declared as `ref('item')`);
- a union option, or a `z.lazy` recursion.

## The record store (`@eb/core`)

`createRecordStore(pack)` indexes compiled records for the sim. A pack is `{ [type]: { [id]: value } }`.

| Method | Returns |
| --- | --- |
| `types()` | types with at least one record, sorted |
| `ids(type)` | the type's ids, sorted; empty for an unknown type |
| `entries(type)` | `[id, value]` pairs, sorted by id |
| `has(type, id)`, `get(type, id)` | lookups; a miss gives `false` or `undefined` |
| `getOrThrow(type, id)` | the record, or a `RangeError` naming `type:id` |

- **Order.** Sorting compares UTF-16 code units, as canonical JSON does. So `"10"` sorts before `"9"` and before `"alpha"`, and iteration never depends on file or load order.
- **Frozen values.** Values are frozen in place, deeply. Sim code that tries to change content throws instead of changing it for every later read. The returned lists are frozen too.
- **Invalid names.** A type or id that breaks the id rule throws a `RangeError`. A compiled pack never has one.
- **No prototype lookups.** Lookups go through `Map`s, so `get('item', 'constructor')` is `undefined` unless such a record exists.

## Record types (`@eb/schema`)

`defineRecordType({ type, title, description, schema })` checks the schema and returns the type, frozen, with `targets`: the types its references point at, sorted.

- **Where types live.** The TypeScript type lives in pure code. The schema is annotated `z.ZodType<Item>`, so the two can't drift apart without a type error, and the sim never imports zod (as chooser-of-the-dead does).
- **Which zod.** Kits import `z` from `@eb/schema`, so every schema comes from the zod that this package reads.

Breaking any of these rules throws a `SchemaError` when the type is defined, naming where in the schema it happened:

- **The top level** is a `z.strictObject`.
- **Every object is strict.** Its catchall is `never`, so a misspelled field is an error rather than silently dropped. `z.object`, `z.looseObject` and `.catchall()` are refused.
- **Allowed kinds:**
  - string (and its formats), number (and `z.int()`), boolean, null;
  - literal, enum, template literal;
  - object, array, tuple, record;
  - union and discriminated union;
  - optional, nullable, readonly, `.required()`, and `z.lazy`, including recursive getter shapes.
  - Refinements (`.min()`, `.regex()`, `.refine()`) and `.extend()` are fine, since they don't change the kind.
- **Refused kinds, with the reason given in the error:**

  | Kind | Why |
  | --- | --- |
  | `default`, `prefault` | records spell out their data |
  | `catch` | it hides bad data |
  | `transform`, `pipe` | records must load exactly as written |
  | `any`, `unknown` | can't be checked, and a reference inside could not be found |
  | `custom` | can't be checked by shape or exported |
  | `intersection` | strict objects intersected reject each other's fields; use `.extend()` |
  | anything else (`date`, `bigint`, `map`, `set`, `undefined`…) | not JSON data |

- **Reference metadata.** `x-eb-ref` sits only on strings. Its value is a type name or a sorted list of them; `ref()` and `refAny()` write it that way.

Schema locations in errors read like `effects[].item`:

- `.` and a name for an object field;
- `[]` for array items or a tuple's rest, and `[i]` for a tuple item;
- `{key}` and `{}` for a record's keys and values;
- `|i` for union option `i`.

## Validation

`validateRecords(types, records, options?)` takes record types and `{ type, id, file?, value }` inputs, and returns `{ diagnostics, usedBy }`. `options.facts` is the game's fact catalog, for condition fields (step 6).

It throws only on programmer errors: two types with one name, or a type whose references name a type that isn't given.

Each record is checked in this order:

1. **Unknown type:** E002. Nothing more is checked; there is no schema to check against.
2. **Invalid id:** E003. The value is still checked.
3. **Duplicate:** E004, on every record that shares the type and id, each with its own file. Reporting every copy keeps the output independent of input order.
4. **Schema:** E001 for each zod issue.
   - An unknown field gets its own E001 at its own path.
   - A missing field is named: `Missing field "name"`.
5. **References**, found by the walk below:
   - A malformed value is left to E001, which zod has already reported.
   - A qualified reference whose type the field doesn't allow is E006.
   - Otherwise, a reference to a record that doesn't exist is E005. A record that has errors of its own still exists.
6. **Conditions** (M1.6). A field declared with `condition()` gets `checkCondition`'s codes, E011 to E014, in place of zod's E001. Once it is sound, the records it names join `usedBy` and the lint adds W102 to W104 ([conditions.md](conditions.md#conditions-in-records)).

**The walk** reads the schema and the value together. It also reads values that fail the schema, as far as their shape allows, so one bad field doesn't hide the references around it.

- **Objects:** only declared fields that are present.
- **Records:** every key, through the key schema and then the value schema.
- **Arrays and tuples:** by index.
- **Optional, nullable, readonly, nonoptional and lazy:** the inner schema.
- **Condition fields** (`condition()`): the walk stops and hands the value to the condition checks. A condition's references come from its facts' domains, not from the schema.
- **Unions:** the first option that accepts the value, which is the one zod accepted.
  - If none does, a discriminated union walks the option whose discriminator field accepts the value's discriminator.
  - A plain union that no option accepts is not walked, since there's no telling which option was meant.

**`usedBy`** maps every referenced `type:id` to its usages `{ from, file?, path }`.

- It includes references that fail E005 or E006, so the editor can show what still points at a deleted record.
- References that are malformed are left out.

**Order.** The output depends only on the set of records, never on their order:

- diagnostics are sorted by file (missing sorts first), then type, id, path, code and message;
- `usedBy` keys are sorted, and each key's usages by from, path and file;
- all comparisons use UTF-16 code units.

## Diagnostics

A diagnostic is `{ code, severity, message, type?, id?, file?, path }`. Validation always sets the record's `type` and `id`; the compiler's diagnostics about files that aren't records leave them out ([project-format.md](project-format.md#diagnostics-this-adds)). `path` is an RFC 6901 JSON Pointer into the record's value, and is empty for the record as a whole.

| Code | Severity | Meaning | Path |
| --- | --- | --- | --- |
| E001 | error | the record doesn't match its type's schema | the failing value; for an unknown field, the field |
| E002 | error | unknown record type | empty |
| E003 | error | invalid record id | empty |
| E004 | error | duplicate id within a type | empty |
| E005 | error | reference to a record that does not exist | the reference, or the key for a reference key |
| E006 | error | reference to a type this field does not allow | the reference |

- **Codes are a public contract**, like save keys: the editor, CLI output and people's notes refer to them. A code is never renumbered or reused, and a retired code stays in the table, marked retired.
- **More codes.**
  - M1.4 adds E007 to E010 and the first warning, W101, for files and project.json ([project-format.md](project-format.md#diagnostics-this-adds)).
  - M1.6 adds E011 to E014 and W102 to W104 for conditions ([conditions.md](conditions.md)).
  - Other warnings (W1xx) arrive with the milestones that need them.
- **Messages are not part of the contract.** Codes and paths are stable; wording may improve. E001 messages are zod's, except for unknown fields, missing fields and invalid record keys.

## JSON Schema

`recordJsonSchema(type)` exports a record type as JSON Schema draft 2020-12, through `z.toJSONSchema`:

- `$id` is `urn:eb:record:<type>`. `title` and `description` come from the record type and replace any on the top-level schema.
- Strict objects have `additionalProperties: false`.
- A reference field is `{ "type": "string", "pattern": …, "x-eb-ref": … }`:
  - `"x-eb-ref": "item"` means a bare id of an item;
  - `"x-eb-ref": ["actor", "item"]` means `"type:id"` with one of those types.
- Reference keys appear under `propertyNames`.
- Lazy recursion becomes `$defs`.

The export is for VS Code and other tools. `validateRecords` is the authority: for example, the qualified pattern accepts any type, and E006 is only checked by validation.

## Open questions

1. **How record files point VS Code at their schema.** Moved to [project-format.md](project-format.md#open-questions), with a recommendation.
2. **Plain unions that no option accepts** get zod's bare "Invalid input". M1.6 settled it for condition trees, the main plain union: they report `checkCondition`'s messages (E011) instead. For other plain unions, should validation report the closest option's issues, or should content use discriminated unions only? Decide when a kit first needs one.
3. **Record types with variants at the top level.** A discriminated union of objects is refused at the top level today. Revisit if a kit needs one.
