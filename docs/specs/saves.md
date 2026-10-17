# Spec: saves

This is exactly how a game is saved and loaded:

- the save file and `loadSave`, in `packages/core/src/save/`;
- module versions and migrations, in `packages/core/src/sim/migrate.ts`;
- the browser's side, in `packages/platform/`: stores, slots, backups, quarantine, codes.

A port must follow the file format and the loading rules to read the same saves. The slot rules are for any stage that keeps saves.

It keeps what held up in the existing games and avoids what went wrong in them:

- **A save that fails is kept, never written over.** landnam, 2060td, ludus, football-manager-simulator, afterglass and space-wrecked each had a path where a save that failed to load, or came from a newer build, read as empty and was replaced by the next autosave. Here such a save is copied to quarantine first.
- **Migrations by version, without today's content.**
  - From spliceworld: a registry of numbered migrations, and a save from a newer version left untouched.
  - dirtbag's and landnam's migrations read live content or tuning, so one old save migrated differently after each update. Here a migration sees only its own slice.
- **One write gate that reports failure.** rule-or-drool's `meta/storage.ts` sends every write through one place. Elsewhere write errors were swallowed, and progress was lost without a word.
- **The save before.** dirtbag keeps `save.prev`, and afterglass keeps a copy from the start of the day. Here each slot keeps the save its last write replaced.
- **A summary beside each save,** so a slot list doesn't parse every save, as in afterglass and climbing-world-traveler.
- **Logs that stop growing.** afterglass's saves reached 430 KB and spliceworld's 1,843 KB, on logs and derived data that only grew.
- **Codes with a checksum and the game's name:** 2060td's codec (deflated, base64url, FNV), and space-wrecked's `<appId>.<version>.<payload>.<check>`.
- **Persistence asked for on the first save,** as dirtbag does.

## The save file

```json
{
  "format": 1,
  "game": "salvage-run",
  "edition": "full",
  "build": "a0ceede",
  "savedAt": 1760700000000,
  "summary": { "day": 17 },
  "snapshot": { "kernel": { "seed": "run-1", "step": 35, "modes": [{ "id": "travel" }], "streams": {}, "versions": { "crew": 1 } }, "crew": {} },
  "log": [{ "type": "voyage/jump" }],
  "hash": "94b566fe492a48eb",
  "check": "5f5e2b73b54bd8ee"
}
```

| Field | Holds |
| --- | --- |
| `format` | `SAVE_VERSION` when it was written. |
| `game`, `edition` | Kebab-case ids. A demo's saves are kept apart from the full game's. |
| `build` | The build that wrote it, as any text. Only a save from the same build is held to its hash (below). |
| `savedAt` | Wall-clock milliseconds, for slot lists and for time away on load ([time.md](time.md)). It lives beside the state, never in it. |
| `summary` | Optional JSON for a slot list: the day, the place, the playtime. |
| `snapshot` | The state the log starts from. |
| `log` | The actions accepted since the snapshot, oldest first. |
| `hash` | `stateHash` of the state the log reaches: the game as it was saved. |
| `check` | `stateHash` (FNV-1a 64 of canonical JSON, [state-hash.md](state-hash.md)) of every other field. |

- **`createSaveFile(run, info)`** takes `{ snapshot, log, state }` and the fields above. A session's `start`, `log` and `state` are a run.
- **Formatting.** The checksum is over canonical JSON, so a file reformatted by hand still checks out.
- **`SAVE_VERSION` is 1.** It covers the file's own fields and the kernel's state: seed, step, modes, streams and versions. A change to either bumps it, with a fixture written by the old format that must still load. Module slices have versions of their own, so a module's change never bumps it.

## Checking a file

`verifySaveFile(raw, game?)` checks, in this order:

| Check | Problem | Message |
| --- | --- | --- |
| An object whose `format` is a whole number of at least 1 | `damaged` | Not a save file |
| `format` at most `SAVE_VERSION` | `newer` | The save is format 2; this game reads formats up to 1 |
| `check` matches | `damaged` | The save's checksum doesn't match its contents |
| Everything is JSON | `damaged` | The save holds something JSON can't: … |
| The fields' shapes: ids, build text, a finite `savedAt`, `summary` and `snapshot` objects, a log of objects with a string `type`, `hash` text | `damaged` | One message per field |
| `game` is the one asked for | `other-game` | The save is from "x", not "y" |

The format comes before the checksum because a newer format may check itself differently.

## Module versions and migrations

**Declaring them.** `defineModule({ version, migrate })`:

- `version` (default 1) names the shape of the module's slice.
- `migrate[n]` turns a version n−1 slice into version n.
- `createGame` throws when:
  - a version isn't a whole number of at least 1;
  - a migration's key falls outside 2 to the version;
  - a migration is missing ("saves of version n−1 could not load").

**Where versions live.** `kernel.versions` holds each module's slice version, keyed and sorted by module id. `init` writes it, and every commit carries it on.

**A migration sees only its slice.** It gets a deep copy and returns the new slice. It gets no content, tuning or clock, so any number it needs is a literal written into it. A migration that read today's content would migrate the same old save differently after each update.

**`game.migrate(state, sim)`** returns `{ state, report }`, or throws `MigrationError`. It works on a deep copy, so the caller's state is never changed or frozen. It works in these steps:

1. **The kernel is checked.** It needs:
   - seed text, and a step that is a whole number from 0;
   - a stack of at least one `{ id }` mode;
   - streams of `{ seed, s }` with four numbers;
   - whole-number versions.

   Anything else cannot migrate.
2. **Each module is brought up to date,** in the order the game lists them:
   - **No slice.** The module starts from its `init`, with streams forked from the seed as a new game's are. It is reported in `added`.
   - **A version that is missing or below 1** cannot migrate.
   - **A version above the module's** throws with `newer: true`.
   - **Otherwise** the migrations run in order, from the saved version + 1 up. The module is reported in `migrated` when any ran.
3. **Every mode on the stack must be one the game has.** A mode the game no longer has cannot migrate.
4. **A slice no module owns is kept** as it was, with its version, so a module that comes back finds its data. It is reported in `kept`.
5. **The result is checked.** The new streams join the kernel's, the versions are updated, and the state is checked as JSON and frozen. A migration that leaves something JSON can't hold cannot migrate.

## Loading

`loadSave(game, raw, sim, { game, build })` checks the file, migrates the snapshot, then replays the log.

1. **Checking.** `verifySaveFile`, as above.
2. **Migrating.** `game.migrate` on the snapshot. A `MigrationError` is `newer` when it says so, and `cannot-migrate` otherwise.
3. **Replaying, strictly** when the save's build is this build and nothing was migrated, added or kept. Then the log must replay exactly:
   - a refused action is `replay-differs`;
   - an action the game doesn't have throws `ActionError`, because the same build wrote it;
   - a replay that reaches another hash than `hash` is `replay-differs`.
4. **Replaying leniently** in every other case. The log replays under this build's rules. Refused and unknown actions are skipped and counted, and where the replay ends up is reported, not refused.
5. **The result** is `{ ok: true, state, file, report }`. The report adds three fields to the migration report:
   - `replayed`;
   - `skipped`;
   - `differs`: the state loaded is not the state saved. Either it was migrated or gained a module, or its log played out otherwise.

**Why two rules.** On the same build, a mismatch means a damaged save or a game that isn't deterministic, and both are worth stopping for. After an update, a mismatch is expected: a bug was fixed, or content was rebalanced. Refusing the save then would cost the player their progress.

## Sessions and the length of a log

- **`session.start`** is the state the log starts from. `session.compact()` makes the current state the new start and empties the log.
- **`saves.writeSession(slot, session, { build, savedAt, summary })`** writes `{ snapshot: start, log, state }`.
  - It compacts the session after a write that saved `maxLog` actions or more. `MAX_LOG`, 200, is the default.
  - A failed write never compacts.
- **The bound that gives.** A save's log holds at most `maxLog` − 1 actions plus those played between two saves. The save after a compaction still holds the actions since the one before.
- **The cost.** Salvage run takes about 31 µs a logged action on load, so 200 actions would take about 6 ms. That is extrapolated from the reading, not measured.

## Storage

### Stores

A `Store` is key-value storage of strings:

| Method | Does |
| --- | --- |
| `get(key)` | The value, or `undefined`. |
| `write(entries)` | Sets every key or none of them; `undefined` removes a key. |
| `keys(prefix)` | The keys starting with `prefix`, sorted. |
| `kind` | `indexeddb`, `local` or `memory`, so the stage can warn when saves won't outlive the tab. |

Every method throws a `StoreError` when storage refuses. Its `reason` is one of three:

- `full`: `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`.
- `blocked`: `SecurityError`, `NotAllowedError` or `InvalidStateError`. Storage is turned off, or the database was closed.
- `failed`: anything else.

The stores:

- **`memoryStore({ quota })`** is gone with the page. Its quota, in characters, lets tests fill it.
- **`localStore(storage)`** writes one key at a time. On a failure it removes the keys it added, puts the old values back, then throws.
- **`indexedDbStore(name = 'eb')`** is one database per origin, at version 1, with one object store, `kv`.
  - A write is one readwrite transaction with `durability: 'strict'`.
  - When another tab opens a newer version of the database, this one closes its connection, and its calls fail as `blocked`.
- **`openStore(name)`** tries IndexedDB, then localStorage if a probe write works, then memory.
  - IndexedDB comes first because localStorage on a shared origin is cleared by any game that calls `localStorage.clear()`, and rule-or-drool lost progress that way on rcjlabs.github.io.
  - localStorage also holds only about 5 MB.
- **`requestPersistence()`** returns `granted`, `denied` or `unsupported`.
  - Call it on the first save, not on load: browsers grant it more readily once a site has been used.
  - Persistence keeps storage from being cleared when space runs low. Safari also clears a site's storage, IndexedDB included, after seven days without a visit. Whether persistence exempts a site from that hasn't been checked here (question 8). Save codes are the copy that survives either.

### Keys

| Key | Holds |
| --- | --- |
| `eb/<game>/<edition>/slot/<slot>` | The save file, as JSON. |
| `eb/<game>/<edition>/summary/<slot>` | `{ slot, savedAt, build, summary }`. |
| `eb/<game>/<edition>/backup/<slot>` | The save the slot's last write replaced. |
| `eb/<game>/<edition>/quarantine/<slot>/<nnnn>` | `{ slot, problem, message, raw }`: a save kept as it was found. |

- Every game on an origin shares its storage, so every key starts with the game and edition.
- Slot names are kebab-case ids. `auto` is a slot like any other.
- Keys are never renamed: a renamed key is a lost save.

### Writing

`createSaves({ store, game, edition, maxLog, onFailure })` gives a game's slots. `saves.write(slot, file)` works in these steps:

1. **Bugs in the stage are rejected** with a `RangeError`:
   - a file of another game or edition;
   - a file that doesn't verify;
   - a slot name that isn't kebab-case.
2. **The save already in the slot is read.** It must be kept, not replaced, when:
   - it doesn't verify (damaged, another game, a newer format), or its kernel has no versions;
   - a module both saves have is at a higher version in it (`newer`);
   - its checksum isn't the one this `Saves` last wrote or loaded there (`conflict`: another tab or device wrote it since).

   Such a save goes to quarantine, and the backup stays as it was. Otherwise the save there becomes the backup, unless it is the same text.
3. **One atomic write** covers the quarantine entry, the backup, the save and its summary, in that order. A localStorage write cut short then never loses the old save.
4. **Any failure is reported, never thrown.** Failed reads count too. The result is `{ ok: false, reason, message }`, and the same goes to `onFailure`, so a failed autosave can't vanish into an unhandled promise.

A `Saves` that has not loaded or written a slot has no checksum for it. So a new game started over an old save moves the old one to the backup. The stage should ask the player first.

### Loading

`saves.load(slot, game, sim, build)` works in these steps:

1. **No save** is `empty`.
2. **The save is parsed and loaded** with `loadSave`. A throw from the game is `crashed`.
3. **Loaded.** If `differs` is set or anything was skipped, a copy of the save as it was goes to quarantine (`changed`). The next writes will replace it, and a later build may read it better.
4. **Not loaded.** A copy goes to quarantine, and the slot is left as it was.
   - For `damaged`, `other-game`, `cannot-migrate`, `replay-differs` and `crashed`, the backup is tried next.
   - If the backup loads, the result says `fromBackup: true`, and this `Saves` treats the backup as the slot's last seen save. So the next write quarantines the broken save rather than backing it up.
   - A backup that fails too is quarantined as well, and the slot's own failure is returned.
5. **A `newer` save never falls back.** The player should update, not carry on from an older save.

Reads that storage refuses throw a `StoreError` from `load`, `list` and `quarantined`: there is nothing to show.

### Lists, removal and quarantine

- **`list()`** reads the slot keys and the summary beside each one.
  - A slot whose summary can't be read is listed as `{ slot, readable: false }`, after the readable ones, never hidden. Its save may still load.
  - Readable slots come newest first, then by name.
  - Keys that aren't kebab-case slot names are skipped.
- **`remove(slot)`** removes the save, its summary and its backup, and leaves its quarantine entries.
- **`quarantined()`** lists every entry, by key.
  - The same text is kept once, so a broken save loaded twice makes one entry.
  - A new entry takes the next number not in use.
  - Nothing in the engine deletes an entry. A player can, after exporting it (M4.2).

## Save codes

`encodeSaveCode(file)` gives `EB1.<game>.<payload>.<check>`:

- the payload is the file's canonical JSON, deflated (fflate, level 9), in base64url without padding;
- the check is FNV-1a 32 of everything before the last dot, as 8 lower-case hex digits.

`decodeSaveCode(code, game?)` ignores spaces and line breaks. It refuses, in this order:

1. anything but four dot-separated parts starting with `EB1` and a kebab-case game id ("Not a save code");
2. a check that doesn't match ("The code is mistyped or cut short");
3. another game's code, when `game` is given;
4. a payload that unpacks to more than `MAX_CODE_BYTES`, 4 MiB ("more than a save can be"). The inflate buffer is capped there, so a small hostile code can't take a phone's memory;
5. anything that doesn't inflate to JSON ("The code does not hold a save").

A decoded file still goes through `loadSave`.

- **Other encoders.** Deflate output differs between libraries, so another encoder may write a different code for the same save. Any inflate reads it.
- **File export.** A file export is the save file's JSON, which carries its own checksum. The buttons for files and codes belong to the save/load screen (M4.2).

## Fixtures

`packages/core/test/fixtures/saves/salvage-v1.json` is a save of format 1 with every salvage run module at version 1. It was generated once and is never edited.

- It must load to state hash `94b566fe492a48eb` and play on to an ending.
- It also loads after a planted v2 migration of the hold, and with one module added and one removed.

Each `SAVE_VERSION` bump, and each module version bump, adds a fixture written by the old version.

## Proof

**`packages/core/src/save/save.test.ts`:**

- **The fixture:**
  - it loads and plays on, and loading changes and freezes only its own copy;
  - it loads after the planted v2 migration;
  - a module the save lacks starts with the draws a new game would make;
  - a slice no module owns is kept.
- **Every refusal in the tables above,** plus a slice with no version and a migration that leaves `NaN`.
- **The log:**
  - a strict replay is exact;
  - a tampered log is refused on the same build and loads under another;
  - a save whose hash isn't where its log leads is refused.
- **The gate:** 50 seeds saved halfway, put through JSON and loaded, continue to the same final hash as runs that never stopped.
- **The registry errors** for module versions.

**`packages/platform/src/*.test.ts`:**

- the store contract on memory, localStorage (a fake) and IndexedDB (fake-indexeddb), and atomic failure;
- the gate again through each store;
- namespacing, backups, every quarantine path, conflicts between tabs, fallbacks to the backup, loads that an update changed;
- `writeSession`'s compaction, list order and unreadable slots, quota and read failures, the IndexedDB upgrade from another tab;
- codes: round trip, refusals, the size cap;
- `openStore`'s fallbacks, `requestPersistence`.

**Planted bugs:** 71 of 72 were caught by at least one test. The survivor removes the cap on a code's inflate buffer. That cap bounds memory, which no test measures, and the size check behind it was caught.

**Readings:** save, load and code sizes and times, in ROADMAP's Readings.

## Open questions

1. **Format migrations.** The first `SAVE_VERSION` bump needs a step that brings an older file up to date before its shape is checked. Build it with that bump, with the format 1 fixture as its test.
2. **Migrations across slices.** A migration sees only its own slice. A change that moves data from one module to another would need both. Decide when one does.
3. **A mode that a newer game added.** A save in a mode this build lacks reads as `cannot-migrate`, not `newer`, so it falls back to the backup. A game-wide version number in the file would tell the two apart.
4. **Quarantine growth.** Nothing removes entries. The save/load screen needs a way to export and clear them (M4.2), and quarantine needs a bound if entries ever fill storage.
5. **Two writes at once.** A conflict is seen by checksum, per `Saves`, between a write's read and its write. Two tabs writing at the same moment can still race. So can two writes from one tab, such as an autosave and a save on `pagehide`, though there the loser is only the older of the tab's own saves. A Web Lock around the write would close both, as M2.3 plans for the editor.
6. **Time away.** After a load, the stage passes `time/elapse` with now − `savedAt` ([time.md](time.md)). `savedAt` comes from the writing device's clock, so a device with a wrong clock gives a wrong gap. The elapse cap and the refusal of negative time bound the damage.
7. **What a summary holds.** The summary is whatever JSON the stage passes. The stock screens (M4.2) will want a shape: day, place, playtime, perhaps a thumbnail.
8. **Safari's seven-day rule.** Does a granted `persist()`, or adding the game to the home screen, keep Safari from clearing its storage after seven days away? Check on a real iPhone before Proof #1 ships: players leave games for longer than a week.
