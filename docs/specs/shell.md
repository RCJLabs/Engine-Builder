# The play shell (M4.3, D53)

What a game is played inside: a title with slots, save and load, pause, settings, a crash screen and an update prompt. The engine draws it in the game's theme ([screens.md](screens.md#theme)); a game sets its words, its slots and its Daily in `ui/shell.json`. It wraps the game's own screens on the player page at `/play/` and in the editor's Play panel. M4.10's export will ship the same shell.

## shell.json

```json
{
  "title": "The Hut",
  "tagline": "A season above the tree line",
  "slots": 3,
  "daily": true,
  "slot-line": "Day {time.day} · {economy.amount(resource: coins)} coins"
}
```

Every field may be left out, and so may the file.

| Field | Default | What it is |
| --- | --- | --- |
| `title` | the project's name | The title screen's heading. |
| `tagline` | none | A line under it. |
| `slots` | 3 | Numbered slots, 1 to 5. |
| `daily` | `false` | Whether the title offers a Daily. |
| `slot-line` | `Step {turn}` | What a slot shows, a template of facts as a screen's text is ([screens.md](screens.md#bindings)), filled by the worker as each save is made. |

## Where it plays

- **The player page** keeps its saves under edition `play`. A game is opened from its file each visit; keeping it between visits is the export's (M4.10).
- **The Play panel** keeps its saves under edition `playtest`, apart from the player page's on the same origin. New starts with the panel's seed rather than a fresh one, so an author can play the same game twice.
- Saves are keyed `eb/<game>/<edition>/…` by `@eb/platform` ([saves.md](saves.md)), `<game>` being the project's id. A game played again after its pack changed loads its saves under the new build's rules, and says what changed.

## Saving

- **The worker makes the save; the page keeps it.** After the game starts, loads and each accepted step, the worker makes the save file from its session (the snapshot, the log since it, the state's hash) and sends it with the view. The page writes it to the slot in play through `createSaves`.
- **The worker never touches storage.** `lockDown` took IndexedDB from it before the game's scripts ran, and a script that could reach storage could reach every game's saves on the origin. Loading goes the other way: the page reads the slot's text and the worker loads it with `loadSave`, so backups and quarantine work as `@eb/platform` built them.
- **Every step** (Evan's call): the next action waits until the write lands, so a reload can't roll a step again. A write that fails says so in the shell's bar and play goes on; the next step tries again.
- **Compacting:** once a save holds 200 actions, the worker makes its current state the next save's snapshot, as `writeSession` does.
- **What a slot shows:** `summary` holds the step, the `slot-line` filled in, and for a Daily its number. Storage persistence is asked for at the first save.

## The title

- **Continue** loads the numbered slot played last: the newest by its saved time, since play saves every step. It is missing when no numbered slot holds a save.
- **New** lists the numbered slots. An empty one starts a game at once with a fresh seed. A full one asks again, naming what it holds, and its save goes to the slot's backup.
- **Daily**, when `shell.json` turns it on: `n` is the number of days from 2026-01-01 to the device's local date, and the seed is `daily:<n>`. Its slot is `daily`. When it holds Daily `n`, the button loads it; otherwise a new Daily starts there. The page reads the date; the sim never does.
- **Saves** and **Settings** open their screens.
- **The update prompt** shows here only: a new player waits, and Reload is safe, since the slot was saved at its last step. Never in play. No spec checks it: Chromium fetches a service worker's script outside Playwright's routing, so a spec can't make a new version arrive. The editor's own update toast is in the same place.

## Saves

For each slot, numbered and Daily:
- **Load**. A save that won't load falls back to its backup, and the shell says so. One with no good backup stays where it is, with what went wrong.
- **Save file**, the save's JSON as it is stored, read without loading it.
- **Copy code**, an `EB1` code ([saves.md](saves.md#codes)). Where the clipboard is refused, the code is shown to copy by hand.
- **Delete**, on a second press.
- **A slot whose summary can't be read** is listed as such, never as empty, and can still be loaded, saved out or deleted.

Then:
- **Bring in a save:** a code pasted or a file picked, put in a slot chosen next; a full slot asks again. A save of another game or edition is refused, naming it.
- **Set aside:** the saves quarantine kept, each with why, to save as a file and then delete on a second press.

## Pause

- **Opened by** Escape or a pad's B when nothing is open to close, a pad's Start, or the bar's Pause button.
- **Holds** Resume, Saves, Settings and Quit to title. Escape and B resume.
- **The sim isn't told.** A game that steps when the player acts has nothing to stop, and the slot is saved at its last step, so quitting loses nothing.

## Settings

Kept per game and edition at `eb/<game>/<edition>/settings`, outside the saves, each field read on its own so a bad one falls back to its default.

| Setting | Values | Applied as |
| --- | --- | --- |
| Text | normal, large, larger | `--eb-text-scale` 1, 1.2, 1.4 on the shell's root |
| Motion | as the device says, less, full | `data-motion` on the shell's root: toasts and scrolling stop moving with less |
| Controls | — | A list of the keys and pad buttons, to read |

Volumes come with M4.8's audio.

## Crash

- **When:** an error nothing caught on the page, a promise rejected with nothing to hear it, or a worker that fails during a step or dies. Not ResizeObserver's loop notices or a bare "Script error." (Dirtbag's crash.ts).
- **What:** play stops, and a screen drawn in plain DOM, without Preact, covers the page: what failed, Reload, Save file (the slot's save read from storage as it is, never loaded), and Copy report (the message, the game, its build, the slot and the step). Everything under it is made inert.
- **Where:** on the player page. In the Play panel, a failure stops the game on a screen inside the shell instead, since covering the editor would hide the author's work; the editor's own error toast still hears what nothing caught.

## Pack

Format 6 adds `ui.shell`, the file as written. A pack without one is written in the lowest format that holds it.

## Checks

| Code | When |
| --- | --- |
| E047 | `ui/shell.json` isn't valid: an unknown field, `slots` outside 1 to 5, or a `slot-line` whose braces don't close. |
| E048 | Its `slot-line` names a fact the game can't read. |

## Open questions

1. **Real-time games.** Pause stops nothing in the sim. A game whose time runs on its own needs pause to stop its clock.
2. **Keeping games on the player page.** Each visit opens the file again. The export (M4.10) bundles its pack, so only the player page asks.
3. **Saves across editions.** A demo's save can't go into the full game's slots. Moving one needs a rule about what it keeps.
4. **Playtime in a slot.** The summary has the step and the line, not the time played.
5. **High contrast.** A second set of theme colours, checked as the first is, would let a player ask for more contrast.
