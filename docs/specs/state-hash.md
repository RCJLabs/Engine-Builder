# Spec: state fingerprints

This is the exact algorithm behind `canonicalJson`, `fnv1a64`, `stateHash`, `readFacets` and `firstDifference` in `packages/core/src/`. A port that follows it produces the same fingerprints, so goldens, saves, replays and parity checks agree across implementations.

[`state_hash_oracle.py`](state_hash_oracle.py) is an independent implementation of this page in Python. In CI, `packages/core/src/stateHash.oracle.test.ts` sends it fixed cases plus 300 generated ones. It checks every canonical text, hash and size against `@eb/core`.

## Canonical JSON: RFC 8785 (JCS)

A value's canonical text is its RFC 8785 serialization:

- **Objects:** properties sorted by their names' UTF-16 code units; `,` and `:` with no whitespace.
  - So `"😀"` (surrogates 0xD83D 0xDE00) sorts before `"דּ"`, though its code point is higher.
  - `"10"` sorts before `"9"`: keys are compared as text.
- **Arrays:** elements in order.
- **Strings:** as ECMAScript's `JSON.stringify` writes them.
  - `\"`, `\\`, `\b`, `\f`, `\n`, `\r` and `\t` use the short escapes.
  - Other characters below U+0020 become `\u00XX`, in lowercase hex.
  - Everything else is written as itself, in UTF-8.
- **Numbers:** ECMAScript's Number-to-String, the shortest text that round-trips: `1e+21`, `1e-7`, `0.5`. `-0` is written `0`.
- **The rest:** `true`, `false` and `null`.

**Stricter than `JSON.stringify`, on purpose.** Game state is saved as JSON. A value JSON would change (NaN to `null`, a Map to `{}`) throws `CanonicalError`, with an RFC 6901 JSON Pointer to it, instead of being hashed quietly:

- NaN, Infinity and −Infinity;
- `undefined` inside an array, and holes in sparse arrays;
- functions, symbols and bigints;
- objects whose prototype is neither `Object.prototype` nor `null` (Map, Set, class instances, typed arrays);
- cycles.

An object property whose value is `undefined` is left out, as JSON leaves it out. That keeps a state and its reloaded save hashing the same.

## FNV-1a 64

```
h = 0xCBF29CE484222325
for each byte of the text encoded as UTF-8 (a lone surrogate as U+FFFD):
    h = (h XOR byte) * 0x100000001B3   (mod 2^64)
```

The result is written as 16 lowercase hex digits.

The published vectors are `""` → `cbf29ce484222325`, `"a"` → `af63dc4c8601ec8c` and `"foobar"` → `85944171f73967e8`.

JavaScript has no exact 64-bit integers, so `@eb/core` computes this with four 16-bit limbs. The prime is 2⁴⁰ + 0x1B3, so multiplying by it is `h × 0x1B3 + (h << 40)`. A port with `uint64_t` writes the loop above directly.

## State hash

`stateHash(value) = fnv1a64(canonicalJson(value))`.

It is a fingerprint for telling states apart, with about a 2⁻⁶⁴ chance that two different states match. It is **not** cryptographic: never use it to detect tampering.

## Facets

`readFacets(state, { exclude })` gives one reading per top-level key, in sorted key order, skipping keys whose value is `undefined`:

```
{ [key]: { hash: fnv1a64(canonical(state[key])), size: UTF-8 bytes of canonical(state[key]) } }
```

- **Why facets.** A whole-state hash is all-or-nothing. A port, or a refactor, stays red until everything matches and says nothing on the way. Facets go green one at a time.
- **Why top-level keys.** They partition the state by construction. In the reducer API (M1.5) each module's slice is a top-level key, so each module is a facet.
- **Why `size`.** It separates "a different shape" (a missing or extra field) from "a different value".
- **`exclude`** names parts about the telling rather than the game: logs and chronicle prose that get reworded. Naming a key the state doesn't have throws, so a typo can't quietly stop a facet being checked.

The facet idea comes from landnam's `src/run/parity.ts`.

## First difference

`firstDifference(a, b)` returns `{ path, a, b }` for the first place two values differ, or `null` when they are equal as canonical JSON. The path is an RFC 6901 JSON Pointer: `~` is written `~0` and `/` is written `~1`.

The walk:

1. If the shapes differ (missing, array, object, or any other value), report this path.
2. **Arrays:** compare shared indexes in order. If one is longer, report the first index only it has.
3. **Objects:** compare the union of keys in sorted order. A key missing on one side counts as missing, and so does `undefined`.
4. **Other values:** they differ when their canonical texts differ, so `-0` equals `0`.

A hash mismatch alone is, in landnam's words, "a smoke alarm with no address"; the first difference is the address.

## Golden vectors

The sample state:

```json
{
  "rng": { "seed": "golden", "s": [1, 2, 3, 4] },
  "day": 12,
  "party": [{ "id": "kit", "hp": 7, "traits": ["steady"] }, { "id": "rook", "hp": 0, "traits": [] }],
  "flags": { "met-rook": true, "debt/paid": false },
  "log": ["Day 12: the convoy left."]
}
```

| Case | Expected |
| --- | --- |
| canonical text | `{"day":12,"flags":{"debt/paid":false,"met-rook":true},"log":["Day 12: the convoy left."],"party":[{"hp":7,"id":"kit","traits":["steady"]},{"hp":0,"id":"rook","traits":[]}],"rng":{"s":[1,2,3,4],"seed":"golden"}}` (210 bytes) |
| `stateHash` | `61b52a949bf94885` |
| facet `day` | `07f89407b4ba0c0a`, 2 bytes |
| facet `flags` | `42d820a12920cb94`, 35 bytes |
| facet `party` | `dfd11344b8f2d73d`, 74 bytes |
| facet `rng` | `01c07163fbaa34d8`, 31 bytes |
| facet `log` | left out with `exclude: ["log"]` |

The values are frozen in `packages/core/src/stateHash.test.ts`, and the oracle reproduces them. Changing any of them changes every golden built on this format, so it needs a decision (D19), not an update.

## Notes for ports

- **Floats.** ECMAScript's shortest round-trip number format is the hard part to match in another language. Keep sim state in integers (fixed-point where needed) wherever a port matters; the oracle's own cases avoid floats with exponents for the same reason.
- **Key order is UTF-16 order, not code-point order.** They differ only when a key holds characters above U+FFFF and characters between U+E000 and U+FFFF.
